# Live Character 0.12.35 · 实际层级和会话协议

## 三个实际位置

| 内容 | 实际 API / 位置 | 生命周期 |
| --- | --- | --- |
| 通用公共规则 | actor 的 systemPrompt.section，complete:true | 每步由宿主组装真正系统提示词 |
| 角色完整配置 | 角色独立 preset 的 required systemPrompt.context | 每步同步读取当前角色配置，不依赖未公开 agent/scope 身份 |
| 辅助资料 | 独立 runtime context | LC 本轮暂存，结束清理；空值时不提供 |
| 当前事件/对话 | sessionController.prompt 的 lc.event.v3 | 用户通道，自动事件标明 userTyped:false |
| 图片 | 同次 prompt 的附件引用 | 图片先于事件；只有已确认准入前能力拒绝才去图再准入 |
| 历史 / 经历 | DSH 原生历史 / 本地 append-only 账本 | 不全量复制，不迁移或回填 |

systemPrompt.context 不等于 system section。旧版本命名混淆已更正。complete 只抑制其他系统 sections，宿主 contexts 和 tools 不会因它自动清空；LC 不修改普通 DSH Agent 的提示词。

## 角色预设

每个逻辑角色注册 live-character-<characterId>。插件配置闭包包含 characterId 与本机 LC 数据目录，context 回调据此读取对应角色；不根据“全局当前角色”给别的会话注入人格。

角色设置快照在资产库 `_characters/<id>/settings/agent-context.json`，仅含公开配置，生成时经过白名单和 48KiB 校验。读取时重新加载该角色保存的人格、演出 rig、独立口型和语音设置。当前模型身份不匹配时停止，不拿旧皮套能力继续生成。资产库迁址后根据 assets.json 重新定位。

预设/会话绑定索引为 preferences/agent-presets.json。启动只恢复已记录角色的预设；角色删除时释放预设，异常遗漏在下次恢复时按有效角色名单清理。新会话 create 明确传入角色 preset，创建后记绑定；已有会话没有匹配绑定时明确停止，未自动改其 preset 或复制历史。

模型/设置变化通过页面无推理的配置发布和每次 LC 提交前刷新；同角色换模型不重建 preset/session。索引或配置损坏不会被默认为空文件覆盖，也不会回退到 DSH coding agent。

## 事件与预算

lc.event.v3 只含事件事实、时间、userTyped、当前 model/state 和配置版本引用。无 character 身份块、instruction、完整配置和历史。角色名称在配置注入层，不反复放进事件。旧 v2/v1 保持可读。

事件含围栏 8KiB 硬上限，普通触摸目标 1.5KiB；配置注入 48KiB；辅助资料 8KiB。不是注意力百分比，也不代表各层不计 tokens。LC 配置每步在 preset context 中组装，LC 不将其作为 prompt content 提交；宿主可能将 context 投影为 user-role 历史，不能承诺原始历史里完全没有配置。也不再使用“16 轮/64 cursor 补发配置”的旧办法。

触摸默认 250ms 末尾防抖（50–5000ms 可调）；长按不提前发，松手后等间隔，连续点击/跨部位滑动合并。次数/时长汇总保留，先削减路径并标截断。停止、关闭 AI、进入适配/编辑或切换角色丢弃未发批次。计时器全局接收者修复保留。

## 辅助注入与语音

LC context provider 与有限检索的 runtime 块不再放用户消息；本轮临时写入角色 settings/agent-runtime.json，由角色预设单独 context 读取，finally 清理。记录受进程、进程启动时间、当前 profile 和 120 秒有效期约束；过期或重启后不读取。第三方原生 DSH context 仍按其自身 hook 生效。

音频配置保留所选提供商/模型/音色、固定演绎方向、真实请求格式、是否转发方向和文本上限，不包含 Key、认证头、私有地址或参考音频字节/文字稿。实际请求由 LC 适配器生成，返回仍为统一演出 JSON。Breeze 支持的方向传递和其他线路当前未传递的差异如实注入，不增加新的 TTS 能力。

口型配置在注入层说明本地控制边界，实际口型仍由音频和逐模型映射产生，LLM 不生成假时间轴。情绪保持自由文字，不使用固定维度。

## 结果、去重与边界

同一次 prompt→wait，无额外 bootstrap、读图改写或直连补推理。台词与内部外观摘要同轮输出，摘要不朗读；自主空台词明确失败，不自动重试。已处理 session/seq 回执防回声重复演出。

明确 submitted:false 的忙状态可用同事件 UUID 重试；未知准入不自动重投。宿主缺少精确 replyTo 时仍有跨入口并发边界，多 assistant 时不猜选。未宣称断线补演出、完全压缩恢复或任意工具插件兼容。

旧会话保留原 preset revision；本版不自动迁移。用户选择“清空对话与情绪”会提示其重置范围，旧 DSH 会话归档；这不是无损迁移功能。干净环境直接导入角色即可。

停止会直接调用公开 sessionController.cancel，不再要求本机 active 表仍有条目；取消后读取 state 的 running/queue/pendingInput。未确认结束或仍有待处理内容时明确警告，不声称已停止，也不擅自清空宿主队列。事件 UUID 取消标记覆盖准入前及准入后的竞态。已完成回复仅停止本地音频，不取消已结束的生成。

本机会话诊断额外记录 transport 的 userContentKinds、configurationPlacement 及各块字节数，不写完整载荷或密钥，用于区分 LC 提交和宿主投影。

演出返回契约为 lc.performance.v6；优先 actions 离散动作单通道，旧 motion/gestures 由本地顺序归一化。actions 的 at 为秒、keyframes 的 at 仍为 0–1 进度，二者不可混用。当前皮套 gestureTiming 属于配置注入，通用排期规则属于 system section；不把整张能力表放入用户消息。新字段不增加一次推理，不改会话路由。

本地经历 reply.performance 只保留归一化后的 duration/actionEnd 与至多 12 项动作排期，用于复核采用了何种计划；不是证明每个计划动作已实际播放。暂停/停止或渲染卡顿可能取消/跳过部分动作，不能把计划记录当成实际逐帧执行回执。原 DSH assistant 原文保持原样。

语音合成完成后才能知道真实时长，因此原始 completed 回复保留 authored 排期，随后追加 kind=performance 时序记录；查询层把最新白名单摘要投影到 reply.performance，不改写原始事实、完成状态或台词。仅原生页面可写，检查当前 character/profile/session 与既有 completed event 归属；不允许新建回复，也不触发模型。播放时长修正与结束/取消阶段单独追加，未逐帧写盘。

长语音 scale=max(1,audioDuration/max(duration,actionEnd))。actions 排期与 keyframes 总时长按该比例变化，原生动作采样速度保持。晚到时长采用 remaining 模式：保留已发生部分，以当前音频时点为锚拉长剩余进度；记录 remainingScale 与 scaleAdjustedAtAudioTime，不能假称整轮重新等比例播放。

测试、UI 与本机验收见 RELEASE-0.12.35.md。
