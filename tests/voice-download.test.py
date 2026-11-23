"""Real local HTTP coverage for resumable environment downloads."""
import importlib.util
import pathlib
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
spec=importlib.util.spec_from_file_location('managed_voice',pathlib.Path(__file__).parents[1]/'lab'/'managed_voice.py')
voice=importlib.util.module_from_spec(spec);spec.loader.exec_module(voice)
class Downloads(unittest.TestCase):
 def test_failure_retry_resume_and_routes(self):
  seen=[]
  class Handler(BaseHTTPRequestHandler):
   def log_message(self,*args): pass
   def do_GET(self):
    seen.append((self.path,self.headers.get('Range')))
    if self.path=='/fail': self.send_error(503);return
    resumed=self.headers.get('Range')=='bytes=3-'
    self.send_response(206 if resumed else 200)
    if resumed:self.send_header('Content-Range','bytes 3-5/6')
    data=b'def' if resumed else b'abcdef'
    self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
  server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:
   with tempfile.TemporaryDirectory() as folder:
    target=pathlib.Path(folder)/'file';part=target.with_name('file.part');part.write_bytes(b'abc')
    base=f'http://127.0.0.1:{server.server_port}'
    with self.assertRaisesRegex(ValueError,'HTTP 503'):voice._download(base+'/fail',target)
    self.assertEqual(part.read_bytes(),b'abc')
    voice._download(base+'/ok',target)
    self.assertEqual(target.read_bytes(),b'abcdef');self.assertFalse(part.exists())
    self.assertEqual(seen[-1],('/ok','bytes=3-'))
    part.write_bytes(b'abc');voice._download(base+'/ok',target)
    self.assertEqual(target.read_bytes(),b'abcdef')
   self.assertIn('tsinghua',voice.source_routes('china')['pip'])
   self.assertEqual(voice.source_routes('china')['hf'],'https://hf-mirror.com')
   self.assertEqual(voice.source_routes('official')['hf'],'https://huggingface.co')
   for key in ('torch','python','code'):self.assertEqual(voice.source_routes('china')[key],voice.source_routes('official')[key])
  finally:server.shutdown();server.server_close();thread.join()
if __name__=='__main__':unittest.main()
