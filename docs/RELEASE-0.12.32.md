# Live Character 0.12.32 · 按钮、真实分层与修改记录

日期：2026-11-13。基线：原始 0.12.31（169483166 B，SHA-256 669b8c3b721666945290954d31658106e6cb397ffa24c28456915a7ac13fa1e4）。依据：用户要求新增两个桌面按钮，以及本轮上传的层级纠正、AgentPreset 方案与干净安装反馈。附件中“用户确认方向”作为本轮实现依据，不再追问同一架构选择。

## 本轮结论

桌面角色右侧新增窗口调整和 AI 总开关。另纠正上一版实装层级：context 不是真正 system section；.31 的规则在 runtime 注入、角色配置仍在用户消息。此前仅改说明没有修正代码位置是不充分的。本版按已提供的公开契约实现 section 接管＋每角色 preset 配置 context＋用户通道事件。

## 两个小按钮

- 窗口调整：四角箭头 SVG，白色圆角按钮；点击进入，图标高亮，再点退出；完成按钮和 Escape 同步状态。调整覆盖层仍禁用角色鼠标互动，原生位置/尺寸/吸附逻辑沿用。
- AI：电源 SVG，开启时高亮，关闭时灰色；复用原 AI 总开关，停止当前回复/朗读并更新持久状态，包含触摸、自主、适配和 TTS 的现有门控。
- 两个入口共享同一切换逻辑与状态刷新，连续点击不重复提交。即使宿主取消请求返回错误，仍重新读取已落盘状态。
- 锁定穿透的 UI 命中白名单加入两个按钮；窗口调整按钮位于编辑覆盖层上方，可再次点击退出。
- 低矮窗口采用更紧凑的排列，保留白色简约风格；本轮验证 DOM/事件逻辑，真实 Windows 呈现需本机检查。

## 实际三层

| 层 | 实装 | 内容 |
| --- | --- | --- |
| 真正系统提示词 | systemPrompt.section({complete:true}) | 通用 JSON 契约、字段/范围、事件/外观/语音/能力规范；无角色值、历史、当前状态或 LLM 名称 |
| 核心配置注入 | 每角色 preset 的 required systemPrompt.context | 角色名称/人格、当前皮套、真实能力、演出 rig、独立口型及选定音频模型/调用格式；允许是内容大头 |
| 辅助注入 | 角色预设另一个 runtime context | 本轮 provider/有限检索资料，仅在 LC 请求期间提供，结束清理 |
| 用户消息 | lc.event.v3 ＋需要的 image attachment | 当前聊天/事件、即时状态与当前模型；不再夹带 lc.context.v1 或 runtime 大块资料 |

complete 使 LC 公共规则成为该角色 Agent 的唯一 system section，依据的是本次附件已确认的 DSH 契约。它不自动移除宿主 file policy/approval/checkout runtime context，也不等于去掉全部工具；原全局 allow:[] 保留，scoped 工具仍需实际按宿主行为验收。其他插件再注册 complete section 仍可能触发宿主冲突；不静默吞掉或转回 coding prompt。

## 修改记录

| 文件 | 原行为 | 本轮修改 |
| --- | --- | --- |
| lab/index.html / companion.css | 仅对话、锁定、专注、置顶、音量 | 加窗口调整/AI 总开关 SVG 与状态样式；低矮窗口紧凑排列 |
| lab/app.js / desktop/main.cjs | 调整只能走右键菜单 | 新按钮通过原生 toggle phase 复用调整逻辑；发送方校验；完成/Escape/菜单同步；锁定命中白名单更新 |
| lab/studio.js | 单 AI 总开关入口 | 统一两个入口，防重复，失败后也刷新持久状态 |
| preset/actor.mjs | 公共规则用 context | 改唯一 complete section；characterId 闭包注册核心配置与辅助 runtime context；旧无绑定预设明确停止 |
| character-presets.js（新增） | 共用 preset，无独立配置注入 | agentPresets.register 动态注册角色 preset；原子保存公开配置，context 每步读取角色设置；注册恢复/释放/删除及会话绑定 |
| pet-sessions.js | 配置/runtimes 作为用户 text part | 提交前发布核心配置，用角色 preset 创建新 session；用户消息只有事件/图片；辅助资料单独注入并 finally 清理 |
| index.js / desktop/main.cjs | 无公开配置发布链 | 新增本机认证的配置发布/删除路由；桌面检查当前角色/profile；配置发布不调用模型、不受 AI 额度计数 |
| lab/companion.js | 配置仅随模型请求传送 | 页面加载及设置变化时发布公开快照，签名未变不重复；每次生成前仍更新；不发密钥和原音频 |
| session-event.js / performance-contract.js | 配置属于用户消息，旧层级措辞 | 配置用于真正 context，事件仍 v3；契约 lc.performance.v3；角色名只在配置，非事件 |
| tests / docs / 版本 | .31 的模拟测试把 context 称系统 | 改为分别检查真实 section/context 注册；新增原生按钮与真实文件预设/桥接测试，文档按实际位置重写；版本 .32 |

保留离线 Python/Electron/Core 依赖验证修复、模型导入分类、独立口型、250ms 触摸防抖、自由情绪、同轮语音/台词、外观摘要与台词分离、持久语音 Key。没有增加付费生成轮次、固定情绪维度或自动迁移历史。

## 角色配置和预设生命周期

每角色注册 live-character-<characterId>，plugin config 仅绑定 characterId 与本机数据目录。当前角色资料来自其资产目录，不靠未公开 AssembleContext.agent/sessionId，不把别的角色当前状态注入该会话。

公开快照位于 _characters/<id>/settings/agent-context.json；预设及会话绑定索引位于 preferences/agent-presets.json。读取回调每步重读人格、保存的 performance-rig-v1、mouth-profile-v1 和语音配置；参数/口型/语音设置修改在后续组装生效。同角色换模型用原 preset，检测 profile 不匹配时停止，待当前皮套配置发布后继续。资产迁址根据 assets.json 动态重定位。

桌面会在角色就绪与配置变化时无推理地发布，另有 2 秒变更检查；真正 LC 生成提交前再发布一次。整表不再写入用户消息，也没有 16/64 次补发检查点。每步 context 的内容仍可能计入模型输入；不承诺免费、不虚构注意力比例。

启动恢复已记录角色的预设，删除角色时释放预设并移除索引绑定；清理遗漏在下次恢复时按有效角色名单补处理。配置损坏不覆盖原文件。SDK 注册不可用或返回不符时明确停止，不假装已接管提示词。

## 旧会话处理

采用附件已确认限制：已有 Agent 保留创建时 preset revision，旧 session 不原地更换 preset。本版不自动迁移、复制历史或删除角色资料。

- 干净环境：直接导入角色，新会话使用对应独立 preset。
- 若已有 .31 会话：提示需用户明确新建/重置；不在后台偷偷改其 preset。
- 现有“清空对话与情绪”会提示重置范围并归档旧 DSH 会话，会重置本地当前记忆显示；不是无损继承会话方案。旧会话历史仍可查看。
- 原通用 preset 保留为历史定义入口；缺少角色绑定时明确停止，不用它生成新的角色回复。

此次分层使用现有公开接口；每角色 preset 的闭包负责配置绑定。精确 replyTo、follow 恢复和第三方具体 hook 仍是其他边界，不再作为这次分层的接口追问。

## 本机复测 feedback

1. 更新后完整退出并重启 DSH，确认 .32；你反馈的干净环境直接导入一个角色即可。
2. 新角色第一轮查看最新 system/message：应为 LC 公共规则，没有 coding agent/deepseek-flash。角色具体值应在 preset context，而非该 system section。
3. 用户消息只有事件/聊天及必要图片；不含 lc.context.v1、完整参数或检索大块。观察同轮台词/动作/语音仍只生成一次。
4. 两角色交替，检查各自 preset、人格、能力与音频配置；同角色换皮套不重建会话。修改人格/参数/口型/语音配置，再从 DSH 直接续聊，确认注入更新。
5. 桌面点窗口调整按钮，拖动/缩放/吸附；再点图标、点完成或按 Escape 退出，状态同步。低矮窗口图标不应丢失。
6. 在桌面锁定穿透时点击两个按钮，确认可操作；AI 开关与设置页同步，关闭后不再开始触摸/自主/TTS/适配调用，开启后恢复原有调度。
7. 检查 complete 接管后宿主 tools/file policy/approval 行为与上下文插件；本环境没有真实宿主，不把接口替身测试写成已完成这些实测。
8. 若发生错误，给版本、脱敏错误和触发操作即可；若 SDK 实际返回与已提供契约不一致，再附实际返回结构。不需要重复回答已确认的 DSH 问题。

## 验证与限制

新增 5 项真实文件/角色预设/桥接测试，2 项按钮/原生处理器测试；调整原有层级测试。源码回归：Node 97 项 + Python 25 项，共 122 项通过，0 失败、0 跳过。覆盖角色隔离、动态设置、同角色换模、资产迁址、SDK 注册/恢复/释放、旧绑定拒绝、辅助资料清理、用户通道无配置、按钮状态/穿透/防双击，以及既有语音、口型和依赖回归。

测试使用 Linux、JSDOM、真实文件/本地 HTTP 和 SDK/原生接口替身；没有实际 Windows DSH、GPU、DPAPI、付费模型/TTS 或真实 Chromium 的本机联调。新 section/context 注册和 preset 定义已按提供契约实现；宿主实际输入层级与工具策略仍以本机最新一步为准。最终归档逐文件/依赖哈希复核见随包 feedback 末尾。
