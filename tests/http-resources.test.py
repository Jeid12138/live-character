"""Exercise the ACTUAL authenticated page server, not just archive membership."""
import os,pathlib,re,queue,threading,socket,subprocess,sys,tempfile,unittest,urllib.request,urllib.error,json
sys.dont_write_bytecode=True
ROOT=pathlib.Path(os.environ.get('LC_RESOURCE_ROOT',pathlib.Path(__file__).resolve().parents[1]))
class Resources(unittest.TestCase):
    def test_actual_http_contract(self):
        with tempfile.TemporaryDirectory(prefix='lc-http-resources-') as folder:
            with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
            self.check_server(folder,port,False)
        with tempfile.TemporaryDirectory(prefix='lc-http-resources-') as folder, socket.socket() as occupied:
            occupied.bind(('127.0.0.1',0))
            occupied.listen()
            self.check_server(folder,occupied.getsockname()[1],True)

    def check_server(self, folder, preferred, fallback):
        token='lc-local-test-token';native='lc-native-test-token';env={**os.environ,'PET_WEB_TOKEN':token,'PET_NATIVE':native,'PET_ASSETS':str(pathlib.Path(folder)/'assets.json'),'PYTHONDONTWRITEBYTECODE':'1'}
        run="import sys,runpy;sys.path.insert(0,sys.argv.pop(1));runpy.run_module('server',run_name='__main__')"
        proc=subprocess.Popen([sys.executable,'-B','-X','utf8','-c',run,str(ROOT/'lab'),'--no-browser','--port',str(preferred),'--fallback-port'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env)
        try:
            lines=queue.Queue();threading.Thread(target=lambda:lines.put(proc.stdout.readline()),daemon=True).start();line=lines.get(timeout=10)
            match=re.search(rb'http://127\.0\.0\.1:(\d+)/',line)
            self.assertIsNotNone(match,line)
            port=int(match[1])
            self.assertEqual(port!=preferred,fallback)
            def get(relative,auth=True):
                req=urllib.request.Request('http://127.0.0.1:'+str(port)+relative,headers={'X-Pet-Window':token} if auth else {})
                return urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=5)
            with get('/') as r:html=r.read().decode();self.assertEqual(r.status,200)
            origin=f'http://127.0.0.1:{port}'
            headers={'X-Pet-Window':token,'X-Pet-Native':native,'Origin':origin,'X-Lab-Request':'companion','Content-Type':'application/json'}
            request=urllib.request.Request(origin+'/native/clear',b'{}',headers=headers)
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request,timeout=5) as r:
                self.assertEqual(r.status,200)
            refs=re.findall(r'(?:src|href)="([^"#]+)"',html)
            self.assertIn('bubble-layout.js',refs)
            for ref in refs:
                with get('/'+ref) as r:self.assertEqual(r.status,200,ref);self.assertGreater(len(r.read()),0,ref)
            with get('/bubble-layout.js') as r:
                self.assertEqual(r.read(),(ROOT/'lab/bubble-layout.js').read_bytes());self.assertEqual(r.headers['X-Content-Type-Options'],'nosniff');self.assertIn('javascript',r.headers['Content-Type'])
            # The real local API must preserve structured errors without calling paid services.
            for route,body,code in [('/api/voice-check',{'provider':'breeze','endpoint':'https://api.breeze.blue','key':'invalid\nheader'},'key_error'),('/api/synthesize',{'mode':'api','provider':'breeze','endpoint':'https://api.breeze.blue/v1/entitlements','key':'brz_fixture_key','text':'test'},'invalid_request')]:
                host='127.0.0.1:'+str(port)
                req=urllib.request.Request('http://'+host+route,json.dumps(body).encode(),headers={'X-Pet-Window':token,'Origin':'http://'+host,'X-Lab-Request':'companion','Content-Type':'application/json'})
                with self.assertRaises(urllib.error.HTTPError) as raised:urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=5)
                payload=json.loads(raised.exception.read());self.assertEqual(raised.exception.code,400);self.assertEqual(payload['voice']['errorCode'],code)
            for relative,auth,status in [('/bubble-layout.js',False,403),('/server.py',True,404),('/../desktop/bubble.html',True,404)]:
                with self.assertRaises(urllib.error.HTTPError) as e:get(relative,auth)
                self.assertEqual(e.exception.code,status)
            self.assertIsNone(proc.poll(),'server must remain alive after denied requests')
            print('PASS real HTTP: every index script/style 200; bubble module bytes/MIME; auth and static whitelist remain restricted')
        finally:
            proc.stdin.close()
            try:proc.wait(timeout=5)
            except subprocess.TimeoutExpired:proc.terminate();proc.wait(timeout=5)
            proc.stdout.close();proc.stderr.close()
if __name__=='__main__':unittest.main()
