"""Local, read-only character laboratory. Python 3.10+, no pip dependencies."""
import errno, os, select as socket_select, socket, sys, threading, hashlib, contextlib
import companion
import argparse, json, mimetypes, pathlib, urllib.parse, zipfile, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
ROOT = pathlib.Path(__file__).resolve().parent

class DirectoryArchive:
    def __init__(self, folder):
        self.root=pathlib.Path(folder).resolve()
        self.names=[]
        for file in self.root.rglob('*'):
            if file.is_symlink(): raise ValueError('模型目录包含链接')
            if file.is_file(): self.names.append(file.relative_to(self.root).as_posix())
    def __enter__(self): return self
    def __exit__(self,*args): self.close()
    def close(self): pass
    def namelist(self): return self.names
    def read(self,name):
        if name not in self.names: raise ValueError('模型文件不存在')
        file=(self.root/name).resolve()
        if not file.is_relative_to(self.root): raise ValueError('模型文件路径无效')
        return file.read_bytes()
    def open(self,name):
        import io
        return io.BytesIO(self.read(name))
    def getinfo(self,name):
        import types,zlib
        return types.SimpleNamespace(CRC=zlib.crc32(self.read(name)))
class PackedArchive:
    """Read RAR and 7z members through libarchive without extracting paths."""
    error='无法读取压缩包：请先解密加密文件、合并分卷，并检查文件是否损坏或格式不受支持'

    def __init__(self,file):
        import ctypes
        import ctypes.util
        self.file=str(pathlib.Path(file).resolve())
        library=str(pathlib.Path(os.environ.get('SystemRoot','C:/Windows'))/'System32'/'archiveint.dll') if os.name=='nt' else ctypes.util.find_library('archive')
        unavailable='系统缺少可用的 libarchive（Windows 为 archiveint.dll），无法读取 RAR/7Z'
        if not library: raise ValueError(unavailable)
        ptr=ctypes.c_void_p
        integer=ctypes.c_int
        wide=ctypes.c_wchar_p
        try:
            lib=ctypes.CDLL(library)
            def bind(name,result,*args):
                fn=getattr(lib,name)
                fn.restype=result
                fn.argtypes=args
                return fn
            self._new=bind('archive_read_new',ptr)
            self._free=bind('archive_read_free',integer,ptr)
            formats=('rar','rar5') if pathlib.Path(file).suffix.lower()=='.rar' else ('7zip',)
            self._formats=[bind('archive_read_support_format_'+fmt,integer,ptr) for fmt in formats]
            self._open=bind('archive_read_open_filename_w',integer,ptr,wide,ctypes.c_size_t)
            self._next=bind('archive_read_next_header',integer,ptr,ctypes.POINTER(ptr))
            self._pathname=bind('archive_entry_pathname_w',wide,ptr)
            self._filetype=bind('archive_entry_filetype',integer,ptr)
            self._read=bind('archive_read_data',ctypes.c_ssize_t,ptr,ptr,ctypes.c_size_t)
        except (OSError,AttributeError) as e:
            raise ValueError(unavailable) from e
        with self._reader() as reader:
            self.names=list(self._names(reader))
        if len(set(n.casefold() for n in self.names))!=len(self.names):
            raise ValueError('模型压缩包包含重复文件路径')

    @contextlib.contextmanager
    def _reader(self):
        reader=self._new()
        if not reader: raise ValueError(self.error)
        try:
            if any(support(reader)!=0 for support in self._formats) or self._open(reader,self.file,65536)!=0:
                raise ValueError(self.error)
            yield reader
        finally:
            self._free(reader)

    def _names(self,reader):
        import ctypes,stat
        entry=ctypes.c_void_p()
        while True:
            status=self._next(reader,ctypes.byref(entry))
            if status==1: return  # ARCHIVE_EOF
            if status!=0: raise ValueError(self.error)
            name=self._pathname(entry)
            if not name: raise ValueError(self.error)
            if self._filetype(entry)==stat.S_IFDIR and not name.endswith('/'):
                name+='/'
            part=pathlib.PurePosixPath(name)
            if '\\' in name or ':' in name or part.is_absolute() or '..' in part.parts or any(p.endswith((' ','.')) for p in part.parts):
                raise ValueError('模型压缩包路径不安全')
            yield name

    def __enter__(self): return self
    def __exit__(self,*args): pass
    def close(self): pass
    def namelist(self): return self.names

    def _chunks(self,reader):
        import ctypes
        buffer=ctypes.create_string_buffer(65536)
        while True:
            count=self._read(reader,buffer,len(buffer))
            if count<0: raise ValueError(self.error)
            if count==0: return
            yield memoryview(buffer)[:count]

    def read(self,name):
        if name not in self.names: raise ValueError('模型文件不存在')
        with self._reader() as reader:
            for member in self._names(reader):
                if member==name: return b''.join(bytes(chunk) for chunk in self._chunks(reader))
        raise ValueError('模型文件不存在')

    def extract_into(self,target):
        from itertools import zip_longest
        with self._reader() as reader:
            for expected,name in zip_longest(self.names,self._names(reader)):
                if name!=expected: raise ValueError(self.error)
                if name.endswith('/'): continue
                dest=target/name
                dest.parent.mkdir(parents=True,exist_ok=True)
                with dest.open('wb') as output:
                    for chunk in self._chunks(reader):
                        output.write(chunk)

    def open(self,name):
        import io
        return io.BytesIO(self.read(name))
    def getinfo(self,name):
        import types,zlib
        return types.SimpleNamespace(CRC=zlib.crc32(self.read(name)))

def open_archive(file):
    if pathlib.Path(file).is_dir(): return DirectoryArchive(file)
    if pathlib.Path(file).suffix.lower() in ('.rar','.7z'): return PackedArchive(file)
    return zipfile.ZipFile(file)
def extract_model(source,destination):
    target=pathlib.Path(destination)
    if target.exists(): raise ValueError('导入暂存目录已存在')
    with open_archive(source) as archive:
        names=archive.namelist()
        checked=set()
        for name in names:
            part=pathlib.PurePosixPath(name)
            if name.endswith('/'): continue
            if not name or '\\' in name or ':' in name or part.is_absolute() or '..' in part.parts or any(p.endswith((' ','.')) for p in part.parts): raise ValueError('模型压缩包 路径不安全')
            key=name.casefold()
            if key in checked: raise ValueError('模型压缩包 包含重复文件路径')
            checked.add(key)
        target.mkdir(parents=True)
        try:
            if isinstance(archive,PackedArchive):
                archive.extract_into(target)
            else:
                for name in names:
                    if name.endswith('/'): continue
                    dest=target/name
                    dest.parent.mkdir(parents=True,exist_ok=True)
                    dest.write_bytes(archive.read(name))
        except Exception:
            import shutil
            shutil.rmtree(target)
            raise
    return {'extracted':True}

def make_catalog(z, entry=None):
    names = z.namelist()
    models = [n for n in names if n.endswith('.model3.json')]
    if not models: raise ValueError('压缩包中没有 model3.json')
    model = entry or models[0]
    if model not in models: raise ValueError('模型版本不存在')
    base = model.rsplit('/',1)[0]+'/' if '/' in model else ''
    config = json.loads(z.read(model))
    siblings=[n for n in models if n.rpartition('/')[0]==model.rpartition('/')[0]]
    refs=config['FileReferences']
    listed={item['File'] for group in refs.get('Motions',{}).values() for item in group} | {item['File'] for item in refs.get('Expressions',[])}
    nested={n.rpartition('/')[0]+'/' for n in models if n.startswith(base) and n.rpartition('/')[0] != model.rpartition('/')[0]}
    def local_asset(n):
        return n.startswith(base) and not any(n.startswith(folder) for folder in nested)
    def items(suffix):
        out=[]
        for n in names:
            if n.endswith(suffix) and n.startswith(base) and (n[len(base):] in listed or (len(siblings)==1 and local_asset(n))):
                out.append({'name': pathlib.PurePosixPath(n).name.removesuffix(suffix), 'path': n[len(base):], 'data': json.loads(z.read(n))})
        return out
    exp, mot = items('.exp3.json'), items('.motion3.json')
    vts_files=[n for n in names if local_asset(n) and n.endswith('.vtube.json')]
    own=model.removesuffix('.model3.json')+'.vtube.json'
    vts_path=own if own in vts_files else (vts_files[0] if len(vts_files)==len(siblings)==1 else None)
    vts=json.loads(z.read(vts_path)) if vts_path else {}
    hotkeys=vts.get('Hotkeys',[])
    def bound_file(value, path):
        value=str(value or '').replace('\\','/').removeprefix('./')
        return value == path or ('/' not in value and value == path.rsplit('/',1)[-1] and sum(n.rsplit('/',1)[-1] == value for n in names if local_asset(n)) == 1)
    vrefs=vts.get('FileReferences',{})
    refs=config['FileReferences']
    declared={e.get('File'):e.get('Name') for e in refs.get('Expressions',[]) if e.get('File')}
    idle_paths={row.get('File') for group,rows in refs.get('Motions',{}).items() if group.lower()=='idle' for row in rows}
    for e in exp:
        bound=[h for h in hotkeys if h.get('Action')=='ToggleExpression' and bound_file(h.get('File'),e['path'])]
        h=bound[0] if bound else {}
        # Preserve the pre-alias (.36) public name exactly: only the old
        # basename binding rule selected the filename over model3 Name.
        old_bound=any(h.get('Action')=='ToggleExpression' and h.get('File')==e['path'].split('/')[-1] for h in hotkeys)
        if declared.get(e['path']) and not old_bound:
            e['name']=declared[e['path']]
        e['aliases']=list(dict.fromkeys([x for x in [declared.get(e['path']), *[row.get('Name') for row in bound]] if x and x != e['name']]))
        e['behavior']={'kind':'toggle','fade':h.get('FadeSecondsAmount',e['data'].get('FadeInTime',.5)), 'bound':bool(bound) or e['path'] in declared,'autoOff':h.get('DeactivateAfterSeconds',False),'autoOffSeconds':h.get('DeactivateAfterSecondsAmount',0)}
    motion_refs={row['File']:row for rows in refs.get('Motions',{}).values() for row in rows}
    for m in mot:
        filename=m['path'].split('/')[-1]
        bound=[h for h in hotkeys if h.get('Action')=='TriggerAnimation' and bound_file(h.get('File'),m['path'])]
        h=bound[0] if bound else {}
        kind='tracking' if filename==vrefs.get('IdleAnimation') or (not vrefs.get('IdleAnimation') and m['path'] in idle_paths) else 'detached' if filename==vrefs.get('IdleAnimationWhenTrackingLost') else 'idle-alternative' if any(row.get('Action')=='ChangeIdleAnimation' and bound_file(row.get('File'),m['path']) for row in hotkeys) else 'hold' if h.get('StopsOnLastFrame') else 'once'
        m['behavior']={'kind':kind,'fade':h.get('FadeSecondsAmount',.2),'fadeIn':motion_refs.get(m['path'],{}).get('FadeInTime',m['data'].get('FadeInTime')),'fadeOut':motion_refs.get(m['path'],{}).get('FadeOutTime',m['data'].get('FadeOutTime')),'hotkey':h.get('Name',''),'stopsOnLastFrame':bool(h.get('StopsOnLastFrame'))}
        m['aliases']=list(dict.fromkeys(row['Name'] for row in bound if row.get('Name') and row['Name'] != m['name']))
    refs=config['FileReferences']
    for n in [refs['Moc'], *refs['Textures'], refs.get('Physics',''),refs.get('DisplayInfo','')]:
        if n and base+n not in names: raise ValueError('缺少引用文件：'+n)
    cdi=json.loads(z.read(base+refs['DisplayInfo'])) if refs.get('DisplayInfo') else {}
    rig=json.loads(z.read(base+refs['Physics'])) if refs.get('Physics') else {}
    settings=rig.get('PhysicsSettings',[])
    phys={k:sorted({row[end]['Id'] for group in settings for row in group.get(k,[]) if row.get(end,{}).get('Id')}) for k,end in [('Input','Source'),('Output','Destination')]}
    groups = {group:[row['File'] for row in rows] for group,rows in refs.get('Motions',{}).items()}
    with z.open(base+refs['Moc']) as moc:
        header=moc.read(8)
    if len(header)<8 or header[:4]!=b'MOC3':raise ValueError('无效的 MOC3 文件')
    signature=hashlib.sha256((model+str(z.getinfo(base+refs['Moc']).CRC)).encode()).hexdigest()[:24]
    refs['Motions']={'Lab':[{'File':x['path'],'FadeInTime':0.25,'FadeOutTime':0.35} for x in mot]}
    return base,config,{'model':'/asset/'+urllib.parse.quote(model[len(base):]),'profile':signature,'entry':model,'model3Count':len(models),'physicsIO':phys,'mocVersion':header[4],'hitAreas':config.get('HitAreas',[]),'motionGroups':groups,'parameterGroups':config.get('Groups',[]),'expressions':exp,'motions':mot,'parameters':cdi.get('Parameters',[]),'parts':cdi.get('Parts',[]),'groups':cdi.get('ParameterGroups',[]),'vts':{'tracking':[ {k:r.get(k) for k in ('UseBreathing','Input','OutputLive2D','InputRangeLower','InputRangeUpper','OutputRangeLower','OutputRangeUpper')} for r in vts.get('ParameterSettings',[]) if isinstance(r,dict)],'references':vrefs,'general':vts.get('GeneralSettings',{}),'hotkeys':[{k:h.get(k) for k in ['Name','Action','File','StopsOnLastFrame','FadeSecondsAmount','DeactivateAfterSeconds','DeactivateAfterSecondsAmount']} for h in hotkeys]}}

def main():
    p=argparse.ArgumentParser();p.add_argument('--model-zip');p.add_argument('--port',type=int,default=61950);p.add_argument('--no-browser',action='store_true');p.add_argument('--fallback-port',action='store_true');a=p.parse_args()
    from focus_input import FocusInput
    focus = FocusInput() if sys.platform == 'win32' else None
    web_token = os.environ['PET_WEB_TOKEN']
    assets = pathlib.Path(os.environ.get('PET_ASSETS','assets.json'))
    def prefs():
        try:return json.loads(assets.read_text(encoding='utf-8'))
        except (ValueError,OSError):return {}
    current=None
    guard=threading.RLock()
    def select(path,entry):
        nonlocal current
        if path is None:
            with guard:
                if current:current[0].close()
                current=None
            return
        with guard, contextlib.ExitStack() as stack:
            archive=stack.enter_context(open_archive(path))
            base,config,catalog=make_catalog(archive,entry)
            allowed={n[len(base):]:n for n in archive.namelist() if n.startswith(base) and pathlib.PurePosixPath(n).suffix.lower() in {'.json','.moc3','.png'}}
            previous=current
            current=(archive,config,catalog,allowed)
            stack.pop_all()
            if previous:previous[0].close()
            return catalog['profile']
    initial=prefs()
    if a.model_zip or initial.get('model'):
        try:select(a.model_zip or initial['model'],initial.get('entry'))
        except (OSError,ValueError,KeyError,zipfile.BadZipFile):pass
    class Handler(BaseHTTPRequestHandler):
        def disconnected(self):
            try:
                readable, _, _ = socket_select.select([self.connection], [], [], 0)
                return bool(readable) and not self.connection.recv(1, socket.MSG_PEEK)
            except OSError:
                return True

        def voice_cancelled(self):
            return self.disconnected() or prefs().get('ai') is False

        def stream_audio(self, body):
            cancelled = self.voice_cancelled
            with contextlib.closing(companion.synthesize_stream(body, cancelled)) as chunks:
                first = next(chunks, None)
                if first is None:
                    if self.disconnected():
                        return
                    if cancelled():
                        raise InterruptedError('语音请求已停止')
                    raise ValueError('语音引擎未返回音频')
                self.protocol_version = 'HTTP/1.1'
                self.close_connection = True
                try:
                    self.connection.settimeout(15)
                    self.send_response(200)
                    self.send_header('Cache-Control','no-store')
                    self.send_header('X-Content-Type-Options','nosniff')
                    self.send_header('Connection','close')
                    if isinstance(first,companion.CompleteWav):
                        self.send_header('Content-Type','audio/wav')
                        self.send_header('Content-Length',str(len(first.data)))
                        self.end_headers()
                        self.wfile.write(first.data)
                        return
                    self.send_header('Content-Type','audio/pcm')
                    self.send_header('X-Sample-Rate','24000')
                    self.send_header('X-Sample-Format','s16le')
                    self.send_header('X-Channels','1')
                    self.send_header('Transfer-Encoding','chunked')
                    self.end_headers()
                    chunk = first
                    while chunk is not None:
                        if cancelled():
                            return
                        self.wfile.write(f'{len(chunk):x}\r\n'.encode('ascii') + chunk + b'\r\n')
                        self.wfile.flush()
                        chunk = next(chunks, None)
                    if not cancelled():
                        self.wfile.write(b'0\r\n\r\n')
                except Exception:
                    # Closing without a terminal chunk signals an incomplete response.
                    return

        def do_GET(self):
            if self.headers.get('X-Pet-Window') != web_token: self.send_error(403);return
            # This server is for one local browser; reject DNS rebinding hosts.
            if self.headers.get('Host') not in local_hosts:
                self.send_error(403);return
            path=urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
            try:
                if path=='/api/focus-count': body=json.dumps({'total': focus.total if focus else 0}).encode();typ='application/json'
                elif path=='/api/dsh-status': body=json.dumps(companion.dsh_status(),ensure_ascii=False).encode();typ='application/json'
                elif path=='/api/catalog': body=json.dumps(current[2] if current else None,ensure_ascii=False).encode();typ='application/json'
                elif path.startswith('/asset/'):
                    with guard:
                        if not current:self.send_error(404);return
                        archive,config,_,allowed=current
                        rel=path[7:]
                        if rel not in allowed:self.send_error(404);return
                        body=archive.read(allowed[rel]);typ=mimetypes.guess_type(rel)[0] or 'application/octet-stream'
                        if rel.endswith('.model3.json'):body=json.dumps(config,ensure_ascii=False).encode()
                elif path=='/profile.js':
                    cat=current[2] if current else {}
                    profile=cat.get('profile','setup')
                    legacy=profile=='e45ce94b922c4f663ef18ed9'
                    character_id=prefs().get('active',{}).get('characterId') if prefs().get('active') else None
                    body=('window.petProfile='+json.dumps(profile)+';window.petCharacterId='+json.dumps(character_id)+';window.petStorageKey='+json.dumps(str(character_id)+':'+profile if character_id else 'setup')+';window.petLegacy='+json.dumps(legacy)+';').encode()
                    typ='application/javascript'
                else:
                    rel='index.html' if path=='/' else path.lstrip('/')
                    if rel not in {'index.html','logo.svg','help.js','app.js','rules.js','state.js','companion.js','voice-catalog.js','companion-core.js','bubble-layout.js','speech-core.js','mouth-profile.js','touch-batch.js','zones-core.js','body-zones.js','portable.js','studio.js','panel-state.js','renderer-health.js','zones-editor.js','companion.css','style.css','vendor/pixi.min.js','vendor/cubism4.js','vendor/live2dcubismcore.min.js'}:self.send_error(404);return
                    body=(pathlib.Path(prefs().get('core') or os.environ.get('PET_CORE') or '/missing-core') if rel=='vendor/live2dcubismcore.min.js' else ROOT/rel).read_bytes();typ=mimetypes.guess_type(rel)[0] or 'application/octet-stream'
                self.send_response(200);self.send_header('Content-Type',typ+'; charset=utf-8' if typ.startswith('text/') or typ=='application/json' else typ);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body)
            except (KeyError,FileNotFoundError):self.send_error(404)
        def do_POST(self):
            host=self.headers.get('Host')
            if self.headers.get('X-Pet-Window') != web_token or host not in local_hosts or self.headers.get('Origin')!=f'http://{host}' or self.headers.get('X-Lab-Request')!='companion':
                self.send_error(403);return
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=14*1024*1024: raise ValueError('请求体大小无效')
                body=json.loads(self.rfile.read(size))
                if self.path=='/api/synthesize-stream' and body.get('mode')=='api':
                    native_token=os.environ.get('PET_NATIVE')
                    if not native_token or self.headers.get('X-Pet-Native')!=native_token:
                        self.send_error(403);return
                if self.path in ('/native/list','/native/select','/native/inspect','/native/clear','/native/extract','/native/voice-environment','/native/voice-release'):
                    if not self.headers.get('X-Pet-Native')==os.environ.get('PET_NATIVE') or not os.environ.get('PET_NATIVE'):self.send_error(403);return
                    if self.path.endswith('voice-release'):
                        if prefs().get('ai') is not False:
                            raise ValueError('请先关闭 AI 调用')
                        from managed_voice import release_breeze
                        result=release_breeze(body.get('idleVramOptimization') is True)
                    elif self.path.endswith('voice-environment'):
                        import managed_voice
                        result=managed_voice.bind_environment(body)
                    elif self.path.endswith('clear'):select(None,None);result={}
                    elif self.path.endswith('extract'):result=extract_model(body['path'],body['destination'])
                    elif self.path.endswith('list'):
                        with open_archive(body['path']) as archive:
                            result=[n for n in archive.namelist() if n.endswith('.model3.json') and not n.startswith('__MACOSX/')]
                            if not result:raise ValueError('压缩包缺少运行时 model3.json，请从 Cubism 导出供运行时使用的数据')
                    elif self.path.endswith('/inspect'):
                        with open_archive(body['path']) as archive:
                            _,_,cat=make_catalog(archive,body.get('entry'));result={'profile':cat['profile'],'entry':body.get('entry') or next(n for n in archive.namelist() if n.endswith('.model3.json'))}
                    else:
                        result={'profile':select(body['path'],body['entry'])}
                        if focus:focus.configure(False)
                elif self.path in ('/api/voice-local-models','/api/voice-local-status','/api/voice-local-install'):
                    import managed_voice
                    result={'/api/voice-local-models':lambda _:managed_voice.models(),
                            '/api/voice-local-status':managed_voice.status,
                            '/api/voice-local-install':managed_voice.install}[self.path](body)
                elif self.path=='/api/balance':
                    result=companion.post_json(os.environ['PET_BRIDGE'].removesuffix('/decide')+'/balance',{},os.environ['PET_SECRET'],True)
                elif self.path=='/api/focus': result={'total':focus.configure(body.get('enabled') is True) if focus else 0}
                elif self.path in ('/api/decide','/api/synthesize','/api/synthesize-stream','/api/voice-check'):
                    from managed_voice import ai_request
                    with ai_request():
                        options=prefs()
                        if options.get('ai') is False: raise ValueError('AI 调用已关闭')
                        if self.path.endswith('decide'):
                            payload=body.get('payload',{})
                            if options.get('processContext') and sys.platform=='win32' and payload.get('event',{}).get('type') in ('chat','observe','touch'):
                                from focus_input import foreground_app
                                name=foreground_app()
                                if name:payload.setdefault('context',{})['foregroundApplication']=name
                            result=companion.decide(body)
                        else:
                            with companion.voice_scope(self.voice_cancelled):
                                if self.path=='/api/synthesize-stream':
                                    self.stream_audio(body)
                                    return
                                if self.path=='/api/voice-check':
                                    from tts_api import check_key
                                    result=check_key(body)
                                else:
                                    result=companion.synthesize(body)
                            if self.voice_cancelled():
                                raise InterruptedError('语音请求已停止')
                else: self.send_error(404);return
                status=200
            except Exception as e:
                status=400;result={'error':str(e) if isinstance(e,ValueError) else '请求处理失败，请检查接口配置'}
                if isinstance(e,companion.BridgeError): result.update(e.details)
                if self.path in ('/api/synthesize','/api/synthesize-stream','/api/voice-check'):
                    from tts_api import TtsError
                    if self.disconnected():
                        return
                    if self.voice_cancelled():
                        result={'error':'AI 调用已关闭','voice':{'stage':'cancelled','errorCode':'ai_disabled'}}
                    elif isinstance(e,TtsError):
                        result['voice']=e.voice_details
                    else:
                        timeout=isinstance(e,TimeoutError)
                        if timeout:
                            result['error']=str(e) or '语音服务读取超时'
                        result['voice']={'stage':'read','errorCode':'read_timeout' if timeout else 'synthesis_failed'}
            raw=json.dumps(result,ensure_ascii=False).encode()
            self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw)
        def log_message(self,*args): pass
    class LocalServer(ThreadingHTTPServer):
        def server_bind(self):
            if sys.platform=='win32':
                self.allow_reuse_address=False
                self.socket.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
            super().server_bind()

    try:
        server=LocalServer(('127.0.0.1',a.port),Handler)
    except OSError as error:
        if not a.fallback_port or (error.errno != errno.EADDRINUSE and getattr(error,'winerror',None) not in (10013,10048)):
            raise
        server=LocalServer(('127.0.0.1',0),Handler)
    port=server.server_address[1]
    local_hosts={f'127.0.0.1:{port}',f'localhost:{port}'}
    def parent_watch():
        sys.stdin.buffer.read(); server.shutdown()
    threading.Thread(target=parent_watch,daemon=True).start()
    url=f'http://127.0.0.1:{port}/';print('角色调试台：'+url+'\n关闭此窗口或 Ctrl+C 停止。',flush=True)
    if not a.no_browser:webbrowser.open(url)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:
        server.server_close()
        if current:current[0].close()
if __name__=='__main__':
    main()

