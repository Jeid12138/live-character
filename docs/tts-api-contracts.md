# Live Character 0.12.28：语音服务字段与调用协议

## 0.12.43 云端流式播放

开启语音流式播放后，桌面主进程读取已保存的加密凭据，通过本机合成服务连接官方 API。系统代理和直连沿用语音设置。流式输出统一为 24 kHz、16 位小端序、单声道 PCM。关闭流式播放可使用下文的完整音频接口。

- Breeze 的两个已接入模型使用语音 ID 对应的 `/stream?output_format=pcm` 接口，沿用演绎指令和强度。https://docs.breezeblue.ai/api-reference/text-to-speech/stream-text-to-speech
- Fish 的三个已接入 S2 模型使用 `/v1/tts` 的 PCM 响应和 24000 Hz 采样率，模型继续通过 `model` 请求头选择。https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
- Qwen 的 `qwen3-tts-flash` 在已选地域启用 `X-DashScope-SSE`，逐条解码 `output.audio.data`，以 `finish_reason: stop` 确认结束。https://help.aliyun.com/zh/model-studio/qwen-tts-api

核对日期：2026-11-12。本页描述当前实现；付费服务发声仍需用户本机验证，协议测试不等于真实账号验证。

## 配置流程与界面

选择服务商后只显示对应字段，官方地址自动填写。高级区放网络及当前服务实际支持的演绎设置。只有自定义 OpenAI 兼容服务需要手动填写完整合成地址。

| 服务 | 当前实现 / 必填栏目 | 认证方式 / 请求格式 |
|---|---|---|
| Breeze | API Key、模型、音色 ID；演绎指令可选 | xi-api-key；音色在路径，正文 text、model_id、instructions |
| Fish Audio | API Key、S2 模型、Fish reference_id | Bearer；模型在请求头 model，正文 text、reference_id |
| Qwen3-TTS / 百炼 | 地域、地域对应 API Key、qwen3-tts-flash、系统音色名称 | Bearer；正文 model、input.text、input.voice、input.language_type |
| 自定义 OpenAI 兼容 | 最终 HTTPS 合成地址、Key、模型、音色 | Bearer；正文 model、input、voice、response_format |
| IndexTTS / AuK-Flash | 不列为可用云服务；本地引擎需自行配置通用本地适配器 | 不虚构官方云 API，不自动安装或后台启动引擎 |

百炼当前只接入既有非实时 HTTP 线路，北京与新加坡 Key 分开保存；此线路不要求用户填写 Workspace。新版 SDK / Workspace 专属域名与 Qwen-Audio-TTS 是单独接入任务，没有混入当前模型列表。Fish 的参考音频直传、各家的实时模式与更多型号也不在本版冒充已完成。

## 保存、测试连接、试播互相独立

- **保存语音设置**：仅在本机加密保存密钥并事务写入角色设置；不发起云端请求。网络不可用或全部 AI 调用关闭时仍可保存。新密钥显示尚未验证；留空保留已有密钥。保存失败回滚两者，错误日志保留分类。
- **测试连接**：仅 Breeze 展示，使用官方 GET /v1/voices；不合成语音，不调用 DeepSeek。可以测试本次输入或已存 Key；候选测试成功或失败都不自动保存候选 Key，也不提交角色设置。测试已存 Key 才更新对应认证元数据。角色或密钥变化时忽略过期结果。其他服务没有已接入的只读测试接口，隐藏此按钮。
- **语音试播**：固定文本“Live Character试播启动中”；仅使用已保存设置与 Key，不自动保存或先调用认证接口；不要求认证状态为 accepted。实际合成验证密钥、模型、音色与权限，可能产生服务商费用，不额外调用 DeepSeek。未保存修改仍需先保存，避免试播使用错误配置。
- 全部 AI 调用关闭时，云端测试及合成会停止；保存不受影响。所有云请求失败不自动重试。

## 密钥与 ID

Breeze 的认证文档将公开 key_… 描述为密钥管理 ID；本地已允许任意安全前缀发到云端，不据前缀裁定真实性。真实 API Key 只在创建或轮换时显示一次，服务调用必须使用真实秘密值。voc_… 是音色 ID。插件不需要填写公开密钥 ID，也不能据公开 ID 还原秘密值。

本地不按 brz_ / sk_ 等前缀或供应商猜测字符集认证。只检查空值、长度和可安全发送的可见 ASCII 请求头字符。仅清理首尾空白，不悄悄删除内部空格、换行或零宽字符。key_ / voc_ 出现在 Breeze 密钥框时给黄色、非阻断提示；实际有效性由云端决定。

密钥长期存于 Electron 系统加密存储，不在插件内设置过期时间；服务侧的吊销或到期仍以供应商响应为准。凭据按服务商和地址隔离；配置导出、DSH 回读和常规诊断不会输出完整 Key。跨设备需重新填写 Key。原 v1 加密文件兼容，不迁移或清理角色资产。

官方认证说明：https://docs.breezeblue.ai/authentication

## 已实现的请求代码格式

以下均为说明示例，不包含真实密钥。插件使用内置 Python 标准库实现，无需为这些云接口再安装 SDK。实际实现见 `lab/tts_api.py`；请求仅在用户试播或已启用朗读时发生。

### Breeze

```bash
curl --request POST \
  'https://api.breeze.blue/v1/text-to-speech/voc_YOUR_VOICE?output_format=wav_24000' \
  --header "xi-api-key: $BREEZE_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"model_id":"breeze-tts-2","text":"今天也想陪着你。","instructions":"像刚刚见到熟悉的人，轻声说，带一点笑意。","voice_settings":{"guidance_scale":2.5}}' \
  --output speech.wav
```

JSON 中是 `text`、`model_id`、`instructions`；`guidance_scale` 放在 `voice_settings` 内。短句 HTTP 本版保守限制 1000 字，指令 1000 字；超过时说明原因，不偷偷截断台词。音色先在服务侧创建或选择，插件不把本地参考音频误传到这个云接口。

官方资料：
- https://docs.breezeblue.ai/guides/text-to-speech
- https://docs.breezeblue.ai/guides/voice-instruction-prompting
- https://pypi.org/project/breeze-blue/ （本次核对 SDK 0.23.0 的路径与字段，未打包其 SDK）

### Fish S2 Pro

```bash
curl --request POST 'https://api.fish.audio/v1/tts' \
  --header "Authorization: Bearer $FISH_API_KEY" \
  --header 'Content-Type: application/json' \
  --header 'model: s2-pro' \
  --data '{"text":"你好，我在这里。","reference_id":"YOUR_FISH_VOICE_ID","format":"wav","latency":"normal"}' \
  --output speech.wav
```

关键差异：模型在 `model` 请求头；音色是 `reference_id`；正文是 `text`，不是 OpenAI 的 `input`。不把其他服务的音色 ID 或指令字段直接塞给 Fish。S2.1 型号是另一个可选型号，不擅自替换用户所选 S2 Pro。

官方协议：https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech

### Qwen3-TTS / 百炼

```bash
curl --request POST \
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"model":"qwen3-tts-flash","input":{"text":"今天也一起工作吧。","voice":"Cherry","language_type":"Auto"}}'
```

响应 JSON 的 `output.audio.url` 指向音频，不是音频本身。插件另行 GET 下载；该 GET 不带 API Key。官方示例中的 OSS HTTP 链接只在确认是官方 OSS 域名后升级 HTTPS，禁止把返回的任意内网地址作为下载目标。支持北京与新加坡域名，API Key 必须属于对应地域。

当前概述仅列 `qwen3-tts-flash` 和实时版；本版实现前者。旧检索索引还含 instruct / vc / vd 型号，但当前概述已变更，因此没有默认开放这些旧型号。新版 `qwen-audio-3.1-tts-flash` 是适合低延迟与自由演绎的另一系列，不能只改模型字符串就假定能沿用所有旧字段。

官方资料：
- https://help.aliyun.com/zh/model-studio/qwen-tts-api
- https://help.aliyun.com/zh/model-studio/tts-model/
- https://help.aliyun.com/zh/model-studio/voice-cloning-user-guide

## IndexTTS 与 AuK：记录真实接口，不编造云协议

IndexTTS 原作者仓库给出本地 Python 调用。示例需安装该项目的独立推理环境与权重，不应放入 LC 的内嵌 Python 3.13 环境直接执行。

```python
from indextts.infer_v2 import IndexTTS2
engine = IndexTTS2(cfg_path="checkpoints_2/config.yaml",
                   model_dir="checkpoints_2", use_fp16=False,
                   use_cuda_kernel=False, use_deepspeed=False)
engine.infer(spk_audio_prompt="reference.wav", text="你好，我在这里。",
             output_path="speech.wav", verbose=True)
```

2.5 使用 `indextts.infer_v2_5` 与不同权重配置，不能混用。要接第三方托管 IndexTTS，需按其服务商文档另写适配器；例如检索到的 indextts.online 是第三方异步任务协议，不代表原作者官方协议，本版未接入。

官方仓库：https://github.com/index-tts/index-tts

AuK-Flash 的官方 CLI 示例形式：

```bash
auk-infer --ckpt ckpts/AuK-Flash/auk_flash.safetensors \
  --audio reference.wav \
  --instruction "Say the following with the same voice: 'Hello, I am here.'" \
  --gen_seconds 3 --output speech.wav
```

需完整的官方权重与独立环境。官方 A800 / BF16 测量中，Flash 在 CPU offload 后仍约 16.75–16.98 GiB 显存；不能承诺用户的 8GB 或 12GB 设备能按这条路线运行。

官方仓库：https://github.com/Tencent-Hunyuan/AuK

## 适合 LC 的 Breeze 实时模式

`Realtime character response` 是交互分段、限流和取消方案，不是 `model_id`。`entitlements` 只辅助计算并发额度。真正的实时 TTS 使用长连接；本版仍是短句 HTTP 完整音频返回后播放，没有把缓冲下载假称为边生成边播。

后续实现建议：角色同一轮模型回复同时给出台词和自由文本演绎指令；避免为每句话再调用一次 DeepSeek。先形成完整短句，再交给语音队列；只播角色说的话，不把舞台说明直接朗读。模型自主判断情绪，不加入固定情绪格。

官方实时 SDK 的调用形式（**本版未执行 / 未打包**）：

```python
async with client.text_to_speech.connect_managed(
    voice_id="voc_YOUR_VOICE", model_id="breeze-tts-2"
) as connection:
    # 同时保留且只保留一个音频 / 事件消费者。
    await connection.start_turn("turn_1")
    await connection.append_text("你好，我在这里。")
    await connection.flush()
    await connection.end_turn()
    # 消费音频直到 turn.done；播放用同一个音频时钟驱动嘴型。
```

长期保存的 API Key 与实时连接的短期 `client_secret` 是两类凭据。后者需要按官方规则刷新，不能当成长期 Key。轮间更新指令要等待 `session.updated`，新问题使旧语音失效时取消旧轮并清除队列。这个阶段还需要统一台词显示、音频播放时钟及口型输出；0.12.28 不宣称已完成。

官方指南：
- https://docs.breezeblue.ai/guides/realtime-character-response
- https://docs.breezeblue.ai/guides/realtime-text-to-speech

## 本地硬件与覆盖目标

建议开发目标先设为 Windows x64、16GB RAM、8GB 显存；6GB 显存作为轻量兼容测试档，CPU 与 API 保底。这里是待实测的目标，不是已证明的最低配置。

| 设备 / 档位 | 建议路线 | 尚需验证 |
|---|---|---|
| 你的 RTX 5060 8GB / 32GB | 社区 Breeze C++ / Vulkan，优先 Q4_K；显存充足再 Q8_0 | 与正在运行的 AI 工作软件共存时的可用显存、首音延迟、连续合成 |
| NAS RTX 3060 12GB / 64GB | 独立语音后台，优先 Q8_0；桌面角色走局域网 | NAS 系统、容器 / 虚拟机能否访问 GPU、驱动与网络延迟 |
| 面向普通用户 | 16GB RAM + 8GB 显存作为目标；API 不要求本地推理显卡 | 多厂牌 GPU、6GB 档位、长回复、模型切换与休眠唤醒 |

社区实现给出的参考值为 Q4_K 约 3GB、Q8_0 约 4GB 显存，且包含 Windows Vulkan 预编译版本；这不是官方 PyTorch 运行时的同一套依赖，也不是本机实测。必须带对应 audio_tokenizer / vocoder；仅放入一个 GGUF 不代表资产完整。其代码和模型权重的许可分开，正式捆绑权重前要核对授权条件。

资料：https://github.com/HoppouAI/Breeze-TTS-2.cpp

Steam 2026 年 10 月合并平台样本：16GB RAM 41.42%，32GB 37.06%；已列出的 ≥16GB RAM 档合计约 88.04%。已列出的 ≥8GB 显存档合计约 78.53%。这些是自愿调查的边际分布，不是 LC 实测覆盖率；不把两项直接相乘推断实际用户性能，也不把所有 GPU 视为 CUDA 可用。以此判断 16GB / 8GB 的容量目标有希望覆盖超过一半样本，但最终必须用安装成功率和首音 / 连续播放实测确认。

资料：https://store.steampowered.com/hwsurvey


## 故障记录与验证边界

日志保留操作类型 save / check / synthesize、密钥来源、字符数、静态前缀类别、脱敏指纹、HTTP 状态和稳定错误码。公开 key_ 前缀只是提示，不作为本地认证失败原因。401 不删除已存 Key；404、403、402、429 及 TLS / 代理问题分开记录。收到音频与成功播放分开跟踪，避免把系统播放故障当成密钥无效。

测试使用本地请求替身、TLS/代理服务器及系统加密替身；未使用用户真实 Key，没有付费合成，没有在用户 Windows/DSH 上进行现场测试。

## 0.12.28：台词、演绎、音频与口型

本版在同一次角色会话中请求 speech.instructions，自由描述情绪、意图、节奏、停顿或重音，与 text 分离；不额外调用 DeepSeek，也不使用固定情绪格。若模型没提供有效指令，按当次情绪、性格卡及互动类型生成简短后备指令。设置中的固定约束仅作为补充。Breeze instructions 与 text 使用相同语言，guidance_scale 可在 1–10 调整，默认 2.5；越大不保证越自然。其他服务不会被强行塞入 Breeze 字段。

启用朗读且未静音时，先保存会话回复，再等待完整音频返回，播放开始后显示台词气泡并启动动作。音频播放失败则保留文字。气泡逐字渐显使用音频 currentTime，与嘴型使用同一个时钟；播放暂停或缓冲时不靠墙钟提前消失。读完音频后再停留自定义时间。未启用朗读使用原有自动/固定时长设置。对话标签新增渐显开关、速度、完整文字阅读时间、语音结束后停留时间。桌面原生气泡先按完整台词测量，渐显只更新文字可见范围，不推动角色、不反复改变窗口大小。

口型优先采用返回或导入的真实元音时间轴。否则解码实际返回的 PCM 或浏览器支持音频，按播放位置计算能量与频谱，近似生成 AIUEO 权重和开合/圆唇/展开等目标。目标同时映射到模型实际存在的默认口型、AIUEO、VBridger 相关参数；VTS 自带的输入输出映射优先，所有值限制在当前参数实际范围内，不写物理输出参数。音频停止后平滑回归原有表情。

**频谱近似不是精确音素识别，不保证每个 AIUEO 或 VBridger 细节都与发音一一对应。** 仅有 Cubism Core 或 motionsync3.json 不等于已安装音频分析引擎；本版没有假装集成官方 MotionSync/CRI/OVR 运行时。需要更精确时可继续接入真实的对齐/口型时间轴。官方 Live2D 默认口型示例基于音量，MotionSync 则是分析器与映射结合；VBridger 输入和模型 Live2D ID 也不是同一命名空间。

音量按钮位于桌面置顶按钮下，展开竖向滑条和静音。音量和静音在本机保存；静音或音量 0 时停止当前朗读、阻止新 TTS 并丢弃晚到音频。已提交到云端的合成请求无法保证撤销计费。解除静音不自动补播，AI 回复文字仍正常呈现。

连接测试改为官方 GET /v1/voices，使用同一已存秘密值和 xi-api-key。只读 JSON 结构不识别报告 invalid_check_response/HTTP 200，不伪造成 401；不阻止实际试播。前缀不是本地错误条件。

新增参考：
- https://docs.breezeblue.ai/api-reference/voices/list-voices
- https://docs.breezeblue.ai/guides/voice-instruction-prompting
- https://docs.live2d.com/en/cubism-sdk-manual/lipsync/
- https://docs.live2d.com/en/cubism-editor-manual/motion-sync/
- https://docs.live2d.com/en/cubism-sdk-manual/motion-sync-setting-web/
- https://cdn.steamstatic.com/steam/apps/1898830/manuals/VBridger_Manual_1.06.pdf
