'use strict';
(()=>{
 const catalog={
  breeze:{name:'Breeze · 官方 API',endpoint:'https://api.breeze.blue',models:['breeze-tts-2','breeze-tts-2-multilingual'],voice:'',voiceLabel:'Breeze 音色 ID',voicePlaceholder:'在 Breeze 选择或创建的音色，例如 voc_…',keyLabel:'Breeze API Key（创建时显示的完整密钥）',instruction:true,check:true,help:'API Key 是创建时显示一次的完整秘密值。key_… 是公开密钥管理 ID，不能替代 API Key；voc_… 是音色 ID。保存不联网，测试连接只验证认证；试播才检查合成。官方文档：https://docs.breezeblue.ai/authentication'},
  fish:{name:'Fish Audio · 官方 API',endpoint:'https://api.fish.audio/v1/tts',models:['s2-pro','s2.1-pro','s2.1-pro-free'],voice:'',voiceLabel:'Fish 音色 ID（reference_id）',voicePlaceholder:'Fish 平台声音／模型的 ID',keyLabel:'Fish Audio API Key',help:'模型通过 model 请求头发送，音色对应 reference_id。当前接入已创建音色，不上传参考音频；演绎使用该模型支持的文本标签，不发送 Breeze 指令。保存不联网，可直接试播。官方文档：https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech'},
  qwen:{name:'Qwen3-TTS · 阿里云百炼',endpoint:'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',models:['qwen3-tts-flash'],voice:'Cherry',voiceLabel:'百炼音色名称',voicePlaceholder:'例如 Cherry；须属于所选模型',keyLabel:'百炼 API Key（须与地域对应）',help:'当前接入 Qwen3-TTS 非实时 HTTP 协议，使用系统音色名称。北京和新加坡的 Key 不通用。当前线路无需填写 Workspace；新版 Qwen-Audio-TTS／专属域名是另一套接入，尚未启用。官方文档：https://help.aliyun.com/zh/model-studio/qwen-tts-api'},
  index:{name:'IndexTTS · 本地适配器',models:['IndexTTS2'],kind:'local',unavailable:true,help:'官方提供本地推理 SDK，未接入统一官方云 API。请通过通用本地模型服务连接已配置的 IndexTTS 适配器。'},
  auk:{name:'AuK-Flash · 本地适配器',models:['AuK-Flash'],kind:'local',unavailable:true,help:'官方提供本地 CLI／推理接口，未接入统一官方云 API。请通过通用本地模型服务连接已配置的 AuK 适配器。'},
  openai:{name:'自定义 · OpenAI 兼容协议',endpoint:'',models:[],voice:'alloy',voiceLabel:'服务商音色名称 / ID',voicePlaceholder:'填写该服务实际支持的音色',keyLabel:'服务商 API Key',help:'仅用于服务商明确支持的 /audio/speech 协议；填写最终 HTTPS 合成地址、模型和音色。不会把 Breeze、Fish 或百炼强行按此格式调用。'}
 };
 window.LCVoiceCatalog=catalog;
})();
