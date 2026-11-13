"""Transport-only tests; no model weights, torch or GPU required."""
import base64,importlib.util,io,pathlib,threading,unittest,wave,sys
sys.dont_write_bytecode=True
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
spec=importlib.util.spec_from_file_location('lc_voice',pathlib.Path(__file__).resolve().parents[1]/'lab/companion.py')
voice=importlib.util.module_from_spec(spec);spec.loader.exec_module(voice)
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
if __name__=='__main__':unittest.main()
