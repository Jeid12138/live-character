"""Cloud contracts without spending API credits; exact outgoing requests are inspected."""
import sys,pathlib,unittest,io,wave,json,base64,urllib.error
from unittest.mock import patch
from contextlib import nullcontext
from email.message import Message
sys.dont_write_bytecode=True
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'lab'))
import tts_api as t
import companion
def wav():
    b=io.BytesIO()
    with wave.open(b,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000);w.writeframes(b'\0\0'*2400)
    return b.getvalue()
def body(provider):
    return {'mode':'api','provider':provider,'endpoint':{'breeze':'https://api.breeze.blue','fish':'https://api.fish.audio/v1/tts','qwen':'https://dashscope.aliyuncs.com'+t.QWEN_PATH,'openai':'https://voice.example/v1/audio/speech'}[provider],
      'model':{'breeze':'breeze-tts-2','fish':'s2-pro','qwen':'qwen3-tts-flash','openai':'custom-model'}[provider],'voice':'voc_test123' if provider=='breeze' else 'Cherry' if provider=='qwen' else 'voice-a','text':'你好','instruction':'略带笑意，语速轻缓','key':'fixture-secret'}
class Providers(unittest.TestCase):
    def test_cloud_pcm_contracts(self):
        class Response:
            length=0
            def __init__(self,mime):
                self.headers=Message()
                self.headers['Content-Type']=mime
                self.audio=iter((b'\x01\x02\x03',b'\x04',b''))
            def read1(self,_):
                return next(self.audio)
        for provider,models in {
            'breeze':('breeze-tts-2','breeze-tts-2-multilingual'),
            'fish':('s2-pro','s2.1-pro','s2.1-pro-free'),
        }.items():
            for model in models:
                settings={**body(provider),'model':model,'network':'system'}
                with self.subTest(model=model),patch.object(t,'open_response',return_value=nullcontext(Response('application/octet-stream'))) as upstream:
                    self.assertEqual(list(companion.synthesize_stream(settings,lambda:False)),[b'\x01\x02',b'\x03\x04'])
                    url,headers,payload,network=upstream.call_args.args
                    self.assertEqual(network,'system')
                    if provider=='breeze':
                        self.assertTrue(url.endswith('/stream?output_format=pcm'))
                        self.assertEqual(headers['xi-api-key'],settings['key'])
                        self.assertEqual(payload['model_id'],model)
                        self.assertEqual(payload['instructions'],settings['instruction'])
                    else:
                        self.assertEqual(headers['model'],model)
                        self.assertEqual(payload['format'],'pcm')
                        self.assertEqual(payload['sample_rate'],24000)

    def test_qwen_sse_stream_and_incomplete_response(self):
        partial=b'id:1\r\ndata: {"output":{"finish_reason":"null","audio":{"data":"AQI="}}}\r\n\r\n'
        terminal=b'id:2\ndata: {"output":{"finish_reason":"stop","audio":{"url":"http://untrusted.invalid/audio"}}}\n\n'
        settings={**body('qwen'),'endpoint':'https://dashscope-intl.aliyuncs.com'+t.QWEN_PATH}
        for close in (terminal,b''):
            response=io.BytesIO(partial+close)
            response.headers=Message()
            response.headers['Content-Type']='text/event-stream; charset=utf-8'
            with self.subTest(terminal=bool(close)),patch.object(t,'open_response',return_value=nullcontext(response)) as upstream:
                chunks=companion.synthesize_stream(settings,lambda:False)
                self.assertEqual(next(chunks),b'\x01\x02')
                if close:
                    self.assertEqual(list(chunks),[])
                    url,headers,_,_=upstream.call_args.args
                    self.assertEqual(url,settings['endpoint'])
                    self.assertEqual(headers['X-DashScope-SSE'],'enable')
                    self.assertEqual(upstream.call_count,1)
                else:
                    with self.assertRaises(t.TtsError): next(chunks)

    def test_unsupported_or_cancelled_stream_never_submits(self):
        with patch.object(t,'open_response') as upstream:
            self.assertEqual(list(companion.synthesize_stream(body('breeze'),lambda:True)),[])
            with self.assertRaises(t.TtsError):
                list(companion.synthesize_stream(body('openai'),lambda:False))
            upstream.assert_not_called()

    def test_breeze_contract(self):
        p,url,h,data=t.build(body('breeze'),'你好')
        self.assertEqual(url,'https://api.breeze.blue/v1/text-to-speech/voc_test123?output_format=wav_24000');self.assertEqual(h['xi-api-key'],'fixture-secret');self.assertNotIn('Authorization',h)
        self.assertEqual(data,{'text':'你好','model_id':'breeze-tts-2','instructions':'略带笑意，语速轻缓','voice_settings':{'guidance_scale':2.5}})
    def test_fish_model_header(self):
        p,url,h,data=t.build(body('fish'),'你好');self.assertEqual(h['model'],'s2-pro');self.assertEqual(h['Authorization'],'Bearer fixture-secret');self.assertEqual(data,{'text':'你好','reference_id':'voice-a','format':'wav','latency':'normal'});self.assertNotIn('model',data);self.assertNotIn('instructions',data)
    def test_qwen_instruction_and_region(self):
        b=body('qwen');b['endpoint']='https://dashscope-intl.aliyuncs.com'+t.QWEN_PATH
        p,url,h,data=t.build(b,'你好');self.assertNotIn('instructions',data['input']);self.assertNotIn('instructions',data)
        b['model']='qwen3-tts-instruct-flash'
        with self.assertRaises(ValueError):t.build(b,'你好')
    def test_openai_custom(self):
        _,_,h,data=t.build(body('openai'),'你好');self.assertEqual(data,{'model':'custom-model','input':'你好','voice':'voice-a','response_format':'wav'})
    def test_bad_example_and_cross_protocol_rejected(self):
        for provider,url in [('breeze','https://api.breeze.blue/v1/entitlements'),('openai','https://api.breeze.blue/v1/entitlements'),('fish','https://api.fish.audio/v1/health'),('qwen','https://example.com'+t.QWEN_PATH)]:
            b=body(provider);b['endpoint']=url
            with self.subTest(provider=provider),self.assertRaises(ValueError):t.build(b,'你好')
    def test_credentials_and_limits_no_silent_truncation(self):
        for provider,n in [('breeze',1001),('qwen',601),('fish',2001)]:
            with self.subTest(provider=provider),self.assertRaises(ValueError):t.build(body(provider),'字'*n)
        b=body('breeze');b['voice']='foo/../../other'
        _,url,_,_=t.build(b,'你好');self.assertIn('foo%2F..%2F..%2Fother',url)
        b=body('fish');b['key']='secret\r\nInjected: true'
        with self.assertRaises(ValueError):t.build(b,'你好')
    def test_local_only_entries_cannot_send_a_key(self):
        for provider in ['index','auk']:
            with self.assertRaises(ValueError):t.validate_url(provider,'https://example.com')
    def test_audio_validation(self):
        self.assertEqual(base64.b64decode(t.audio_result(wav(),'application/octet-stream')['audio']['base64']),wav())
        self.assertEqual(t.audio_result(b'ID3\x04fixture','audio/mpeg')['audio']['mime'],'audio/mpeg')
        for raw,mime in [(b'{"balance":100}','application/json'),(b'<html>login</html>','text/html'),(wav()[:-12],'audio/wav')]:
            with self.subTest(mime=mime),self.assertRaises(ValueError):t.audio_result(raw,mime)
    def test_qwen_download_no_key_forwarded_and_http_upgraded(self):
        link='http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/voice.wav?Signature=temporary'
        with patch.object(t,'request',side_effect=[(json.dumps({'output':{'audio':{'url':link}}}).encode(),'application/json'),(wav(),'audio/wav')]) as transport:
            result=companion.synthesize(body('qwen'))
        self.assertEqual(base64.b64decode(result['audio']['base64']),wav());second=transport.call_args_list[1]
        self.assertEqual(second.args,('https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/voice.wav?Signature=temporary',{'Accept':'audio/wav'}))
    def test_qwen_download_rejects_external_hosts(self):
        for link in ['http://127.0.0.1/secret','https://example.com/a.wav','https://a.oss-cn-beijing.aliyuncs.com.evil.test/a.wav']:
            with patch.object(t,'request',return_value=(json.dumps({'output':{'audio':{'url':link}}}).encode(),'application/json')) as transport:
                with self.assertRaises(ValueError):t.synthesize(body('qwen'),'你好')
                self.assertEqual(transport.call_count,1)
    def test_transport_header_and_binary_body(self):
        class Response:
            headers=type('Headers',(),{'get_content_type':lambda self:'audio/wav'})()
            def __enter__(self):return self
            def __exit__(self,*_):pass
            def read(self,n):return wav()
        with patch.object(t.urllib.request,'build_opener') as opener:
            opener.return_value.open.return_value=Response();result=companion.synthesize(body('fish'))
        req=opener.return_value.open.call_args.args[0];self.assertEqual(req.full_url,'https://api.fish.audio/v1/tts');self.assertEqual(req.get_header('Model'),'s2-pro');self.assertEqual(json.loads(req.data)['reference_id'],'voice-a');self.assertEqual(result['audio']['mime'],'audio/wav')
    def test_error_redaction_and_no_retry(self):
        for status in [401,402,429,503]:
            error=urllib.error.HTTPError('https://api.breeze.blue',status,'server',{},io.BytesIO(json.dumps({'code':'GENERATION_CONCURRENCY_EXCEEDED','message':'fixture-secret private dialogue'}).encode()))
            with patch.object(t.urllib.request,'build_opener') as opener:
                opener.return_value.open.side_effect=error
                with self.assertRaises(ValueError) as raised:t.request('https://api.breeze.blue',{'xi-api-key':'fixture-secret'},{'text':'private dialogue'})
                self.assertNotIn('fixture-secret',str(raised.exception));self.assertNotIn('private dialogue',str(raised.exception));self.assertIn(str(status),str(raised.exception));self.assertEqual(opener.return_value.open.call_count,1)
if __name__=='__main__':unittest.main()
