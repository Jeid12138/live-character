# Live Character 0.12.35 · 语音时长等比例演出

日期：2026-11-13（北京时间）。基线 0.12.34：169517721 字节，SHA-256 45b0fba0ddcfbed7a5b472314a1e0fa08f1dfde3921ad37a507b97c62e6daf24。
依据：《Live-Character-0.12.34-语音时长等比例拉伸反馈》。

## 复核和选择

反馈准确区分了动作顺序与音频适配：.34 已解决多动作同时开始，但原排期和参数关键帧保持原速；音频较长时延长姿态保持。这是上轮规定的行为，本轮按新的体验目标改为整体排期比例拉伸。

采用方案 A + 参数关键帧真拉伸。LC 当前通过自有 Character 采样原生曲线，可以延长自身临时 clip 的有效窗口并保持末帧；不需要假设 Cubism motionManager 有可用的 timeScale，也不改 SDK 私有速率字段。原生一次性动作仍按原速度播一次，窗口余下部分保持末帧，不冒称动作本体慢放。

## 本轮修改记录

| 文件 / 范围 | 原行为 → 本轮变化 |
| --- | --- |
| performance-contract.js | 契约 v6：LLM 输出原始秒数作为排期比例，不先猜语音长度放大；长音频由本地缩放；原生速度/淡入淡出保持，短音频保留尾段；系统层仍只含通用规则 |
| lab/companion-core.js · Performance.start | 计算 authoredVisualSpan=max(duration,actionEnd)，scale=max(1,audioDuration/span)，复制并缩放 actions.at/seconds；不修改原 plan |
| lab/companion-core.js · Layer / tick | 参数关键帧时间按同一比例放大，进度随实际音频 currentTime；音频与墙钟分离，尾段转本地时钟，无语音仍用原始时长 |
| lab/companion-core.js · dispatch | 原生一次 motion 的 until 延至缩放窗口末尾，采样仍原速、末帧保持；配对手势仅延长保持，进入/返回及淡出不乘比例；不用循环补时长 |
| lab/companion-core.js · expressions | 非 persistent 表情保持秒数乘 scale，淡入淡出速度不变；表达可在语音结束前按自身比例淡出；persistent 配饰继续保留原语义 |
| lab/companion-core.js · extend | 有限 duration 延迟到达或变化时，以当前已走过进度为锚重排剩余项/窗口；不重播已派发动作、不倒退已完成关键帧；不能恢复已收回/结束的原生动作 |
| lab/companion.js | 将演出生命周期摘要展示于 lastReply，播放后按角色/模型/会话/事件身份串行写入；短音频尾段、延迟部分调整显示提示，不另调用模型 |
| desktop/experiences.cjs、desktop/main.cjs | 新增受当前归属限制的 experiencePerformance；追加 kind=performance 记录并在 query/reload 时合并最新摘要；完成回复原文、完成状态、seq 和原始事实保持不变 |
| tests / docs / 版本清单 | 新增 11 项回归并更新此前“长语音不拉伸”的旧期望；版本 .35，保留原始 .34 的 50 个升级识别文件指纹 |

不增加一次 LLM/TTS 调用，不改变提供商、Key、口型映射、触摸合并、人格/自由情绪或角色会话路由。依赖仍由完整包内置校验/修复。

## 时间与边界

| 场景 | 行为 |
| --- | --- |
| 开始时已有有限音频时长，且长于原演出 | 原排期整体等比例放大；参数关键帧按同一比例延长 |
| 无语音 / 未知或 Infinity 时长 | scale=1 先用原排期，Infinity 不创建无限占用 |
| 语音短于原生所需窗口 | scale=1，不加速，音频结束后演完尾段，并记录 short-audio-tail |
| 时长延迟到达 | 当前音频时点为锚，保持当前参数进度，仅重排尚未完成部分；mode=remaining |
| 全部原演出已结束才知道时长 | 不重播动作/关键帧；只延长允许的姿态保持，记录 late-duration-after-timeline |
| 暂停/停止/静音/手动接管/替换回复 | 清空未执行动作和本轮临时保持，恢复播放不补播 |

关键帧 at 仍为 0–1，动作 at 仍为原始秒数；模型填写相对排期，本地取得真实音频后才缩放。原始动作上限 60 秒，实际缩放后可更长；本地经历的有效排期字段允许长于 60 秒，不再用原始上限静默丢掉长语音窗口。

### 完全等比例的例子

原 duration=3.3，三个动作窗口 1.2/1.1/1 秒，at=0/1.2/2.3；音频=9.9 秒，scale=3。实际开始约 0/3.6/6.9，最后窗口结束 9.9。原动作曲线速度不变，窗口内保持延长。

原 duration=4、没有更长动作尾段、音频=20 秒时，keyframes 铺满 20 秒；中点参数出现在音频 10 秒，而非原 2 秒。

### 反馈公式的隐含限制

采用 max(duration,actionEnd) 作分母，就会保留原计划的相对留白。如果 duration=4、actionEnd=3.3、音频=20，则 scale=5，动作末尾=16.5，整个演出/姿态末尾=20；不会把 16.5 伪报成 20。只有 actionEnd 本来等于整轮 span，最后一个动作窗口才自然与语音结束对齐。多段关键帧与动作的相对位置同样保留，不另作冲突的独立缩放。

这是整轮排期对齐，不是逐字声学强制对齐；不能保证每个动作对应台词中某个词的精确发音时刻。

### 延迟时长的平滑策略

晚到时长时不能把已发生部分重新演一遍。先按旧映射取得当前 authored 进度 u，再以当前 audioTime=t 为锚：remainingScale=max(1,(audioDuration-t)/(span-u))，后续用这段映射推进。参数当下数值不倒退，已派发动作不重播；尚未派发动作按新比例排期，仍在保持中的窗口可延长。已经返回/结束的原生动作不会复活。

此时 summary.scale 仍报告名义 audioDuration/span，remainingScale 报告真正采用的后段比例，timingMode=remaining，附 scaleAdjustedAtAudioTime 和 late-retime-partial。两者可能不同，不冒称整轮从 0 秒已按新比例播放。

## 经历与诊断

reply.performance / lastReply.performance 包含：

- duration / actionEnd / authoredVisualSpan：归一化原计划；authoredActions：原排期。
- audioDuration / scale / remainingScale：实际媒体时长、名义比例和后段比例。
- effectiveActionEnd / effectiveVisualSpan / keyframeDuration / actions：本地采用的有效排期。
- timingMode / scaleAdjustedAtAudioTime / notes：整体或后段适配方式与限制。
- phase：authored、playing、tail、finished 或 cancelled。

音频合成前 completed 回复无法知道真实时长，因此追加单独 performance 行，不重写 completed 行。查询合并最新摘要；原 DSH 会话回复也不重写。迟到 playing 更新不能覆盖 finished/cancelled；错误归属、缺少已完成回复或不存在事件会拒绝，不制造新回复。写盘仅在开始、有限时长修正和阶段变化时进行，不逐帧写盘。

排期记录仍不是每一帧确已显示的证明；Windows 卡顿、手动打断、切换皮套等可能跳过执行。validation 用于原计划合法性/本地纠正，真实缩放信息看 performance，不靠 count 单独推断。

## 测试与本机验收

源码回归 Node 137 项 + Python 25 项，共 162 项通过，0 失败、0 跳过。新增 8 项缩放核心测试、2 项经历追加/归属测试、1 项真实页面演出/记录测试；更新原先固定关键帧时长的旧测试以符合本轮新策略。

覆盖 3.3→9.9 秒起点、4→20 秒关键帧、原生曲线速度与末帧保持、不循环、手势进入/返回原速、表情保持比例与原淡变、短音频尾段、未知/Infinity/晚到时长不倒退不重播、停止清理、长于 60 秒的有效记录、原完成行不可变及错误归属拒绝。真实页面链路验证同轮只生成一次。

本环境为 Linux/JSDOM、真实文件/本地 HTTP 与 SDK/原生替身，没有真实 Windows/DSH/GPU 或付费 TTS 联调。最终归档哈希、内置依赖与解压包回归见外附 feedback。

本机复测：

1. 从 .34 更新 .35，完整退出重启 DSH 后启动角色；角色、会话、Key 保留，无需重置。
2. 长语音下观察后续动作明显后移，原生动作完成后保持末帧/手势；没有重复 motion 填充。
3. 参数关键帧不在原 4 秒提前走完；语音中点观察中间姿态，嘴型继续跟随实际音频。
4. 查看同轮 reply.performance 的 audioDuration、scale、effectiveActionEnd 和 actions，与 authoredActions 对照。
5. 暂停/停止/静音后恢复，确认旧动作不补播；短语音确认尾段正常结束。
6. 有异常请给版本、profile、同轮原始 JSON、performance 摘要、实际音频时长和操作时点。无需重新核对 DSH 接口。
