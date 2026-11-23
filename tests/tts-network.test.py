import sys,pathlib,unittest,urllib.request,urllib.error,ssl,socket,io,json,os,subprocess,tempfile,threading,shutil
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
sys.dont_write_bytecode=True
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'lab'))
import tts_api as t

class Network(unittest.TestCase):
    def test_error_categories(self):
        cases=[(ssl.SSLEOFError(8,'private EOF'),'connect',True,'proxy_tls_eof'),(ssl.SSLEOFError(8,'private EOF'),'connect',False,'tls_eof'),(ssl.SSLCertVerificationError(1,'private cert'),'connect',True,'ssl_certificate_error'),(socket.gaierror(-2,'private DNS'),'connect',False,'dns_error'),(TimeoutError('private timeout'),'connect',False,'connect_timeout'),(TimeoutError('private timeout'),'read',False,'read_timeout')]
        for error,stage,proxy,code in cases:
            with self.subTest(code=code):
                result=t.network_error(urllib.error.URLError(error),stage,proxy);self.assertEqual(result.voice_details['errorCode'],code);self.assertEqual(result.voice_details['proxyUsed'],proxy);self.assertNotIn('private',str(result))
    def test_auth_check_contract_no_synthesis(self):
        body={'provider':'breeze','endpoint':'https://api.breeze.blue','key':'brz_fixture_secret_1234','network':'system'}
        with patch.object(t,'request',return_value=(b'{"voices":[],"private":"private-account"}','application/json')) as req:
            result=t.check_key(body)
        self.assertEqual(req.call_count,1);self.assertEqual(req.call_args.args,('https://api.breeze.blue/v1/voices',{'xi-api-key':body['key'],'Accept':'application/json'}));self.assertEqual(req.call_args.kwargs,{'network':'system'});self.assertEqual(result,{'validated':True,'httpStatus':200,'checkEndpoint':'voices'});self.assertNotIn('private-account',str(result))
    def test_success_status_with_unknown_shape_is_not_misreported_as_bad_key(self):
        with patch.object(t,'request',return_value=(b'{"unexpected":true}','application/json')):
            with self.assertRaises(t.TtsError) as raised:t.check_key({'provider':'breeze','endpoint':'https://api.breeze.blue','key':'opaque'})
        self.assertEqual(raised.exception.voice_details['httpStatus'],200)
        self.assertEqual(raised.exception.voice_details['errorCode'],'invalid_check_response')
    def test_breeze_401_is_not_a_region_error(self):
        error=urllib.error.HTTPError('https://api.breeze.blue',401,'auth',{},io.BytesIO(b'{"ok":false,"code":"AUTH_REQUIRED","detail":"private text"}'))
        with patch.object(t.urllib.request,'build_opener') as opener:
            opener.return_value.open.side_effect=error
            with self.assertRaises(t.TtsError) as raised:t.request('https://api.breeze.blue/v1/voices',{'xi-api-key':'brz_fixture_secret_1234'})
        self.assertEqual(raised.exception.voice_details['httpStatus'],401);self.assertEqual(raised.exception.voice_details['errorCode'],'AUTH_REQUIRED');self.assertNotIn('地域',str(raised.exception));self.assertNotIn('private',str(raised.exception));self.assertEqual(opener.return_value.open.call_count,1)
    @unittest.skipUnless(shutil.which('openssl'),'local HTTPS test needs openssl')
    def test_real_tls_direct_ignores_proxy_but_explicit_proxy_reports_eof(self):
        with tempfile.TemporaryDirectory(prefix='lc-network-') as folder:
            cert=pathlib.Path(folder)/'cert.pem';key=pathlib.Path(folder)/'key.pem'
            subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(cert),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            hits={'direct':0,'proxy':0}
            class Target(BaseHTTPRequestHandler):
                def log_message(self,*_):pass
                def do_GET(self):hits['direct']+=1;self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"ok":true}')
            class Proxy(BaseHTTPRequestHandler):
                def log_message(self,*_):pass
                def do_CONNECT(self):hits['proxy']+=1;self.send_response(200);self.end_headers();self.close_connection=True
            target=ThreadingHTTPServer(('127.0.0.1',0),Target);context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(cert,key);target.socket=context.wrap_socket(target.socket,server_side=True)
            proxy=ThreadingHTTPServer(('127.0.0.1',0),Proxy);threads=[threading.Thread(target=s.serve_forever,daemon=True) for s in (target,proxy)]
            for thread in threads:thread.start()
            trusted=ssl.create_default_context(cafile=str(cert));original=urllib.request.build_opener
            def opener(*handlers):return original(*handlers,urllib.request.HTTPSHandler(context=trusted))
            env={'HTTPS_PROXY':'http://127.0.0.1:'+str(proxy.server_port),'NO_PROXY':''}
            try:
                with patch.dict(os.environ,{**({'SystemRoot':os.environ['SystemRoot']} if 'SystemRoot' in os.environ else {}),**env},clear=True),patch.object(t.urllib.request,'build_opener',side_effect=opener):
                    url='https://localhost:'+str(target.server_port)+'/'
                    self.assertEqual(t.request(url,{'Accept':'application/json'})[0],b'{"ok":true}');self.assertEqual(hits,{'direct':1,'proxy':0})
                    with self.assertRaises(t.TtsError) as raised:t.request(url,{'Accept':'application/json'},network='system')
                    details=raised.exception.voice_details
                    expected={'SSLEOFError':'proxy_tls_eof','ConnectionAbortedError':'connection_reset','ConnectionResetError':'connection_reset'}
                    self.assertEqual(details['errorCode'],expected[details['errorType']]);self.assertTrue(raised.exception.voice_details['proxyUsed']);self.assertEqual(hits,{'direct':1,'proxy':1})
            finally:
                for server in (target,proxy):server.shutdown();server.server_close()
                for thread in threads:thread.join()
if __name__=='__main__':unittest.main()
