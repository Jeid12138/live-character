"""Transport-only tests; no model weights, torch or GPU required."""
import base64,importlib.util,io,pathlib,threading,unittest,wave,sys
import http.client,json,os,re,subprocess,tempfile
sys.dont_write_bytecode=True
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
spec=importlib.util.spec_from_file_location('lc_voice',pathlib.Path(__file__).resolve().parents[1]/'lab/companion.py')
voice=importlib.util.module_from_spec(spec);sys.modules[spec.name]=voice;spec.loader.exec_module(voice)
class VoiceTest(unittest.TestCase):
    def setUp(self):
        self.requests=[];self.kind='pcm'
        owner=self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*_): pass
            def do_POST(self):
                owner.requests.append((self.headers,self.rfile.read(int(self.headers['Content-Length']))))
                kind=owner.kind
                if kind=='busy': self.send_response(409);self.end_headers();return
                if kind=='redirect': self.send_response(302);self.send_header('Location','http://example.com/');self.end_headers();return
                if kind=='blocked':
                    owner.entered.set()
                    self.connection.settimeout(3)
                    try:
                        if not self.connection.recv(1):
                            owner.upstream_closed.set()
                    except OSError:
                        pass
                    return
                if kind=='deferred':
                    self.send_response(200);self.send_header('Content-Type','audio/pcm');self.end_headers()
                    self.wfile.write(b'ab');self.wfile.flush()
                    if owner.release.wait(3): self.wfile.write(b'cd')
                    return
                if kind in ('wav','bad-wav'):
                    self.send_response(200);self.send_header('Content-Type','audio/wav');self.end_headers()
                    self.wfile.write(owner.wav if kind=='wav' else owner.wav[:-1])
                    return
                self.send_response(200);self.send_header('Content-Type','text/html' if kind=='bad' else 'audio/pcm');self.end_headers();self.wfile.write(b'abc' if kind=='odd' else b'\0\0'*2400)
        self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.body={'mode':'breeze','endpoint':'http://127.0.0.1:'+str(self.server.server_port)+'/v1/audio/speech','text':'你好','instruction':'温柔清晰的年轻女性'}
    def tearDown(self): self.server.shutdown();self.server.server_close();self.thread.join()
    def test_design_pcm_wrapping(self):
        result=voice.synthesize(self.body);data=base64.b64decode(result['audio']['base64'])
        with wave.open(io.BytesIO(data)) as wav:
            self.assertEqual((wav.getnchannels(),wav.getsampwidth(),wav.getframerate(),wav.getnframes()),(1,2,24000,2400))
        headers,body=self.requests[0];self.assertIn('multipart/form-data',headers['Content-Type']);self.assertIn('温柔'.encode(),body);self.assertNotIn(b'name="ref_audio"',body);self.assertEqual(len(self.requests),1)
    def test_cloning_and_validation(self):
        out=io.BytesIO()
        with wave.open(out,'wb') as wav: wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(24000);wav.writeframes(b'\0\0'*100)
        self.body.update(instruction='',reference={'base64':base64.b64encode(out.getvalue()).decode()},reference_text='准确的参考文字')
        voice.synthesize(self.body);body=self.requests[0][1];self.assertIn(b'name="ref_audio"',body);self.assertIn(b'name="ref_text"',body);self.assertNotIn(b'name="instruction"',body)
        self.body['reference_text']='';self.assertRaisesRegex(ValueError,'准确文字稿',voice.synthesize,self.body);self.assertEqual(len(self.requests),1)
    def test_empty_design_remote_busy_redirect_bad_pcm(self):
        bad={**self.body,'instruction':''};self.assertRaisesRegex(ValueError,'音色描述',voice.synthesize,bad)
        bad={**self.body,'endpoint':'https://example.com/v1/audio/speech'};self.assertRaisesRegex(ValueError,'本机',voice.synthesize,bad)
        for kind,message in [('busy','正在合成'),('redirect','重定向'),('bad','24kHz'),('odd','截断')]:
            self.kind=kind;self.assertRaisesRegex(ValueError,message,voice.synthesize,self.body)
        self.assertEqual(len(self.requests),4,'errors must not retry model requests')
    def test_stream_yields_before_upstream_finishes(self):
        self.kind='deferred'
        self.release=threading.Event()
        chunks=voice.synthesize_stream(self.body, lambda: False)
        try:
            self.assertEqual(next(chunks),b'ab')
            self.release.set()
            self.assertEqual(b''.join(chunks),b'cd')
        finally:
            self.release.set()
            chunks.close()
    def test_stream_truncation_after_audio(self):
        self.kind='odd'
        chunks=voice.synthesize_stream(self.body, lambda: False)
        self.assertEqual(next(chunks),b'ab')
        with self.assertRaisesRegex(ValueError,'截断'):
            next(chunks)
    def test_cancel_closes_upstream_while_waiting_for_headers(self):
        self.kind='blocked'
        self.entered=threading.Event()
        self.upstream_closed=threading.Event()
        cancel=threading.Event()
        timer=threading.Thread(target=lambda: self.entered.wait(2) and cancel.set(),daemon=True)
        timer.start()
        with voice.voice_scope(cancel.is_set):
            with self.assertRaises((ValueError,OSError,http.client.HTTPException)):
                voice.synthesize(self.body)
        self.assertTrue(self.upstream_closed.wait(1))
        timer.join()
    def test_lab_stream_auth_framing_and_incomplete_failure(self):
        output=io.BytesIO()
        with wave.open(output,'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(24000);wav.writeframes(b'\x00\x01'*8)
        self.wav=output.getvalue()
        lab=pathlib.Path(__file__).resolve().parents[1]/'lab'/'server.py'
        env={**os.environ,'PET_WEB_TOKEN':'fixture','PYTHONIOENCODING':'utf-8','PET_ASSETS':str(lab.with_name('__absent_test_assets__'))}
        with subprocess.Popen([sys.executable,'-B',str(lab),'--port','0','--no-browser'],
                              stdin=subprocess.PIPE,stdout=subprocess.PIPE,env=env,text=True,encoding='utf-8') as process:
            try:
                port=int(re.search(r'127\.0\.0\.1:(\d+)',process.stdout.readline())[1])
                headers={'Content-Type':'application/json','Origin':f'http://127.0.0.1:{port}',
                         'X-Pet-Window':'fixture','X-Lab-Request':'companion'}
                body=json.dumps(self.body)
                for kind in ('auth','deferred','odd','wav','bad-wav'):
                    self.kind=kind
                    self.release=threading.Event()
                    connection=http.client.HTTPConnection('127.0.0.1',port,timeout=3)
                    try:
                        auth=headers if kind!='auth' else {**headers,'X-Pet-Window':'invalid'}
                        connection.request('POST','/api/synthesize-stream',body,auth)
                        with connection.getresponse() as response:
                            if kind=='auth':
                                self.assertEqual(response.status,403)
                                continue
                            if kind=='wav':
                                self.assertEqual((response.status,response.getheader('Content-Type'),response.chunked),(200,'audio/wav',False))
                                self.assertEqual(response.read(),self.wav)
                                continue
                            if kind=='bad-wav':
                                self.assertEqual(response.status,400)
                                self.assertIn('WAV',json.loads(response.read())['error'])
                                continue
                            self.assertEqual((response.status,response.getheader('Content-Type'),response.chunked),(200,'audio/pcm',True))
                            self.assertEqual(response.read(2),b'ab')
                            self.release.set()
                            if kind=='odd':
                                with self.assertRaises(http.client.IncompleteRead):
                                    response.read()
                            else:
                                self.assertEqual(response.read(),b'cd')
                    finally:
                        self.release.set()
                        connection.close()
                self.assertEqual(len(self.requests),4,'one upstream request per authorized synthesis')
            finally:
                process.stdin.close()
                try: process.wait(timeout=5)
                except subprocess.TimeoutExpired: process.kill()
    def test_lab_ai_off_interrupts_pending_synthesis(self):
        lab=pathlib.Path(__file__).resolve().parents[1]/'lab'/'server.py'
        with tempfile.TemporaryDirectory() as tmp:
            prefs=pathlib.Path(tmp)/'prefs.json'
            prefs.write_text('{}',encoding='utf-8')
            env={**os.environ,'PET_WEB_TOKEN':'fixture','PYTHONIOENCODING':'utf-8','PET_ASSETS':str(prefs)}
            with subprocess.Popen([sys.executable,'-B',str(lab),'--port','0','--no-browser'],
                                  stdin=subprocess.PIPE,stdout=subprocess.PIPE,env=env,text=True,encoding='utf-8') as process:
                try:
                    port=int(re.search(r'127\.0\.0\.1:(\d+)',process.stdout.readline())[1])
                    self.kind='blocked'
                    self.entered=threading.Event()
                    self.upstream_closed=threading.Event()
                    connection=http.client.HTTPConnection('127.0.0.1',port,timeout=4)
                    try:
                        headers={'Content-Type':'application/json','Origin':f'http://127.0.0.1:{port}',
                                 'X-Pet-Window':'fixture','X-Lab-Request':'companion'}
                        connection.request('POST','/api/synthesize',json.dumps(self.body),headers)
                        self.assertTrue(self.entered.wait(2))
                        prefs.write_text('{"ai":false}',encoding='utf-8')
                        with connection.getresponse() as response:
                            self.assertEqual(response.status,400)
                            self.assertEqual(json.loads(response.read())['voice']['errorCode'],'ai_disabled')
                        self.assertTrue(self.upstream_closed.wait(1))
                    finally:
                        connection.close()
                finally:
                    process.stdin.close()
                    try: process.wait(timeout=5)
                    except subprocess.TimeoutExpired: process.kill()
if __name__=='__main__':unittest.main()
