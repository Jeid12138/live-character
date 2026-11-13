# Live Character 0.12.29 · 修改记录与 DSH feedback

日期：2026-11-12。基线：0.12.28。依据：用户上传的《事件码块与会话接入规范》及确认后的修订意见。

## 本轮结论

新事件使用 lc.event.v2。事件事实、角色配置、本轮补充资料分层；首次使用或配置变化时，在**同一次 prompt** 中附带当前 session 的配置快照。没有单独的 bootstrap 模型调用，没有根据未知 scope 读取全局当前角色资料。

换装、首次导入、同角色新增模型纳入同一 session 生成。按上传方案的 `{type:'image',attachment:ref}` 候选契约传图片，同一回复生成台词、情绪、动作、语音指令及外观摘要。不先视觉生成一次再会话重复回应。

**图片格式的 LC 调用链已自动验证，真实 DSH 宿主图片入模仍需本地验收。** 本版不宣称已实测用户的宿主、付费 Key、GPU 或 DPAPI。

## 修改记录（请 DeepSeek 一并复核）

| 文件 | 原行为 | 本轮修改 |
| --- | --- | --- |
| session-event.js | 每事件复制指令、能力、历史；100000 字符上限 | v2 事实白名单，UTF-8 字节预算；事件、配置、补充资料独立编码；v1 可读 |
| session-event.js | 普通触摸也带历史和完整外观 | 事件不带 instruction/history/initialHistory/recentEvents/recall/完整能力数组/appearance.events |
| session-event.js | 触摸路径较大 | 路径最多 8 条，必要时先移除路径；保留全部有效部位汇总、次数、时长及截断标记；不修改原始事件 |
| pet-sessions.js | 一个大文本块 | 配置（如需）＋精简事件＋可选补充/图片，只有一次 prompt 和 wait |
| pet-sessions.js | 无配置版本 | 按 session 缓存稳定 SHA-256 版本；配置改变或定期检查点补发；重启后首次重新附带 |
| pet-sessions.js | 单文本事件解析 | 支持多 text part，LC 历史只显示事件摘要；返回实际字节数、配置是否附带、附件数量 |
| preset/actor.mjs | 固定契约只认识 v1 | 认识 v1/v2 和配置/补充块，保留自由情绪、同轮 speech；不 complete 覆盖、不依赖未公开 agent 字段 |
| index.js | model_change 直连 LLM | chat/touch/observe/model_change 均需有效角色 session；图片引用传入同一次 prompt；失败不补发直连 |
| index.js | 视觉与会话分离 | 有图片能力时传图，无能力/附件服务时仍在同会话明确 metadata 降级；不伪造新视觉认知 |
| lab/companion.js | 失败状态未完整区分提交结果 | 保留 submitted 的 true/false/未知三态；明确提交前失败记 failed，未知才 unknown；未提交自动计数回退 |
| lab/companion.js | 本地请求也重复附旧历史、回忆 | 删除不用的 history/recentEvents/recall；普通触摸不检索历史；回忆类聊天有限检索当前会话经历 |
| lab/companion.js | 完成记录缺少新的外观摘要关联 | 从本次回复提取并保存外观后，再追加 completed，含 sessionSeq；原生换装记录参与普通去重 |
| desktop/experiences.cjs | 回复记录仅 text/emotion/speech | 增加外观证据和摘要；image 才保存新视觉摘要；事实仍追加保留 |
| tests/*.test.py | 部分 read_text() 用系统默认编码 | 测试读取显式 UTF-8；新增编码约定测试，修复中文 Windows GBK fixture 读取问题 |
| 测试 | 旧换装测试要求直连 | 改为一次原生会话、附件确实转交、metadata 降级、失败不补发；新增 v2/预算/版本/隔离/兼容测试 |

延续 .28 的独立逐模型口型配置、AI 口型适配、经历查询/订阅、原生静默动作、自由情绪持久化和 250ms 触摸防抖。本轮没有重写 TTS 协议、密钥保存、音量、气泡媒体时钟或音频口型分析，也没有增加固定情绪维度。

## 一、配置按会话管理，不串人格

固定 required context 只放公共角色契约。具体人格、能力和已知外观使用 lc.context.v1 配置快照，明确绑定 character/profile，作为同一 prompt 的另一个 text part 提交。

能力快照保留真实参数 ID、语义、min/max/neutral 和动作/表情定义，**不是只有名称和哈希**。事件的 capabilityRevision 指向这份“人格＋能力＋已知外观”整体配置 revision。情绪、活动及当前时间不参与配置哈希。

首次、版本变化、累计 16 次成功提交后的下一次，或宿主 cursor 比上次快照推进至少 64 时补发。插件重启后首次也重新附带。缓存按 session 隔离，不从全局当前角色给其他会话注入数据。

这是保守检查点，**不等于宿主上下文压缩恢复已解决**。DSH 直接续聊参考最近一次已提交快照；刚改 LC 设置、尚未提交新事件时仍可能是旧资料。revision 不是能自动解引用的记忆或配置。

## 二、事件精简与预算

事件白名单：schema/id/type/at/userTyped/character/data/state?/capabilityRevision?。类型仅 chat/touch/observe/model_change。自动事件明确标记 LC 软件来源，真实聊天保留用户原文；均使用现有 user 通道，不伪造原生 event role。

state 保留上一情绪、活动/专注/跟踪、工作强度和语音开关等少量状态，lastEmotion 不限制本次自由情绪。普通触摸不带完整能力、历史、外观事件数组。

| 内容 | 实施预算 |
| --- | --- |
| 普通触摸 | 1.5KiB 为目标；不为凑目标删掉有效部位汇总 |
| 任意事件块 | 含前缀和代码围栏，硬上限 8KiB |
| 用户聊天 | 沿用最多 2000 字符且满足字节限制；超限说明，不静默裁原文 |
| 配置快照 | 独立 48KiB 上限，超限提交前报错，不悄悄丢参数范围 |
| 本轮补充资料 | 独立 8KiB 上限，截断有标记 |
| 截图 | 作为附件引用，不放 base64 进事件 |

8KiB 是事件块限制，**不是首次整个 prompt 的限制**；含快照时整条请求会更大。不采用“聊天只增加 200B”的不可靠承诺。配置或 context 也可能每轮计入输入，不承诺免费或固定节省比例。

合成测试样例（30 行参数＋重复约束，并非用户皮套）：事件 644B、配置 5428B。后续配置不变时不逐次携带该配置。不同皮套不保证同样大小。

触摸保留现有管线最多 20 个部位汇总，没有机械地只留 8 个部位。路径最多 8 条，必要时移除并写 segmentCount/truncated；完整原始事实仍在 experiences.v1.jsonl，次数和时长不被改写。

## 三、连续记忆、扩展插件及显示

- 新写 v2，旧 v1 可读，不迁移、不回填，不自动删除旧 v1 历史中的重复内容。
- 不发送 initialHistory，不复制旧对话来建立角色人格；必要资料由配置块提供。
- lc.context.runtime.v1 单独承载有来源的 registerContext 资料、已启用的前台应用名和有限检索事实。精简事件没有直接丢掉既有上下文提供方。
- 本地经历检索目前是轻量规则：聊天含“刚才/之前/上次/记得/回忆”等或相应英文线索时查询当前会话最近记录；不是向量检索或全量语义记忆。普通触摸无这份历史复制。
- 超过补充块预算时保留较高优先级并标截断；第三方提供方是否生效仍按实际 scope 和 hook 验收。
- 账本保存完整事实、投递状态、回复与 seq 关联；completed 指生成结果已记录，不等于语音已播放成功，TTS 仍由原有诊断追踪。
- LC 面板按多文本块提取事件，显示一行摘要，不展开配置；**DSH 原生会话仍可能显示 JSON/配置块**，本轮没有修改宿主 renderer。
- 账本有数据不等于模型自动可见；只有 ID 引用不会自动检索，必须经过已接通的查询/上下文路径。

## 四、换装的实际顺序与边界

1. 保留 initial_import/model_added/model_switch/appearance_refresh 区别和正确归属。
2. 检查所选模型输入声明、附件服务和本次截图。
3. 支持时 attachments.saveImage({data,mediaType:'image/jpeg'})，随后同一次 sessionController.prompt 携带配置（如需）、事件和 image attachment。
4. 同一回复输出台词、自由情绪、动作、speech.instructions 及 appearance.summary。
5. 保存本次新摘要，再把 image 证据、摘要和 sessionSeq 写入经历完成记录，进入已有语音/口型/气泡演出。

输入事件不预填尚未生成的新摘要；旧摘要可在配置中保留来源和时间，不能冒充本次视觉结果。图片能力或服务缺失时仍走同一 session，明确 metadata，不能称看到了新衣服。

若附件创建或宿主图片格式报错，不自动再走一次直连，不自动换文本重生成。请先看诊断后手动处理，避免重复消费。本轮依据上传方案的候选契约实现，自动测试不能证明真实 DSH 图片入模。

## 五、请 DeepSeek 补充和实测的 feedback

请给真实当前宿主的“类型/源码位置/成功例子/脱敏请求返回”，不要只写建议接口。

**F1 图片：**确认 PromptContentPart.image 是否确为 {type:'image',attachment:ref}，saveImage 返回类型、附件归属/生命周期是什么；提供一次成功 model_change 请求和回复。图片拒绝时准确错误码及是否已产生模型调用也请说明。本轮已实现候选调用链，但未实机验证。

**F2 精确回复关联：**提供 prompt 的 {accepted:true} 和 user/message.source.rpcId 的实际脱敏记录。rpcId 能帮助找输入，仍不能证明对应 assistant 的原子归属。当前保留 state.cursor→prompt→wait；多条 assistant 报歧义，不猜第一条、不补发。单条回复跨入口并发的精确关联仍未解决。

**F3 follow/压缩：**提供 follow 请求、snapshot/event/assistant-stream、cursor 和 surfaceOp 的确切样例，以及压缩后确认配置仍在真实模型输入的办法。没有契约前不猜 resume 字段、不补播离线历史；周期配置检查点不是完整恢复协议。

**F4 scope/第三方：**若有公开 scope→session 解析请给出。当前不依赖它，不读取全局可变人格。请给一个实际记忆插件对 chat/touch/observe/model_change 的生成前 hook 顺序。依赖全局工具时列出具体名称，不能把 allow:[] 或“已安装”当作全面兼容证明。

**本机复测：**

1. 确认 .29；第一次事件带配置，随后连续触摸不反复带相同大表；修改人格/参数适配/换模型后重新带对应版本。
2. 两个角色分别在 DSH 续聊，确认人格、真实参数 ID 和外观不串。
3. 首次导入、同角色新增模型、已有模型切换各一次：只一次互动，事件与截图同轮，摘要进入回复和账本。无视觉能力时不能假装看到了图片。
4. 问“刚才摸哪里/之前换哪套”，检查原生历史和有来源的有限检索；旧经历不自动 backfill。
5. 旧 v1 可读，LC 只摘要；原生 DSH 显示 JSON 是已知边界。
6. 原有试播、同轮情绪指令、口型、静音、同角色 Key 复用和 250ms 防抖照常复测。
7. 中文 Windows 再跑 voice-key-contract.test.py，确认不因 GBK 默认读取 fixture 失败。

不要上传真实 Key、截图原件或整套皮套；字段结构、seq、错误码和脱敏日志即可。

## 六、验证记录

Node 73 项通过，0 失败、0 跳过；Python 24 项通过；共 97 项。覆盖 v1/v2、多文本投影、字节上限、原文不静默截断、部位保留、配置版本/会话隔离/检查点、一次 prompt 图片、metadata 降级、失败不补发、视觉摘要恢复、编码及原有回归。

环境为 Linux/JSDOM、实际本地文件库和本地测试服务/接口替身；未用用户付费 Key、未在用户 Windows/DSH/GPU 上运行。音色演绎、真实 DPAPI、宿主图片和跨入口并发仍需实机验收。
