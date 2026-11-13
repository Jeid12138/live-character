import sys,pathlib,json,unittest
from unittest.mock import patch
sys.dont_write_bytecode=True
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'lab'))
import tts_api as t
class KeyContract(unittest.TestCase):
    def test_shared_normalized_key_cases(self):
        for item in json.loads((ROOT/'tests/fixtures/voice-key-cases.json').read_text(encoding='utf-8')):
            with self.subTest(name=item['name']):self.assertEqual(t.valid_api_key(item.get('normalized',item['input'])),item.get('valid',True))
        self.assertFalse(t.valid_api_key('brz_'+ 'x'*4096));self.assertTrue(t.valid_api_key('brz_'+ 'x'*4092))
    def test_fixture_read_is_explicit_utf8_on_non_utf8_hosts(self):
        original=pathlib.Path.read_text
        def strict(path,*args,**kwargs):
            self.assertEqual(kwargs.get('encoding'),'utf-8')
            return original(path,*args,**kwargs)
        with patch.object(pathlib.Path,'read_text',strict):self.test_shared_normalized_key_cases()
    def test_opaque_keys_reach_auth_header_unchanged(self):
        key='key_public_fixture.v1+segment/pad='
        with patch.object(t,'request',return_value=(b'{"voices":[]}','application/json')) as request:
            result=t.check_key({'provider':'breeze','endpoint':'https://api.breeze.blue','key':key,'network':'direct'})
        self.assertTrue(result['validated']);self.assertEqual(request.call_args.args[1]['xi-api-key'],key);self.assertEqual(request.call_count,1)
if __name__=='__main__':unittest.main()
