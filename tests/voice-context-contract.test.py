"""Cross-check injected API descriptions against the actual synthesis request builder."""
import json,subprocess,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'lab'))
import tts_api
class VoiceContextContract(unittest.TestCase):
    def test_injected_cloud_formats_match_actual_adapter_fields(self):
        cases=[('breeze','breeze-tts-2','https://api.breeze.blue'),('fish','s2-pro','https://api.fish.audio/v1/tts'),('qwen','qwen3-tts-flash','https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'),('openai','custom-tts','https://tts.example.test/v1/audio/speech')]
        source="import {voiceConfiguration} from './voice-context.js';let text='';for await(const part of process.stdin)text+=part;console.log(JSON.stringify(voiceConfiguration(JSON.parse(text))));"
        for provider,model,endpoint in cases:
            with self.subTest(provider=provider):
                settings={'mode':'api','provider':provider,'model':model,'voice':'fixture-voice','fixedDirection':'固定音色','guidance':2.5}
                injected=json.loads(subprocess.check_output(['node','--input-type=module','-e',source],input=json.dumps(settings).encode(),cwd=ROOT))
                _,_,headers,body=tts_api.build({'provider':provider,'endpoint':endpoint,'key':'fixture-only-key','model':model,'voice':'fixture-voice','instruction':'本轮演绎方向','guidance':2.5},'你好')
                self.assertEqual(set(injected['adapter']['body']),set(body))
                self.assertEqual(injected['adapter']['acceptsDirection'],'instructions' in body)
                self.assertEqual(injected['model'],model)
                self.assertNotIn('fixture-only-key',json.dumps(injected))
                if provider=='breeze':self.assertEqual(injected['adapter']['body']['voice_settings'],body['voice_settings'])
                if provider=='qwen':self.assertEqual(set(injected['adapter']['body']['input']),set(body['input']))
if __name__=='__main__':unittest.main()
