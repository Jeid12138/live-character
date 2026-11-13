# Live Character 0.12.33 · 模型按钮与演出同步修复

日期：2026-11-13。基线：原始 0.12.32，169494532 B，SHA-256 d203d751aa30f5227951a29fb69604843cc27583ac1ad7b1cb8ee0357627facf。
依据：新增切换模型按钮，以及本轮上传的《模型参数与动画同步反馈》《干净安装复核与测试清单》。

## 复核结论

- 反馈中不同皮套的配置身份和真实能力已切换，尚无证据证明核心注入始终停留在旧模型；不把模型输出旧 ID 等同于配置未切换。
- 模型把 mtn_02 / special_02 这类单次 motion 填进 gestures，旧校验会直接丢弃；这是 LC 容错与诊断不足。
- 旧 ID 或未知参数被静默丢弃、姿势按较短 plan.duration 结束，以及停止依赖 active 表，均为确认问题，本轮直接修复。
- 相邻请求的时间差不是实际音频长度，不据此认定音频精确持续 60/101 秒；同步依据实际媒体时长和播放时钟。
- DSH 可能将 runtime context 投影成 user-role 日志。LC outbound prompt 与宿主投影必须区分，不能承诺 DSH 原始历史里完全没有配置，也不删除或隐藏原始日志。

## 修改记录

| 范围 / 文件 | 修改 |
| --- | --- |
| lab/index.html、studio.js、companion.css、app.js | 新增切换模型 SVG 按钮，复用原选择窗口；锁定命中白名单加入按钮；高度不超过 340px 时采用双列全尺寸按钮，避免八个按钮落出短窗口 |
| performance-contract.js | 演出契约 v4：motion/gesture 通道明确；只用当前能力；plan.duration 仍为 0.5–15 秒；语音可延长本地姿势保持，不拉长关键帧或循环单次 motion |
| lab/companion-core.js | 校验 actual gestureNames 和当前 once motions；误放 gestures 的精确有效 motion 可转回单个 motion；不模糊猜名、不创造不存在的动作；多余或冲突项有警告 |
| lab/companion-core.js、companion.js | 参数只接受当前可写 rig；存在但放错 pose/fine 的参数归入正确通道；未知、已证实跨模型、不可写、无效数值分别诊断；关键帧也检查，不静默吞掉 |
| lab/companion.js、desktop/experiences.cjs | 页面警告展示前两项与总数，lastReply 与结构化经历保留校验结果；角色保存有限参数来源索引，只有旧模型归属证据充分才标跨模型，否则标未知 |
| lab/companion-core.js、companion.js | 关键帧时长与语音保持时长分离；音频开始、metadata/durationchange/timeupdate 更新保持期；有限 WAV 时长可作依据；pause/ended/error/mute/Stop 清理本轮音频拥有的临时状态；手动替换过的表情不被旧回复误清 |
| pet-sessions.js | cancel 不依赖 active 表；按会话合并同时取消；准入前阻止被取消事件，准入竞态后再取消；读取公开 state 反馈 running/pending/cursor；保留已取消 UUID，不重新生成 |
| index.js、desktop/main.cjs、lab/companion.js | 取消同步终止本机等待；发送会话/事件身份并校验当前路由；前端取消未确认时明确提示并阻止新自动请求；已完成文本后的音频 Stop 不取消已完成会话 |
| index.js、pet-sessions.js | 无敏感载荷的 transport 诊断记录：实际用户内容类型、配置位置与字节数，帮助归因用户通道和宿主投影 |
| 版本 / 清单 / 测试 / 文档 | 更新到 .33，保留原始 .32 的 50 个可比运行文件指纹；新增专项回归与本轮测试清单 |

不增加推理次数；不增加付费 TTS；不新增固定情绪维度。口型适配、语音接口/密钥、同轮自由演绎、250ms 触摸合并、独立角色预设与经历记录保持原逻辑。

## 演出行为说明

motion 仍只执行一次，不因音频较长而自动重复。pose/fine 的关键帧按原 duration 完成，语音余下时间维持末态，结束后恢复。延迟收到有限音频时长时补延长保持期；Infinity/未知时长不会产生无限占用。测试覆盖 20 秒音频与 4 秒关键帧，以及延迟获得 30 秒时长。

临时表情跟随音频演出；persistent 手势指本轮持续，结束回退；明确 persistent 的配饰表情允许继续保持。不同资源的状态语义保持区分，不把全部表情都当成单次播放。

## 停止的边界

取消走已提供的公开 sessionController.cancel，不再追问相同接口。成功返回后再检查宿主状态；仍 running、队列或 pendingInput 未空、接口错误/状态未知时只说“本地已停止，DSH 仍在结束中/未确认”。公开 cancel 不保证清空全部 pending inbox，本轮不猜测 updateQueue 格式强行删除队列。

本机 stop 清掉语音及临时演出。取消水位范围内的迟到 assistant 不补演；原生历史仍保留已生成内容。已经完成的 assistant 不因停止朗读而被删除或标记成未生成。

## 更新与验收

从 .32 直接更新并完整重启 DSH，角色/资产/配置/独立预设/会话保持兼容，无需删除资产或清空会话。本轮不新增迁移步骤；更早版本的历史绑定限制沿用此前规则。

1. 桌面角色点击切换模型：打开原两级选择窗口；锁定后仍能点；短窗口检查双列排列。
2. 用 gestures 为空但 motions 有单次动作的皮套观察：合法误放名称能执行一次，警告说明通道纠正；不存在的名称仍拒绝。
3. 两皮套交替，观察旧参数警告和经历 validation；当前无归属证据的 ID 显示未知，不假称已证实跨模型。姿势仍按本模型范围与物理输出限制执行。
4. 长台词开启语音，检查音频开始后演出、关键帧完成后的保持以及结束回退；暂停、静音、停止检查临时状态清理。
5. 思考中连续停止、停止后立即发送、停止后等迟到结果，再从 DSH 原生会话看是否仍 running；未确认时应有黄色提示。已完成回复只停止朗读时不应发会话取消。
6. 看 logs/session-last.json 的 transport：LC 用户内容为 lc.event.v3/必要 image，configurationPlacement 为 agent-preset.context。若 DSH 原始历史仍含配置，用宿主投影解释并分别核查，不将其直接判为 LC 用户内容。

## 验证范围

源码回归：110 项 Node + 25 项 Python，共 135 项通过，0 失败、0 跳过。新增 13 项覆盖动作纠正/参数诊断、长音频保持/手动状态所有权、真实页面媒体事件、原生取消竞态与结构化经历落盘；既有按钮测试加入新模型入口与穿透检查。

测试使用 Linux、JSDOM、真实文件/本地 HTTP 和 SDK/原生接口替身；没有真实 Windows DSH、GPU、DPAPI、付费 TTS 或 Chromium 联调。本包仍需本机检查窗口呈现、宿主取消语义和真实语音播放。最终归档文件数、哈希和解压包回归见外附 feedback 的打包复核部分。
