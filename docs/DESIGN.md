# Live Character · 界面设计规范

本规范服务桌面陪伴工具与 DSH 内嵌设置，不用于营销落地页。角色及美术作品是主视觉，设置侧栏承担精确调整。默认保持 LC 青绿色识别；DSH 内嵌界面继续读取宿主既有表面、文字和边框变量。

## 基础约定

| 项目 | 约定 |
| --- | --- |
| 默认画布 | #f3f6f5，中性浅灰绿 |
| 面板 | #ffffff |
| 输入区 | #f7f9f8 |
| 主文字 | #223a3b |
| 次要文字 | #637575 |
| 边界 | #dce5e2 |
| LC 强调 | #246c67 |
| 选中底色 | #eaf3ef |
| 字体 | Segoe UI Variable / Segoe UI / Microsoft YaHei UI / system-ui，使用本机字体 |
| 字号 | 设置正文 13px，字段和导航 12px，次要提示 11px，页内标题 16px |
| 圆角 | 输入与按钮 8px，分区 10px，主面板 14px，弹窗 16px |

1. 角色预览占据主要空间；预览底板用轻微点阵作空间参考，不覆盖角色本身。角色姓名/状态继续位于预览下方。
2. 保留七个原有分类。导航使用同一套内嵌 SVG 线图标；紧凑侧栏两列，较宽宿主侧栏三列。原模型参数抽屉及分栏拖动保留。
3. 主操作使用 LC 强调色，普通操作使用中性按钮；错误/警告继续红/黄文字并保留文字信息。避免大量同等强调的卡片。
4. 普通说明沿用悬停/聚焦注释；调用 AI / tokens / 语音费用提示始终直接展示。
5. 键盘焦点明确，保留原 aria-label/pressed 信息，尊重 reduced-motion。桌面悬浮工具按钮维持紧凑尺寸和原有命中逻辑；不声称完整移动端无障碍认证。
6. 字体、图标均本地/内嵌，无 CDN、第三方追踪、远程字体或新 UI 运行库。
7. 宿主样式约束在 .lc-page / LC 专属类中；本地主题置于 companion.css 末尾，保证覆盖顺序。用户设置的台词气泡颜色、文字大小、对话框透明度等由原逻辑控制。
8. 窄窗口沿用原横向/纵向分栏方案，不新增第二套业务导航或隐藏现有功能。真实 DSH 各主题、缩放与不同窗口尺寸需要本机复测。

## 参考选择与边界

检索 Refero 的 Settings、AI Assistant、桌面工具类别，选取 Linear 的设置层级与 Raycast 的工具设置组织方式作为参考。Refero Styles 的网站设计分析用于了解其克制的配色和边界语言；LC 使用自身品牌与角色工作台布局。

- Refero · Linear Settings：https://refero.design/screens/6d65083c-4e88-47a9-9f6e-14f25f7cd3cd?source=screenshots-similar-app-37138191-f2c5-4e21-8466-504861db7ab2
- Refero Styles · Linear：https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1
- Refero Styles · Raycast：https://styles.refero.design/style/3b6a17f0-3bdf-418c-a95e-0b89e5a8b2f8
- Raycast 官方 Settings：https://manual.raycast.com/settings
- Anthropic frontend-design：https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md
- UI/UX Pro Max：https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md

两个设计 skill 仓库作为开发规范资料参考，没有安装到 LC/DSH，也没有运行其风格数据库或把资料注入角色。借鉴范围为产品匹配、视觉层级、统一图标、焦点与反馈原则；没有宣称执行外部 skill 的完整工具流程或获得无障碍认证。

Refero 的动态详情/完整案例画面本环境未能完整打开，依据是公开索引与可读 Styles 页面，不宣称浏览了付费案例库或逐像素复刻。全部 LC 图标为本轮内嵌线条绘制，未分发其他产品截图或字体。
