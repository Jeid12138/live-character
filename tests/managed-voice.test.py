import importlib.util
import hashlib
import io
import json
import os
import pathlib
import struct
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch
sys.dont_write_bytecode=True
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'lab'))
import local_voice
import managed_voice
import piper_stream

class ManagedVoiceTest(unittest.TestCase):
    def test_sleep_cancels_an_active_stream_and_reuses_worker(self):
        script = """
import json, pathlib, sys, time
marker = pathlib.Path(sys.argv[sys.argv.index('--cancel-file') + 1])
sleeping = False
for line in sys.stdin:
    request = json.loads(line)
    if request.get('op') == 'sleep':
        sleeping = True
        print(json.dumps({'sleeping': True}), flush=True)
    elif request.get('streaming'):
        print(json.dumps({'pcm':'AAA='}), flush=True)
        while not marker.exists():
            time.sleep(.01)
        print(json.dumps({'cancelled': True}), flush=True)
    else:
        print(json.dumps({'audio':{'woke':sleeping, 'staleCancellation':marker.exists()}}), flush=True)
        sleeping = False
"""
        command = [sys.executable,'-B','-u','-c',script]
        with tempfile.TemporaryDirectory() as folder, \
             patch.object(managed_voice,'home',return_value=pathlib.Path(folder)), \
             patch.object(managed_voice,'external_breeze',return_value=(None,pathlib.Path(folder))), \
             patch.object(managed_voice,'external_python',return_value=command):
            body = {'model':managed_voice.BREEZE_ID,'text':'fixture','idleVramOptimization':True}
            try:
                opened = threading.Event()
                chunks = []
                def play():
                    for chunk in managed_voice.stream(body,lambda:False):
                        chunks.append(chunk)
                        opened.set()
                playback = threading.Thread(target=play, daemon=True)
                playback.start()
                self.assertTrue(opened.wait(3))
                worker = managed_voice._process
                self.assertEqual(managed_voice.release_breeze(True), {'sleeping': True})
                playback.join(3)
                self.assertFalse(playback.is_alive())
                self.assertEqual(chunks, [b'\0\0'])
                self.assertIs(managed_voice._process, worker)
                self.assertIsNone(worker.poll())
                self.assertEqual(managed_voice.release_breeze(True), {'sleeping': True})
                result = managed_voice.synthesize(dict(body, op='sleep'))
                self.assertEqual(result['audio'], {'woke': True, 'staleCancellation': False})
                self.assertIs(managed_voice._process, worker)
                stream = managed_voice.stream(body,lambda:False)
                self.assertEqual(next(stream), b'\0\0')
                stream.close()
                self.assertIs(managed_voice._process, worker)
            finally:
                managed_voice.release_breeze()

    def test_unconfirmed_sleep_stops_worker(self):
        script = """
import json, sys
for line in sys.stdin:
    if json.loads(line).get('op') == 'sleep':
        print(json.dumps({'error':'could not park'}), flush=True)
    else:
        print(json.dumps({'audio':{'base64':'stub'}}), flush=True)
"""
        command = [sys.executable,'-B','-u','-c',script]
        with tempfile.TemporaryDirectory() as folder, \
             patch.object(managed_voice,'home',return_value=pathlib.Path(folder)), \
             patch.object(managed_voice,'external_breeze',return_value=(None,pathlib.Path(folder))), \
             patch.object(managed_voice,'external_python',return_value=command):
            try:
                body = {'model':managed_voice.BREEZE_ID,'text':'fixture'}
                self.assertEqual(managed_voice.synthesize(body)['audio']['base64'], 'stub')
                worker = managed_voice._process
                self.assertEqual(managed_voice.release_breeze(True), {'sleeping': False})
                self.assertIsNotNone(worker.poll())
                self.assertIsNone(managed_voice._process)
            finally:
                managed_voice.release_breeze()

    def test_release_clears_idle_or_active_worker_and_allows_restart(self):
        # Exercise real private stdio children with no Torch or model code.
        script = """
import json, sys
for line in sys.stdin:
    request = json.loads(line)
    if request.get('streaming'):
        print(json.dumps({'pcm':'AAA='}), flush=True)
    else:
        print(json.dumps({'audio':{'base64':'stub'}}), flush=True)
"""
        command = [sys.executable,'-B','-u','-c',script]
        with tempfile.TemporaryDirectory() as folder, \
             patch.object(managed_voice,'home',return_value=pathlib.Path(folder)), \
             patch.object(managed_voice,'external_breeze',return_value=(None,pathlib.Path(folder))), \
             patch.object(managed_voice,'external_python',return_value=command):
            body={'model':managed_voice.BREEZE_ID,'text':'fixture'}
            try:
                self.assertEqual(managed_voice.synthesize(body)['audio']['base64'],'stub')
                idle=managed_voice._process
                self.assertIsNone(idle.poll())
                managed_voice.release_breeze()
                self.assertIsNotNone(idle.poll())
                started=threading.Event()
                chunks=[]
                def play():
                    for chunk in managed_voice.stream(body,lambda:False):
                        chunks.append(chunk)
                        started.set()
                playback=threading.Thread(target=play,daemon=True)
                playback.start()
                self.assertTrue(started.wait(3))
                active=managed_voice._process
                self.assertIsNot(active,idle)
                managed_voice.release_breeze()
                playback.join(3)
                self.assertFalse(playback.is_alive())
                self.assertEqual(chunks,[b'\0\0'])
                self.assertIsNotNone(active.poll())
                self.assertIsNone(managed_voice._process)
                self.assertEqual(managed_voice.synthesize(body)['audio']['base64'],'stub')
                self.assertIsNot(managed_voice._process,active)
            finally:
                managed_voice.release_breeze()

    def test_piper_stream_validates_the_selected_model_and_output_boundaries(self):
        with self.assertRaisesRegex(ValueError, '文本长度'):
            next(piper_stream.stream({'model':'missing','text':' '}))
        with patch.object(managed_voice, 'piper_voices', return_value=[]):
            with self.assertRaisesRegex(ValueError, '未找到'):
                next(piper_stream.stream({'model':'missing','text':'hello'}))
        # Run a child in the selected Python environment without an ONNX download.
        for data, valid in [(b'\x01\x00'*1024, True), (b'\x01', False), (b'', False)]:
            command = [sys.executable, '-c',
                       'import sys; sys.stdin.buffer.read(); sys.stdout.buffer.write('+repr(data)+')']
            with self.subTest(length=len(data)), \
                 patch.object(managed_voice, 'piper_voices', return_value=[('selected','test.onnx')]), \
                 patch.object(managed_voice, 'piper_ready', return_value=True), \
                 patch.object(managed_voice, 'external_python', return_value=command):
                chunks=piper_stream.stream({'model':'selected','text':'hello'})
                if valid:
                    self.assertEqual(b''.join(chunks), data)
                else:
                    with self.assertRaisesRegex(ValueError, '未完成'):
                        list(chunks)

    def test_breeze_normalizes_bracketed_ipv6_bypass(self):
        hub = types.SimpleNamespace(snapshot_download=lambda *args, **kwargs: None)
        for source in ('official', 'china'):
            for key in ('NO_PROXY', 'no_proxy', 'No_PrOxY'):
                with self.subTest(source=source, key=key):
                    endpoint = managed_voice.source_routes(source)['hf']
                    proxy = 'http://localhost:8080'
                    bypass = 'localhost, [::1] ,example.org,::1,,127.0.0.1,[2001:db8::42],[2001:db8::43]:8443,*'
                    with patch.dict(os.environ, {key: bypass, 'HTTPS_PROXY': proxy}, clear=True), \
                         patch.dict(sys.modules, {'huggingface_hub': hub}), \
                         patch.object(sys, 'argv', ['-c', 'models']):
                        exec(managed_voice._breeze_asset_script(endpoint), {})
                        self.assertEqual(os.environ[key],
                                         'localhost, ::1 ,example.org,::1,,127.0.0.1,2001:db8::42,all://[2001:db8::43]:8443,*')
                        self.assertEqual(os.environ['HTTPS_PROXY'], proxy)

    def test_breeze_httpx_routes_ipv6_rules_without_network(self):
        try:
            import httpx
            import huggingface_hub
        except ImportError:
            self.skipTest('Run with the Breeze virtual environment for HTTPX routing coverage')

        proxy = 'http://proxy.invalid:3128'
        bypass = 'localhost,[::1],.example.org,[2001:db8::42],[2001:db8::43]:8443,all://[2001:db8::44]:9443'
        for source in ('official', 'china'):
            endpoint = managed_voice.source_routes(source)['hf']
            with self.subTest(source=source):
                def inspect_download(*args, **kwargs):
                    with httpx.Client() as client:
                        for url in ('https://localhost/', 'https://[::1]/', 'https://a.example.org/',
                                    'https://[2001:db8::42]:8443/', 'https://[2001:db8::43]:8443/',
                                    'https://[2001:db8::44]:9443/'):
                            self.assertIs(client._transport_for_url(httpx.URL(url)), client._transport, url)
                        for url in (endpoint, 'https://example.org/', 'https://[2001:db8::43]:9443/'):
                            transport = client._transport_for_url(httpx.URL(url))
                            self.assertEqual(transport._pool._proxy_url.host, b'proxy.invalid', url)
                            self.assertEqual(transport._pool._proxy_url.port, 3128, url)

                with patch.dict(os.environ, {'HTTPS_PROXY': proxy, 'NO_PROXY': bypass}, clear=True), \
                     patch.object(huggingface_hub, 'snapshot_download', inspect_download), \
                     patch.object(sys, 'argv', ['-c', 'models']):
                    exec(managed_voice._breeze_asset_script(endpoint), {})

    def test_failed_command_uses_only_current_output(self):
        with tempfile.TemporaryDirectory() as folder:
            log_path = pathlib.Path(folder)/'install.log'
            with log_path.open('a', encoding='utf-8') as log:
                log.write('ValueError: previous proxy error\n')
                with self.assertRaisesRegex(ValueError, '子进程没有输出') as failure:
                    managed_voice._run([sys.executable, '-c', 'raise SystemExit(1)'], log)
                self.assertNotIn('previous proxy error', str(failure.exception))
                script = "try:\n raise OSError('current root cause')\nexcept OSError as e:\n raise RuntimeError('download failed') from e"
                with self.assertRaisesRegex(ValueError, 'OSError: current root cause / RuntimeError: download failed'):
                    managed_voice._run([sys.executable, '-c', script], log)

    def test_breeze_asset_download_routes_and_scope(self):
        calls = []
        def snapshot_download(repo, **kwargs):
            import os
            calls.append((os.environ['HF_ENDPOINT'], os.environ.get('HF_HUB_DISABLE_XET'), repo, kwargs))

        hub = types.SimpleNamespace(snapshot_download=snapshot_download)
        for source, disable_xet in [('official', None), ('china', '1')]:
            endpoint = managed_voice.source_routes(source)['hf']
            files = ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json',
                     'special_tokens_map.json', 'audio_tokenizer/config.json', 'audio_tokenizer/configuration.json',
                     'audio_tokenizer/preprocessor_config.json']
            if source == 'official':
                files.append('audio_tokenizer/model.safetensors')
            with patch.dict('os.environ', {}, clear=True), patch.dict(sys.modules, {'huggingface_hub': hub}), \
                 patch.object(sys, 'argv', ['-c', 'models']):
                exec(managed_voice._breeze_asset_script(endpoint), {})
            self.assertEqual(calls[-1], (endpoint, disable_xet, 'drbaph/Breeze-TTS-2-comfyui', {
                'revision': 'a6bfd9d0d4e8b3b61c3a5ed3ecf55468c8ab88e4',
                'local_dir': 'models',
                'token': False,
                'allow_patterns': files,
            }))

    def test_verified_download_resumes_and_restarts_if_range_ignored(self):
        data = b'abcd'
        integrity = len(data), hashlib.sha256(data).hexdigest()
        url = 'https://hf-mirror.com/model?download=true'
        with tempfile.TemporaryDirectory() as folder:
            target = pathlib.Path(folder)/'weights'
            partial = target.with_suffix('.part')
            for status, body, headers in [(206, b'cd', {'Content-Range':'bytes 2-3/4'}),
                                          (200, data, {})]:
                partial.write_bytes(b'ab')
                response = io.BytesIO(body)
                response.status = status
                response.headers = headers
                with patch.object(managed_voice.urllib.request, 'urlopen', return_value=response) as download:
                    managed_voice._download(url, target, integrity)
                request = download.call_args.args[0]
                self.assertEqual(request.get_header('Range'), 'bytes=2-3')
                self.assertIsNone(request.get_header('Authorization'))
                self.assertEqual(target.read_bytes(), data)
                self.assertFalse(partial.exists())

            partial.write_bytes(b'garbage')
            response = io.BytesIO(b'xxxx')
            response.status = 206
            response.headers = {'Content-Range':'bytes 0-3/4'}
            with patch.object(managed_voice.urllib.request, 'urlopen', return_value=response):
                with self.assertRaisesRegex(ValueError, '下载校验失败'):
                    managed_voice._download(url, target, integrity)
            self.assertEqual(target.read_bytes(), data)
            self.assertFalse(partial.exists())

    @unittest.skipUnless(sys.platform=='win32','Windows portable environment')
    def test_relocated_environment_updates_paths_without_rebuilding(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder).resolve()
            cfg=root/'venv'/'pyvenv.cfg'
            cfg.parent.mkdir()
            cfg.write_text('home = old-path\nexecutable = old-python\ninclude-system-site-packages = false\n',encoding='utf-8')
            with patch.object(managed_voice,'_run',side_effect=AssertionError('unexpected venv rebuild')):
                managed_voice.relocate_environment(root)
                fixed=cfg.read_text(encoding='utf-8')
                self.assertIn('home = '+str(root/'python'/'tools')+'\n',fixed)
                self.assertIn('executable = '+str(root/'python'/'tools'/'python.exe')+'\n',fixed)
                self.assertIn('include-system-site-packages = false',fixed)
                before=cfg.stat().st_mtime_ns
                managed_voice.relocate_environment(root)
                self.assertEqual(cfg.stat().st_mtime_ns,before)

    def test_checkpoint_offsets_and_dtype(self):
        with tempfile.TemporaryDirectory() as folder:
            path=pathlib.Path(folder)/'model.safetensors'
            header=json.dumps({'codec_model.weight':{'dtype':'BF16','shape':[1],'data_offsets':[0,2]}}).encode()
            path.write_bytes(struct.pack('<Q',len(header))+header+b'00')
            result=local_voice.inspect_checkpoint(path)
            self.assertTrue(result['hasCodec']); self.assertEqual(result['dtypes'],['BF16']); self.assertFalse(result['ready'])
            path.write_bytes(struct.pack('<Q',len(header))+header)
            with self.assertRaisesRegex(ValueError,'超出文件范围'):local_voice.inspect_checkpoint(path)
    def test_asset_root_discovery(self):
        with tempfile.TemporaryDirectory() as folder:
            prefs=pathlib.Path(folder)/'assets.json'
            prefs.write_text(json.dumps({'assetRoot':str(pathlib.Path(folder)/'library')}))
            with patch.dict('os.environ',{'PET_ASSETS':str(prefs)}):
                self.assertEqual(managed_voice.home(),pathlib.Path(folder)/'library'/'voice-models'/'breeze-managed')
                with self.assertRaisesRegex(ValueError,'尚未准备完成'):managed_voice.synthesize({'text':'你好'})
    def test_install_failure_reported(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(managed_voice,'home',return_value=pathlib.Path(folder)):
            managed_voice._install(None)
            self.assertEqual(managed_voice.status()['state'],'error')
            self.assertFalse(managed_voice.status()['ready'])

    def test_model_discovery_and_explicit_install_consent(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(managed_voice,'home',return_value=pathlib.Path(folder)/'breeze-managed'):
            root=pathlib.Path(folder)
            (root/'random.safetensors').touch()
            (root/'random.onnx').touch()
            self.assertEqual(managed_voice.models()['models'], [])
            (root/'random.onnx.json').write_text(json.dumps({'phoneme_id_map':{},'audio':{'sample_rate':22050}}))
            profile=managed_voice.models()['models'][0]
            self.assertEqual(profile['engine'],'piper')
            self.assertFalse(profile['reference'])
            with self.assertRaisesRegex(ValueError,'请先确认'):
                managed_voice.install({'model':profile['id']})
            with self.assertRaisesRegex(ValueError,'选择已识别'):
                managed_voice.install({'model':'../random.onnx','confirmed':True})
            with self.assertRaisesRegex(ValueError,'选择要试播'):
                managed_voice.synthesize({'mode':'managed','text':'sample'})

    def test_prepared_breeze_reused_without_starting_install_thread(self):
        with tempfile.TemporaryDirectory() as folder, \
             patch.object(managed_voice,'home',return_value=pathlib.Path(folder)/'breeze-managed'), \
             patch.object(managed_voice,'distribution_present',return_value=True), \
             patch.object(managed_voice,'BREEZE_CODEC_INTEGRITY',(len(b'fixture'),'unused')):
            root=managed_voice.home()
            model=managed_voice.breeze_weights().parent
            codec=model/'audio_tokenizer/model.safetensors'
            for file in (root/'python/tools/python.exe', root/'venv/pyvenv.cfg',
                         managed_voice.python_path(), managed_voice.breeze_weights(),
                         root/('ComfyUI-Breeze-TTS-2-'+managed_voice.NODE_REVISION)/'__init__.py',
                         model/'config.json',model/'tokenizer.json',model/'tokenizer_config.json',
                         model/'audio_tokenizer/config.json',codec):
                file.parent.mkdir(parents=True,exist_ok=True)
                file.write_bytes(b'fixture')
            self.assertTrue(managed_voice.models()['models'][0]['installed'])
            with patch.object(managed_voice.threading,'Thread') as thread:
                result=managed_voice.install({'model':managed_voice.BREEZE_ID,'confirmed':True})
                self.assertTrue(result['installed'])
                thread.assert_not_called()
            # A previous install marker cannot hide missing model components.
            (root/'assets-ready').touch()
            codec.write_bytes(b'partial file')
            result=managed_voice.status({'model':managed_voice.BREEZE_ID})
            self.assertFalse(result['installed'])
            self.assertEqual(result['missingComponents'],['分词器和音频编解码器'])

    def test_cuda_probe_requires_version_and_real_library(self):
        with tempfile.TemporaryDirectory() as folder:
            packages=pathlib.Path(folder)
            lib=packages/'torch/lib/torch_cuda.dll'
            lib.parent.mkdir(parents=True)
            metadata=packages/'torch-2.11.0+cu128.dist-info/METADATA'
            metadata.parent.mkdir()
            metadata.write_text('Version: 2.11.0+cu128')
            self.assertFalse(managed_voice.distribution_present(packages,'torch','torch/lib/torch_cuda.dll','2.11.0+cu128'))
            lib.write_bytes(b'fixture')
            self.assertTrue(managed_voice.distribution_present(packages,'torch','torch/lib/torch_cuda.dll','2.11.0+cu128'))

    def test_install_and_ai_requests_are_mutually_exclusive_across_engines(self):
        choices={'models':[{'id':managed_voice.BREEZE_ID},{'id':'piper-test'}]}
        with patch.object(managed_voice,'models',return_value=choices), \
             patch.object(managed_voice,'piper_voices',return_value=[('piper-test',None)]), \
             patch.object(managed_voice,'breeze_installed',return_value=False), \
             patch.object(managed_voice,'piper_installed',return_value=False), \
             patch.object(managed_voice,'_state',{'state':'not_installed'}), \
             patch.object(managed_voice,'_piper_state',{}), \
             patch.object(managed_voice.threading,'Thread') as thread:
            piper={'model':'piper-test','confirmed':True}
            breeze={'model':managed_voice.BREEZE_ID,'confirmed':True}
            with managed_voice.ai_request():
                with self.assertRaisesRegex(ValueError,'正在处理 AI'):
                    managed_voice.install(piper)
            self.assertTrue(managed_voice.install(piper)['installing'])
            self.assertTrue(managed_voice.status(breeze)['installing'])
            self.assertTrue(managed_voice.install(piper)['installing'])
            with self.assertRaisesRegex(ValueError,'另一套'):
                managed_voice.install(breeze)
            with self.assertRaisesRegex(ValueError,'正在配置'):
                with managed_voice.ai_request():
                    self.fail('request started during installation')
            thread.assert_called_once()

    def test_request_exception_releases_admission(self):
        with self.assertRaisesRegex(RuntimeError,'request failed'):
            with managed_voice.ai_request():
                raise RuntimeError('request failed')
        self.assertEqual(managed_voice._active_requests,0)

    def test_external_piper_python_without_lc_install_marker(self):
        with tempfile.TemporaryDirectory() as folder:
            base=pathlib.Path(folder)
            root=base/'breeze-managed'
            external=base/'external-python'
            interpreter=external/'Scripts/python.exe'
            interpreter.parent.mkdir(parents=True)
            interpreter.touch()
            with patch.object(managed_voice,'home',return_value=root), \
                 patch.object(managed_voice,'piper_voices',return_value=[('piper-model',base/'voice.onnx')]), \
                 patch.object(managed_voice,'verify_environment',return_value=True) as verify:
                response=managed_voice.bind_environment({'model':'piper-model','directory':str(external)})
                verify.assert_called_once_with(external.resolve(),'piper')
                self.assertEqual(response['engine'],'piper')
                self.assertTrue(managed_voice.status({'model':'piper-model'})['installed'])
                self.assertEqual(managed_voice.status({'model':'piper-model'})['downloadBytes'],0)
                self.assertEqual(list(external.iterdir()),[interpreter.parent])

if __name__=='__main__':unittest.main()
