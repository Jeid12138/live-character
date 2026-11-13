# Live Character

### 让你的 Live2D 角色，成为与你一起工作的桌面伙伴。

**Live Character（LC）** 是一款运行于 **DeepSeek Harness（DSH）** 的 Live2D 桌面角色插件。它把角色演出、触摸互动、文字对话和语音连接在一起：角色可以待在桌面上，听你说话，对你的触摸作出反应，也能在工作间隙主动与你交流。

你准备喜欢的 Live2D 模型、设定角色的性格，再决定她以怎样的节奏陪伴你。角色的情绪与反应交给模型结合性格、经历和当下事件判断，而不是预先锁定在几条固定剧情或一组好感度数值里。

> **beta版本：0.12.36 · Windows x64 · 需要 DSH**  
> 插件不附带角色模型。AI 对话、AI 适配及云端语音按所选服务的规则计费。

## 不只是把聊天窗口换成一个角色

### 说的话、做的动作，来自同一次互动

文字对话、触摸、自主陪伴和换装事件进入角色自己的 DSH 会话。模型既可以回应台词，也可以安排表情、视线和动作；LC 再将有效指令转为角色演出，并保留带时间的结构化经历。

自动事件会明确标注来源，不会伪装成你亲手输入的话。你摸了她的头，再继续聊天，这两件事可以发生在同一段交流里。

### 同一个角色，可以拥有不同的样子

为一个角色添加多套模型，就能更换形象或服装，并延续原来的性格、会话与记录。每套模型分别保存参数、触摸区域和口型配置，避免不同皮套互相套用同一份参数。

首次导入、添加新模型和切换模型时，可以通过当前角色画面建立形象认知，让换装成为互动的一部分。这项能力需要所选 DSH 模型支持图像输入。

### 工作时安静一些，空闲时亲近一些

专注模式支持 **开、关、自适应**。你可以调节工作与空闲时的陪伴频率，设置自动互动预算，也可以一键关闭全部 AI 调用。

键鼠活动与鼠标跟随让角色对你的工作节奏有所反应。输入监测用于判断活动与节奏，不采集你键入的正文。

### 触摸，是连续的互动

点击、长按和滑动可以形成触摸事件。短时间内连续发生的操作会合并发送，默认合并间隔为 **250ms**，也可以自行调整。

触摸区域可以绑定模型部位、跟随其移动，并通过拖动调整位置和大小。AI 触摸适配根据实际模型分析部位，没有尾巴的角色不需要拥有尾巴区域；自动结果仍可手动修正。

### 从台词，到声音，再到口型

可配置 Breeze、Fish、Qwen 云端语音及自定义 OpenAI 兼容语音接口。角色可以在同一轮回应中给出符合性格与情境的演绎方向，支持的语音服务再据此生成声音。

开启朗读后，台词气泡等待音频播放，逐字显示并随语音时长保留阅读时间。口型按当前模型配置驱动默认嘴型、AIUEO 或 VBridger 相关参数；实际效果取决于皮套绑定与校准。

目前口型属于音频分析驱动的近似同步，不等同于精确逐音素识别。

### 该方便时方便，该让开时让开

设置集中在 DSH 侧栏；桌面角色保留轻量图标操作，包括对话、锁定、专注、置顶、音量、窗口调整、AI 开关和模型切换。

锁定后，透明区域允许鼠标穿透，角色的触摸区域与操作 UI 仍可交互。窗口调整与角色位置调整分开，方便把她放在桌面合适的位置。

## 开始使用

1. 准备 Windows x64 环境，并在 DSH 中配置一个可用的对话模型。
2. 从本仓库 Releases 下载完整 `.tgz` 安装包，通过 DSH 插件管理安装并重载。
3. 打开侧栏 **Live Character**，启动角色，阅读 Core 许可并完成依赖校验。
4. 导入有使用授权的 Live2D 模型 ZIP，建立角色、填写性格，按需进行 AI 适配。
5. 如需发声，在“语音与口型”中选择服务商，配置密钥与音色，再进行试播。

完整发行包内置桌面运行依赖，提供本地校验与修复。普通使用无需自行安装 Node、Python 或配置开发环境；语音模型权重不包含在通用依赖中。

> **源码仓库说明**：本仓库只含插件源码、测试与文档，不含约 161 MB 的 Electron / Python / Cubism Core 运行库。缺少这些内置依赖时插件无法通过依赖校验，且不会联网补下载，因此请从 [Releases](../../releases) 获取完整 `.tgz` 安装包，不要直接用源码仓库安装。运行库版本、来源与哈希见 `runtime-manifest.json`。

## 这一版的边界

LC 目前为 beta版本。角色库支持多个角色与多套模型，但一次运行一个桌面角色；不同皮套的参数、触摸与口型效果仍需持续验证。

以下能力尚未完整开发或验证：

| 方向 | 当前状态 |
| --- | --- |
| 本地语音模型 | 已有本机 HTTP 服务连接入口；插件内后台托管、自动配置推理环境及“放入权重即可使用”尚未完成。 |
| 记忆插件接入或兼容 | 已有上下文与经历查询等扩展接口；尚未完成第三方记忆插件的全面联调。LC 自身已有会话记录和结构化经历。 |
| IM、上下文等插件协同 | 已留扩展接口；具体插件需逐一适配与测试。 |
| 实时流式语音 | 当前先取得完整音频再播放；低延迟流式合成与完整打断链路仍待开发。 |
| 精确口型同步 | 已有音频近似驱动与口型时间轴入口；精确音素分析、官方 MotionSync 集成尚未完成。 |
| 更多皮套的自动适配 | 功能已实现，泛化能力持续测试中；不保证所有模型一次适配成功。 |

欢迎通过 Issues 提交版本、复现步骤和脱敏诊断。完整功能、隐私说明及使用方法见 [使用说明](docs/USAGE.md)，逐版本修改记录见 [docs](docs)。

## 特别鸣谢

### 大肥鱼与角色创作者

感谢大肥鱼皮套及相关创作的作者们，让项目最初的桌面伙伴有了鲜活的形象：

| 分工 | 创作者 |
| --- | --- |
| Artist | [@神宫凉子](https://space.bilibili.com/13737731) |
| Rigger | [@霓虹猫_NeonNeko](https://space.bilibili.com/3546725618813315) |
| Video Editor | [@泣零7ero](https://space.bilibili.com/22680243) |
| 人设 | [@ZipZipPipe](https://space.bilibili.com/4168597)、@上善无形 |

[大肥鱼模型与原始发布视频](https://www.bilibili.com/video/BV1KmxY66EZ3/)

感谢鲸语制作者 **[@苌萌萌](https://space.bilibili.com/109431227)** 的创作与分享：

[鲸语介绍与原始发布视频](https://www.bilibili.com/video/BV1F4xq66EUS/)

### 参考项目与开源作者

- [InariNGT-Ofiicial / jingyu-live2d-agent](https://github.com/InariNGT-Ofiicial/jingyu-live2d-agent)
- [HoppoChan0721 / dsh-desktop-petbox](https://github.com/HoppoChan0721/dsh-desktop-petbox)
- [Ssssshaiiko / WHALEL2D](https://github.com/Ssssshaiiko/WHALEL2D)
- [MeteorNOX / DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)

感谢这些项目在 Live2D 演出、桌面交互、陪伴设计及余额提醒等方向提供的参考。

也感谢 [Guan / pixi-live2d-display](https://github.com/guansss/pixi-live2d-display)、[PixiJS](https://github.com/pixijs/pixijs)、[Electron](https://github.com/electron/electron)、[Python](https://github.com/python/cpython) 的维护者，以及 [Live2D](https://www.live2d.com/en/sdk/) 与 DSH 团队提供的基础能力。

语音方案调研参考了 [HoppouAI / Breeze-TTS-2.cpp](https://github.com/HoppouAI/Breeze-TTS-2.cpp)、[IndexTTS](https://github.com/index-tts/index-tts) 和 [Tencent Hunyuan / AuK](https://github.com/Tencent-Hunyuan/AuK)；这不代表当前已集成这些本地推理引擎。

### 一起把想法做出来的伙伴

感谢 **ChatGPT / GPT（OpenAI）** 与 **DeepSeek** 在方案讨论、代码实现、接口核对、问题诊断和反复复核中的协作，也感谢每一位参与内测、提供模型测试结果与改进意见的朋友。

以上鸣谢不代表角色、模型、音色或第三方组件的再分发授权；相关素材与组件请遵循各自作者及发布方的许可。
