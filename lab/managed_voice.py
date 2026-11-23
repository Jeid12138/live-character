"""On-demand private Breeze installation and process supervision."""
import atexit
import base64
import hashlib
import json
import os
import pathlib
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import tempfile
import urllib.request
import urllib.error
import urllib.parse
import uuid
import zipfile
from contextlib import closing, contextmanager

_lock = threading.RLock()
_release_lock = threading.Lock()
_process = None
_replies = None
_worker_exited = None
_cancel_path = None
_worker_generation = threading.Event()
_state = {'state':'not_installed','ready':False}
_piper_state = {}
_install_lock = threading.Lock()
_active_requests = 0
BREEZE_IDLE_TIMEOUT = 90
BREEZE_SLEEP_TIMEOUT = 20
BREEZE_CANCEL_TIMEOUT = 10
BREEZE_ID = 'breeze-bf16'
BREEZE_NAME = 'Breeze-TTS-2-bf16.safetensors'
NODE_REVISION = '53d899bfaa1ea37badc58f901900c068a9755116'
BREEZE_ASSET_REVISION = 'a6bfd9d0d4e8b3b61c3a5ed3ecf55468c8ab88e4'
BREEZE_REPO = 'drbaph/Breeze-TTS-2-comfyui'
BREEZE_CODEC = 'audio_tokenizer/model.safetensors'
BREEZE_CODEC_INTEGRITY = (682293092, '836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258')
BOOTSTRAP_URL = 'https://www.nuget.org/api/v2/package/python/3.12.10'


def download_source():
    try:
        value=json.loads((home().parent/'download-source.json').read_text(encoding='utf-8')).get('source')
        return value if value in ('official','china') else 'official'
    except (OSError,ValueError):
        return 'official'


def source_routes(source=None):
    china=(source or download_source())=='china'
    return {'pip':'https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple' if china else 'https://pypi.org/simple',
            'hf':'https://hf-mirror.com' if china else 'https://huggingface.co',
            'python':BOOTSTRAP_URL,'torch':'https://download.pytorch.org/whl/cu128',
            'code':'https://codeload.github.com/Saganaki22/ComfyUI-Breeze-TTS-2/zip/'+NODE_REVISION}


def home():
    prefs = pathlib.Path(os.environ.get('PET_ASSETS','assets.json')).resolve()
    try:
        settings = json.loads(prefs.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        settings = {}
    return pathlib.Path(settings.get('assetRoot') or prefs.parent / 'asset') / 'voice-models' / 'breeze-managed'


def relocate_environment(root):
    # Use the physical asset location so a junction does not pin the venv to
    # a removable path. Recreating the venv can replace a running launcher.
    root = root.resolve()
    cfg = root / 'venv' / 'pyvenv.cfg'
    base = root / 'python' / 'tools'
    if os.name != 'nt' or not cfg.is_file():
        return
    text = cfg.read_text(encoding='utf-8')
    if any(line.startswith('home = ') and pathlib.Path(line[7:]) == base for line in text.splitlines()):
        return
    values = {'home':str(base),'executable':str(base/'python.exe')}
    lines = [line for line in text.splitlines() if line.partition(' = ')[0] not in ('home','executable','command')]
    updated = [f'{key} = {value}' for key, value in values.items()] + lines
    staging = tempfile.NamedTemporaryFile(mode='w', dir=cfg.parent, encoding='utf-8', delete=False)
    temporary = pathlib.Path(staging.name)
    try:
        with staging:
            staging.write('\n'.join(updated)+'\n')
        temporary.replace(cfg)
    finally:
        temporary.unlink(missing_ok=True)


def python_path(root=None):
    return (root or home()) / 'venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')

def breeze_weights(root=None):
    return (root or home()) / 'models' / 'drbaph_Breeze-TTS-2-comfyui' / BREEZE_NAME

def breeze_installed(root=None):
    root = root or home()
    return (breeze_weights(root).is_file() and all(breeze_components(root).values()))

def distribution_present(packages, name, entry, version='*'):
    metadata = packages.glob(f'{name}-{version}.dist-info/METADATA')
    entrypoint = packages/entry
    return entrypoint.is_file() and entrypoint.stat().st_size > 0 and any(p.is_file() for p in metadata)

def codec_ready(model):
    codec = model/BREEZE_CODEC
    files = ('config.json','tokenizer.json','tokenizer_config.json',
             'audio_tokenizer/config.json')
    return (codec.is_file() and codec.stat().st_size == BREEZE_CODEC_INTEGRITY[0]
            and all((model/path).is_file() and (model/path).stat().st_size > 0 for path in files))

def breeze_components(root):
    packages = root/'venv/Lib/site-packages'
    dependencies = (
        ('transformers','transformers/__init__.py','5.3.0'),
        ('accelerate','accelerate/__init__.py','*'),('numpy','numpy/__init__.py','*'),
        ('safetensors','safetensors/__init__.py','*'),('soundfile','soundfile.py','*'),
        ('huggingface_hub','huggingface_hub/__init__.py','*'),('tqdm','tqdm/__init__.py','*'),
    )
    return {
        'python':(root/'python/tools/python.exe').is_file(),
        'venv':python_path(root).is_file() and (root/'venv/pyvenv.cfg').is_file(),
        'cuda':distribution_present(packages,'torch','torch/lib/torch_cuda.dll','2.11.0+cu128') and
               distribution_present(packages,'torchaudio','torchaudio/__init__.py','2.11.0+cu128'),
        'deps':all(distribution_present(packages,*item) for item in dependencies),
        'node':(root/('ComfyUI-Breeze-TTS-2-'+NODE_REVISION)/'__init__.py').is_file(),
        'assets':codec_ready(breeze_weights(root).parent),
    }

def bindings_path():
    return home().parent/'environments.json'

def bindings():
    try:
        return json.loads(bindings_path().read_text(encoding='utf-8'))
    except (OSError,ValueError):
        return {}

def bound_root(engine):
    path = bindings().get(engine)
    return pathlib.Path(path).resolve() if isinstance(path,str) else None

def external_python(root,engine):
    if engine == 'breeze':
        base, packages = root/'python/tools/python.exe', root/'venv/Lib/site-packages'
        if base.is_file() and packages.is_dir():
            return [str(base),'-B','-u','-s','-c',
                    'import runpy,site,sys; site.addsitedir(sys.argv.pop(1)); runpy.run_path(sys.argv.pop(1),run_name="__main__")',
                    str(packages)]
    for path in (root/'Scripts/python.exe',root/'venv/Scripts/python.exe',root/'python/tools/python.exe',root/'python.exe'):
        if path.is_file():
            return [str(path),'-B','-u','-s']
    return None

def breeze_assets_ready(root):
    weights = breeze_weights(root)
    return all(p.is_file() for p in (weights,
        root/('ComfyUI-Breeze-TTS-2-'+NODE_REVISION)/'__init__.py',
        )) and codec_ready(weights.parent)

def external_breeze():
    external = bound_root('breeze')
    if external and external_python(external,'breeze'):
        assets = external if breeze_assets_ready(external) else home().resolve()
        if breeze_assets_ready(assets):
            return external,assets
    return None

def selected_breeze():
    external = external_breeze()
    if external:
        return external[1]
    return home().resolve()

def piper_voices():
    folder = home().parent
    for path in sorted(folder.glob('*.onnx')):
        config = path.with_suffix('.onnx.json')
        if any(p.is_symlink() or not p.is_file() for p in (path, config)):
            continue
        try:
            if config.stat().st_size > 1024 * 1024:
                continue
            options = json.loads(config.read_text(encoding='utf-8'))
            if not isinstance(options['phoneme_id_map'], dict) or not isinstance(options['audio']['sample_rate'], int):
                continue
        except (OSError, ValueError, KeyError, TypeError):
            continue
        model_id = 'piper-' + hashlib.sha256(path.name.encode()).hexdigest()
        yield model_id, path

def piper_root():
    return home().parent / 'piper-runtime'

def piper_python(root=None):
    return (root or piper_root())/'python'/'tools'/'python.exe'

def piper_installed(root=None):
    root = root or piper_root()
    packages = root/'python/tools/Lib/site-packages'
    return (piper_python(root).is_file() and
            distribution_present(packages,'piper_tts','piper/__init__.py','1.4.1') and
            distribution_present(packages,'onnxruntime','onnxruntime/__init__.py'))

def selected_piper():
    external = bound_root('piper')
    return external if external and external_python(external,'piper') else piper_root().resolve()

def piper_ready():
    runtime = selected_piper()
    return piper_installed(runtime) or (runtime != piper_root().resolve() and external_python(runtime,'piper') is not None)

def verify_environment(root,engine):
    command = external_python(root,engine)
    if not command:
        return False
    check = ('from piper import PiperVoice; import onnxruntime'
             if engine == 'piper' else
             'import torch,torchaudio,transformers,soundfile; assert torch.cuda.is_available(); assert transformers.__version__=="5.3.0"')
    try:
        with tempfile.TemporaryDirectory() as folder:
            script = pathlib.Path(folder)/'verify.py'
            script.write_text(check,encoding='utf-8')
            return subprocess.run([*command,str(script)],stdin=subprocess.DEVNULL,capture_output=True,timeout=45,
                                  creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)).returncode == 0
    except (OSError,subprocess.SubprocessError):
        return False

def bind_environment(body):
    model = body.get('model')
    engine = 'breeze' if model == BREEZE_ID else 'piper' if model in dict(piper_voices()) else None
    if not isinstance(body.get('directory'),str) or not body['directory'].strip():
        raise ValueError('请选择环境目录')
    root = pathlib.Path(body['directory']).resolve()
    choices = [engine] if engine else ['breeze','piper'] if not model else []
    verified = [kind for kind in choices if
                (kind!='breeze' or breeze_assets_ready(root) or breeze_assets_ready(home())) and
                verify_environment(root,kind)]
    if not verified:
        raise ValueError('该目录未通过所选引擎的 Python 与推理依赖检查。Breeze 还需 CUDA 及配套权重和推理文件')
    if len(verified)>1:
        raise ValueError('该目录同时含多个兼容的推理环境，请先选择要配置的模型')
    engine, = verified
    with _install_lock:
        if installing() or _active_requests:
            raise ValueError('LC 正在安装环境或处理 AI 请求，请稍后重试')
        with _lock:
            stop()
            file = bindings_path()
            file.parent.mkdir(parents=True,exist_ok=True)
            data = {**bindings(),engine:str(root)}
            temporary = file.with_suffix('.tmp')
            temporary.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
            temporary.replace(file)
    return {**status(body),'installed':True,'engine':engine,'message':'已核对并绑定现有推理环境，请选择模型后试播'}

def models():
    folder = home().parent
    result = []
    if (folder/BREEZE_NAME).is_file() or breeze_weights(selected_breeze()).is_file():
        result.append(dict(id=BREEZE_ID,label='Breeze TTS2 BF16',engine='breeze',
                           download='独立 Python、PyTorch CUDA、Breeze 推理依赖、分词器和音频编解码器',
                           space='建议预留 20 GB（含安装缓存和可能的模型副本）',
                           reference=True,installed=bool(external_breeze()) or breeze_installed()))
    for model_id, path in piper_voices():
        result.append(dict(id=model_id,label=path.stem,engine='piper',
                           download='独立 Python、Piper 和 ONNX Runtime（CPU）',
                           space='建议预留 1 GB（含安装缓存）',
                           reference=False,installed=piper_ready()))
    return {'directory':str(folder),'models':result}


def installing():
    return _state.get('state') == 'installing' or _piper_state.get('state') == 'installing'


@contextmanager
def ai_request():
    global _active_requests
    with _install_lock:
        if installing():
            raise ValueError('正在配置本地语音环境，请等待安装完成后再试')
        _active_requests += 1
    try:
        yield
    finally:
        with _install_lock:
            _active_requests -= 1


def status(body=None):
    info = _model_status(body)
    if info['installed']:
        missing = []
    elif (body or {}).get('model') == BREEZE_ID:
        root = home()
        missing = []
        parts = breeze_components(root)
        if not parts['python']:
            missing.append(('独立 Python',15_000_000))
        if not parts['venv']:
            missing.append(('创建 Python 虚拟环境',0))
        for label,size,ready in (
            ('PyTorch CUDA',3_000_000_000,parts['cuda']),
            ('Breeze 推理依赖',140_000_000,parts['deps']),
            ('Breeze 推理代码',3_000_000,parts['node']),
            ('分词器和音频编解码器',700_000_000,parts['assets']),
        ):
            if not ready:
                missing.append((label,size))
    elif (body or {}).get('model') in dict(piper_voices()):
        missing = [('Piper 和 ONNX Runtime',65_000_000)]
        if not piper_python().is_file():
            missing.insert(0,('独立 Python',15_000_000))
    else:
        missing = []
    return {**info,'installing':installing(),'missingComponents':[label for label,_ in missing],
            'downloadBytes':sum(size for _,size in missing)}


def _model_status(body=None):
    model = (body or {}).get('model')
    if model and model != BREEZE_ID:
        if model not in dict(piper_voices()):
            return {'state':'not_installed','ready':False,'installed':False}
        installed = piper_ready()
        state = _piper_state or {
            'state':'installed' if installed else 'not_installed',
            'ready':False,
            'message':'推理依赖已准备' if installed else '尚未配置 Piper 环境',
        }
        if not installed and state['state'] in ('ready','installed'):
            state = {'state':'not_installed','ready':False,'message':'Piper 环境缺少文件，请重新配置'}
        return {**state,'installed':installed,'directory':str(piper_root())}
    installed = bool(external_breeze()) or breeze_installed()
    state = _state
    if installed and state['state'] == 'not_installed':
        state = {'state':'installed','ready':False,'message':'依赖已准备，首次试播将加载模型'}
    if not installed and state['state'] in ('ready','installed'):
        state = {'state':'not_installed','ready':False,'message':'Breeze 环境缺少文件，请重新配置'}
    return {**state, 'directory':str(home()), 'installed':installed}


def _run(command, log, timeout=1800):
    arguments = command[1:2] if len(command) > 1 and command[1] == '-c' else command[1:3]
    print(f'开始执行 {pathlib.Path(command[0]).name} {" ".join(map(str,arguments))}',file=log,flush=True)
    offset = os.fstat(log.fileno()).st_size
    try:
        subprocess.run([str(x) for x in command], check=True, stdin=subprocess.DEVNULL,stdout=log, stderr=log,
                       timeout=timeout, creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    except subprocess.CalledProcessError as error:
        log.flush()
        try:
            with pathlib.Path(log.name).open('rb') as stream:
                stream.seek(0,2)
                stream.seek(max(offset,stream.tell()-65536))
                lines=stream.read().decode('utf-8',errors='replace').splitlines()
            candidates = [line.strip() for line in lines
                          if re.search(r'error|exception|failed|timeout|denied|无法|失败',line,re.I)]
            exceptions = [line for line in lines if re.match(r'[\w.]+(?:Error|Exception|Timeout):', line)]
            relevant = exceptions or candidates or lines
            if len(relevant) > 3:
                relevant = [relevant[0], *relevant[-2:]]
            detail = ' / '.join(relevant) or '子进程没有输出，请查看安装日志'
            detail=re.sub(r'(?i)(?:https?|socks[45]h?)://\S+', '[下载地址]',detail)
            detail=re.sub(r'(?i)(bearer\s+|token[=: ]+|api[_-]?key[=: ]+)\S+',r'\1[已隐藏]',detail)
            detail=re.sub(r'\b(?:hf_|sk-)[A-Za-z0-9_-]+','[已隐藏]',detail)
            detail=detail[:700]
        except OSError:
            detail='请查看安装日志'
        raise ValueError(f'依赖安装失败（退出码 {error.returncode}）：{detail}') from None


def _download(url, target, integrity=None):
    target = pathlib.Path(target)
    partial = target.with_name(target.name + '.part')
    offset = partial.stat().st_size if partial.exists() else 0
    if integrity:
        size, sha256 = integrity
        if offset == size and _verify_download(partial, target, size, sha256):
            return
        if offset >= size:
            partial.unlink(missing_ok=True)
            offset = 0
        headers = {'Range':f'bytes={offset}-{size - 1}'}
    else:
        headers = {'Range':f'bytes={offset}-'} if offset else {}
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            resumed = offset and response.status == 206
            if integrity and response.status == 206 and response.headers.get('Content-Range') != f'bytes {offset}-{size - 1}/{size}':
                raise ValueError('下载服务器返回不匹配的文件范围，请换源重试')
            if resumed and not response.headers.get('Content-Range','').startswith(f'bytes {offset}-'):
                raise ValueError('下载服务器返回不匹配的续传位置，请换源重试')
            expected = response.headers.get('Content-Length')
            received = 0
            with partial.open('ab' if resumed else 'wb') as output:
                while True:
                    chunk = response.read(256 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    received += len(chunk)
            if expected is not None and received != int(expected):
                raise ValueError('下载中断，已保留进度，请重试')
        if integrity:
            if not _verify_download(partial, target, size, sha256):
                raise ValueError('下载校验失败，请重试')
        else:
            partial.replace(target)
    except urllib.error.HTTPError as error:
        raise ValueError(f'下载失败：HTTP {error.code}（{urllib.parse.urlsplit(url).hostname}）') from error
    except urllib.error.URLError as error:
        reason = type(error.reason).__name__ if integrity else error.reason
        raise ValueError(f'下载连接失败：{reason}') from error


def _verify_download(partial, target, size, sha256):
    if partial.stat().st_size != size:
        return False
    with partial.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    if digest != sha256:
        partial.unlink()
        return False
    partial.replace(target)
    return True


def _extract(archive, directory):
    with zipfile.ZipFile(archive) as package:
        for member in package.infolist():
            if not (directory/member.filename).resolve().is_relative_to(directory.resolve()):
                raise ValueError('下载的压缩包路径无效')
        package.extractall(directory)


def install(body):
    global _state
    if body.get('confirmed') is not True:
        raise ValueError('请先确认下载内容和磁盘占用')
    model = body.get('model')
    if not isinstance(model,str) or model not in {entry['id'] for entry in models()['models']}:
        raise ValueError('请先选择已识别的本地模型')
    with _install_lock:
        if status(body)['installed']:
            return status(body)
        if installing():
            if (model == BREEZE_ID and _state['state'] == 'installing') or (
                model != BREEZE_ID and _piper_state.get('state') == 'installing'
            ):
                return status(body)
            raise ValueError('正在配置另一套本地语音环境，请等待安装完成后再试')
        if _active_requests:
            raise ValueError('LC 正在处理 AI 请求，请等待请求结束后再配置语音环境')
        source = body.get('source',download_source())
        if source not in ('official','china'):
            raise ValueError('无效下载来源')
        settings_path=home().parent/'download-source.json'
        settings_path.parent.mkdir(parents=True,exist_ok=True)
        settings_path.write_text(json.dumps({'source':source}),encoding='utf-8')
        if model != BREEZE_ID:
            return _start_piper(body)
        _state = {'state':'installing','ready':False,'message':'正在准备独立语音环境；首次需要下载 CUDA 依赖和音频编解码器'}
        threading.Thread(target=_install, args=(None,), daemon=True).start()
    return status(body)


def _start_piper(body):
    global _piper_state
    if _piper_state.get('state') != 'installing':
        _piper_state = {'state':'installing','ready':False,'message':'正在下载 Piper 的独立 Python 环境'}
        threading.Thread(target=_install_piper, daemon=True).start()
    return status(body)


def _install_piper():
    global _piper_state
    root = piper_root()
    try:
        root.mkdir(parents=True, exist_ok=True)
        with (root/'install.log').open('a',encoding='utf-8') as log:
            if not piper_python().is_file():
                archive = root/'python.nupkg'
                if not zipfile.is_zipfile(archive):
                    _download(BOOTSTRAP_URL,archive)
                _extract(archive,root/'python')
            _piper_state = {'state':'installing','ready':False,'message':'正在安装 Piper 和 ONNX Runtime'}
            _run([piper_python(), '-m','pip','--isolated','install','--index-url',source_routes()['pip'],
                  '--only-binary=:all:','--force-reinstall','piper-tts==1.4.1'], log)
            _run([piper_python(),'-c','from piper import PiperVoice'], log)
        (root/'installed.json').write_text('{}',encoding='utf-8')
        _piper_state = {'state':'installed','ready':False,'message':'Piper 环境已准备，保存后可试播'}
    except Exception as error:
        _piper_state = {'state':'error','ready':False,'message':str(error),'log':str(root/'install.log')}


def _synthesize_piper(model, text):
    from companion import interrupt_on_voice_cancel
    if model not in dict(piper_voices()):
        raise ValueError('未找到所选 Piper 模型和配套 JSON')
    runtime = selected_piper()
    if not piper_ready():
        raise ValueError('Piper 环境尚未准备完成')
    path = dict(piper_voices())[model]
    script = ('import sys,wave; from piper import PiperVoice; '
              'voice=PiperVoice.load(sys.argv[1]); '
              'out=wave.open(sys.argv[2],"wb"); voice.synthesize_wav(sys.stdin.read(),out); out.close()')
    with tempfile.TemporaryDirectory() as folder:
        wav = pathlib.Path(folder)/'speech.wav'
        try:
            command = external_python(runtime,'piper') if runtime != piper_root().resolve() else [str(piper_python(runtime)),'-B']
            with subprocess.Popen([*command,'-X','utf8','-c',script,str(path),str(wav)],
                                  stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                                  encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)) as process:
                interrupt_on_voice_cancel(process.kill)
                try:
                    process.communicate(input=text,timeout=120)
                except subprocess.TimeoutExpired:
                    process.kill()
                    raise TimeoutError('Piper 合成超时') from None
                if process.returncode:
                    raise ValueError('Piper 合成失败，请检查所选模型及配套 JSON')
        except TimeoutError:
            raise
        except (OSError,subprocess.SubprocessError):
            raise ValueError('Piper 合成失败，请检查所选模型及配套 JSON') from None
        if not wav.is_file() or not 44 < wav.stat().st_size <= 16 * 1024 * 1024:
            raise ValueError('Piper 未返回有效的语音音频')
        return {'audio':{'mime':'audio/wav','base64':base64.b64encode(wav.read_bytes()).decode('ascii')}}


def _breeze_asset_script(endpoint):
    mirror = endpoint == source_routes('china')['hf']
    files = ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json',
             'special_tokens_map.json', 'audio_tokenizer/config.json', 'audio_tokenizer/configuration.json',
             'audio_tokenizer/preprocessor_config.json']
    if not mirror:
        files.append(BREEZE_CODEC)
    return (
        "import ipaddress, os, re, sys\n"
        # HTTPX expects bare IPv6 addresses in NO_PROXY. Keep urllib's parent-process
        # environment intact because its bypass matcher expects brackets for IPv6.
        "def normalize_bypass(entry):\n"
        "    rule = entry.strip()\n"
        r"    match = re.fullmatch(r'\[([^\[\]]+)\](?::([0-9]+))?', rule)" "\n"
        "    if not match:\n"
        "        return entry\n"
        "    address, port = match.groups()\n"
        "    try:\n"
        "        ipaddress.IPv6Address(address)\n"
        "    except ValueError:\n"
        "        return entry\n"
        "    return entry.replace(rule, 'all://' + rule if port else address, 1)\n"
        "for name in list(os.environ):\n"
        "    if name.lower() == 'no_proxy':\n"
        "        original = os.environ[name]\n"
        "        normalized = ','.join(map(normalize_bypass, original.split(',')))\n"
        "        if normalized != original:\n"
        "            os.environ[name] = normalized\n"
        f"os.environ['HF_ENDPOINT'] = {endpoint!r}\n"
        + ("os.environ['HF_HUB_DISABLE_XET'] = '1'\n" if mirror else "")
        + "from huggingface_hub import snapshot_download\n"
        f"snapshot_download({BREEZE_REPO!r}, "
        f"revision={BREEZE_ASSET_REVISION!r}, local_dir=sys.argv[1], token=False, "
        f"allow_patterns={files!r})\n"
    )


def _install(checkpoint):
    global _state
    root = home()
    log_path = root/'install.log'
    try:
        root.mkdir(parents=True,exist_ok=True)
        with log_path.open('a',encoding='utf-8') as log:
            print('开始检查 Breeze 模型和现有组件',file=log,flush=True)
        from local_voice import inspect_checkpoint
        candidates = [pathlib.Path(checkpoint)] if checkpoint else [root.parent/BREEZE_NAME,breeze_weights()]
        source = next((p for p in candidates if p.name == BREEZE_NAME and p.is_file()),None)
        if source is None:
            raise ValueError('请先将 Breeze-TTS-2-bf16.safetensors 导入本地语音模型资产目录')
        inspect_checkpoint(source)
        with log_path.open('a',encoding='utf-8') as log:
            parts = breeze_components(root)
            if not parts['venv']:
                if not parts['python']:
                    _state['message']='正在下载并解压独立 Python'
                    bootstrap = root/'python.nupkg'
                    if not zipfile.is_zipfile(bootstrap):
                        _download(BOOTSTRAP_URL,bootstrap)
                    _extract(bootstrap,root/'python')
                _state['message']='正在创建虚拟环境并初始化 pip（使用本地 Python）'
                _run([root/'python'/'tools'/'python.exe','-m','venv','--without-pip',root/'venv'],log,timeout=120)
            relocate_environment(root)
            py = python_path()
            probe = subprocess.run([str(py),'-m','pip','--version'],stdin=subprocess.DEVNULL,stdout=log, stderr=log,
                                   timeout=30,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            if probe.returncode:
                _state['message']='正在初始化虚拟环境 pip（使用本地 Python）'
                _run([py,'-m','ensurepip','--upgrade'],log,timeout=120)
            _state['message']='正在安装 PyTorch CUDA（下载量较大）'
            if not parts['cuda']:
                _run([py,'-m','pip','install','--force-reinstall','torch==2.11.0+cu128','torchaudio==2.11.0+cu128','--index-url',source_routes()['torch']],log)
            if not parts['deps']:
                _state['message']='正在安装 Breeze 推理依赖'
                dependencies=['transformers==5.3.0','accelerate','numpy','safetensors','soundfile','huggingface_hub','tqdm']
                _run([py,'-m','pip','install','--index-url',source_routes()['pip'],*dependencies],log)
                if not breeze_components(root)['deps']:
                    _run([py,'-m','pip','install','--force-reinstall','--no-deps','--index-url',source_routes()['pip'],*dependencies],log)
            if not parts['node']:
                archive = root/'node.zip'
                _state['message']='正在下载 Breeze 推理代码'
                _download('https://codeload.github.com/Saganaki22/ComfyUI-Breeze-TTS-2/zip/'+NODE_REVISION,archive)
                _extract(archive,root)
            models = root/'models'/'drbaph_Breeze-TTS-2-comfyui'; models.mkdir(parents=True,exist_ok=True)
            target = models/source.name
            if not target.exists():
                try: os.link(source,target)
                except OSError:
                    temporary = target.with_suffix('.copying')
                    shutil.copy2(source,temporary)
                    if temporary.stat().st_size != source.stat().st_size:
                        raise ValueError('权重复制不完整')
                    temporary.replace(target)
            # Explicit allow-list avoids downloading any alternative transformer checkpoint.
            _state['message']='正在准备分词器和音频编解码器'
            if not parts['assets']:
                endpoint = source_routes()['hf']
                try:
                    _run([py,'-c',_breeze_asset_script(endpoint),models],log)
                except subprocess.TimeoutExpired:
                    raise ValueError('下载等待超时。请检查下载源和代理设置后重试。') from None
                except ValueError as error:
                    raise ValueError(f'{error}。请检查下载源和代理设置后重试，或切换下载源后重试。') from None
                if endpoint == source_routes('china')['hf']:
                    codec = models/BREEZE_CODEC
                    if not codec.is_file() or codec.stat().st_size != BREEZE_CODEC_INTEGRITY[0]:
                        print(f'开始从 {endpoint} 下载音频编解码器（支持断点续传）',file=log,flush=True)
                        url = f'{endpoint}/{BREEZE_REPO}/resolve/{BREEZE_ASSET_REVISION}/{BREEZE_CODEC}?download=true'
                        _download(url,codec,BREEZE_CODEC_INTEGRITY)
            _run([py,'-c','import torch,torchaudio,transformers; assert torch.cuda.is_available(), "CUDA unavailable"'],log)
        (root/'installed.json').write_text(json.dumps({'source':str(source)}),encoding='utf-8')
        _state = {'state':'installed','ready':False,'message':'依赖已安装，首次试播将验证模型加载与合成'}
    except Exception as error:
        message = _state.get('message','配置推理环境')+'失败：'+str(error)
        try:
            with log_path.open('a',encoding='utf-8') as log:
                print(message,file=log,flush=True)
        except OSError:
            pass
        _state = {'state':'error','ready':False,'message':message,'log':str(log_path)}


def stop():
    global _process, _cancel_path, _worker_exited
    process = _process
    if process is not None:
        if process.poll() is None:
            process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        try: process.stdin.close()
        except OSError: pass
    # An external venv launcher can exit before its child closes the pipe.
    if _worker_exited is not None and not _worker_exited.wait(timeout=5):
        raise ValueError('未能确认本地推理进程已退出，请查看 worker.log')
    _process = _worker_exited = None
    if _cancel_path is not None:
        try: _cancel_path.unlink(missing_ok=True)
        except OSError: pass
        _cancel_path = None


atexit.register(stop)


def release_breeze(idle_vram_optimization=False):
    """Cancel queued and active calls, then release this lab's worker."""
    global _worker_generation
    with _release_lock:
        _worker_generation.set()
        with _lock:
            try:
                process = _process
                if idle_vram_optimization is True and process is not None and process.poll() is None:
                    # The preceding request has finished or acknowledged cancellation.
                    try:
                        process.stdin.write('{"op":"sleep"}\n')
                        process.stdin.flush()
                        response = _replies.get(timeout=BREEZE_SLEEP_TIMEOUT)
                        if response is not None and json.loads(response).get('sleeping') is True:
                            return {'sleeping': True}
                    except (AttributeError, OSError, ValueError, queue.Empty):
                        pass
                stop()
                return {'sleeping': False}
            finally:
                _worker_generation = threading.Event()


def synthesize(body):
    from companion import voice_cancelled
    model = body.get('model')
    if body.get('mode') == 'managed' and not model:
        raise ValueError('请先选择要试播的本地模型')
    if model and model != BREEZE_ID:
        text = body.get('text')
        if not isinstance(text,str) or not text.strip() or len(text)>2000:
            raise ValueError('文本长度须为 1 至 2000 字符')
        return _synthesize_piper(model,text)
    with closing(breeze_responses(body, streaming=False, cancelled=voice_cancelled)) as responses:
        return next(responses, None)


def stream(body, cancelled):
    with closing(breeze_responses(body, streaming=True, cancelled=cancelled)) as responses:
        for result in responses:
            yield base64.b64decode(result['pcm'], validate=True)


def cancel_breeze_request(streaming):
    """Discard unfinished audio and wait for the worker to finish this request."""
    deadline = time.monotonic() + BREEZE_CANCEL_TIMEOUT
    try:
        _cancel_path.touch(exist_ok=True)
        while time.monotonic() < deadline:
            response = _replies.get(timeout=max(0, deadline - time.monotonic()))
            if response is None:
                break
            result = json.loads(response)
            if result.get('cancelled') is True or result.get('error'):
                return True
            if result.get('done') is True or (not streaming and 'audio' in result):
                return True
    except (AttributeError, OSError, ValueError, queue.Empty):
        pass
    return False


def breeze_responses(body, *, streaming, cancelled=lambda: False):
    global _process, _replies, _state, _cancel_path, _worker_exited
    generation = _worker_generation
    def is_cancelled():
        return generation.is_set() or cancelled()

    while not _lock.acquire(timeout=.2):
        if is_cancelled():
            return
    try:
        if is_cancelled():
            return
        external = external_breeze()
        root = external[1] if external else home().resolve()
        if not external and not breeze_installed(root):
            raise ValueError('本地语音尚未准备完成，请先安装依赖并查看准备状态')
        if _process is None or _process.poll() is not None:
            stop()
            app_worker = pathlib.Path(__file__).with_name('breeze_worker.py')
            writable = home().resolve()
            if not external:
                relocate_environment(root)
                interpreter = external_python(root, 'breeze') if os.name == 'nt' else None
                command = [*(interpreter or [str(python_path(root)), '-B', '-u']), str(app_worker)]
            else:
                command = [*external_python(external[0],'breeze'),str(app_worker)]
            writable.mkdir(parents=True,exist_ok=True)
            _cancel_path = writable / ('cancel-' + uuid.uuid4().hex)
            command += ['--node-dir',str(root/('ComfyUI-Breeze-TTS-2-'+NODE_REVISION)),'--models-dir',str(root/'models'),'--cancel-file',str(_cancel_path)]
            with (writable/'worker.log').open('a',encoding='utf-8') as log:
                _process = subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=log,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            _replies = queue.Queue()
            _worker_exited = threading.Event()
            process, replies = _process, _replies
            exited = _worker_exited
            def reader():
                try:
                    with process.stdout:
                        for line in process.stdout:
                            replies.put(line)
                finally:
                    exited.set()
                    replies.put(None)
            threading.Thread(target=reader,daemon=True).start()
        complete = submitted = False
        try:
            _cancel_path.unlink(missing_ok=True)
            request_body = dict(body, streaming=streaming)
            request_body.pop('op', None)
            request = json.dumps(request_body,ensure_ascii=False)+'\n'
            process, replies = _process, _replies
            # A large reference can fill the pipe while Python imports Torch.
            # Keep the request thread free to enforce cancellation and timeout.
            def submit():
                try:
                    process.stdin.write(request)
                    process.stdin.flush()
                except (OSError, ValueError):
                    replies.put(None)

            writer = threading.Thread(target=submit,daemon=True)
            writer.start()
            submitted = True
            deadline = time.monotonic() + BREEZE_IDLE_TIMEOUT
            while not is_cancelled():
                try:
                    response = _replies.get(timeout=.2)
                except queue.Empty:
                    if time.monotonic() >= deadline:
                        raise TimeoutError('本地合成超时；查看 worker.log 了解模型加载状态') from None
                    continue
                if response is None:
                    raise ValueError('本地推理进程已退出，请查看 worker.log')
                result = json.loads(response)
                if result.get('error'):
                    complete = True
                    _state={'state':'error','ready':False,'message':result['error']}
                    raise ValueError(result['error'])
                if 'progress' in result:
                    deadline = time.monotonic() + BREEZE_IDLE_TIMEOUT
                    continue
                if streaming and 'pcm' in result:
                    deadline = time.monotonic() + BREEZE_IDLE_TIMEOUT
                    yield result
                    continue
                if streaming and result.get('done') is not True:
                    raise ValueError('本地推理进程返回了无效流式结果')
                complete = True
                _state={'state':'ready','ready':True,'message':'本地合成已验证'}
                if not streaming:
                    yield result
                return
        except GeneratorExit:
            if submitted and not complete and body.get('idleVramOptimization') is True:
                complete = cancel_breeze_request(streaming)
            raise
        else:
            if submitted and not complete and is_cancelled() and body.get('idleVramOptimization') is True:
                complete = cancel_breeze_request(streaming)
        finally:
            if not complete:
                stop()
    finally:
        _lock.release()
