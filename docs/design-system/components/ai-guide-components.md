# 沉浸式 AI 导游组件

按使用顺序组织界面。新进入的游客先看见当前导游、听得懂怎样开始讲话，键盘和上下文仍可随时到达。复用 [sg-button 等基础组件](component-guidelines.md)，以[项目 Token](../foundation/design-tokens.md)控制主题、字体、间距及安全区。

| 规则 | 组件职责、失效路径 | 实现验收 |
| --- | --- | --- |
| GUIDE-CMP-01 | 页头显示当前景区、导游身份和对话记录、设置入口。连接中、在线、静态替代用不同文字；名称由角色元数据决定。 | 屏宽 320、标准/大字及三语下均能打开记录和设置。永久信息和当前操作分层，头部不挤压舞台。[Apple Layout](https://developer.apple.com/design/human-interface-guidelines/layout) |
| GUIDE-CMP-02 | 舞台容纳一个可见人物，保留模型原比例、头脸及上身，语言和操作使用外层原生控件。连接中提供占位，失败或减动展示匹配的静态形象。 | 页面给舞台非零测量区域。App/WebView 保留消息桥；微信 overlay 绑定原占位并与滚动可见区域同步。切换文本、横竖屏或回前台不遮输入、按钮或系统 tab。[能力审计](../engineering/ai-ambient-orb-feasibility.md) · [原生层恢复证据](../quality/wechat-followup.md) |
| GUIDE-CMP-03 | 字幕提供当前话轮可读内容；消息历史保留问答全文、来源和朗读入口。文字模式支持真实输入和已有地图上下文。 | 按音频 owner 提供的段标识同步，缺少时间戳时保留完整句段，兼顾无声音的游客。历史不重复追加同一回答，换语言保留原文。[Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) · [互动规则](../interaction/ai-guide-interaction.md) |
| GUIDE-CMP-04 | 语音控制区以麦克风为主要操作，按状态切换结束/发送、取消、暂停或继续、打断。球只补充状态。建议问题和导航入口为次级操作。 | 单手可触及，操作允许文字放大和键盘触发，清除历史等破坏性操作保持确认。只有音源提供暂停/恢复能力时显示对应控制。[Apple Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) · [球体规格](ai-ambient-orb.md) |
| GUIDE-CMP-05 | 输入面板显式切换语音、文字和历史的展示。输入获得焦点后，软键盘避让与底部安全区共存。 | 测试键盘显示、系统返回、输入 500 字上限、复制回答及滚动长历史。保存草稿，发送成功后按原业务清理；错误仍可恢复。[表单与状态](../interaction/interaction-states.md) · [跨端指南](../engineering/cross-platform-compatibility.md) |

## 维护入口

Android 的 Live2D WebView 从挂载时起独占人物区域。即使模型就绪消息较晚，游客也只会看到舞台自己的加载提示或一位动态人物。减动或舞台失败时回落到一张原生立绘。复测须覆盖系统设置往返及键盘发送后的可见帧。[舞台与宿主的职责](../engineering/ai-guide-architecture.md)

| 工程组件 | 输入和职责 |
| --- | --- |
| [sg-guide-stage](../../../visitor-app/components/sg-guide-stage/sg-guide-stage.uvue) | height、可选 photo/blend 与默认插槽；为已有数字人提供稳定边界。 |
| [guide-subtitle-panel](../../../visitor-app/components/guide-subtitle-panel/guide-subtitle-panel.uvue) | 接受当前问题、字幕、欢迎与长文标志；全文入口把用户交给历史面板。 |
| [guide-bottom-navigation](../../../visitor-app/components/guide-bottom-navigation/guide-bottom-navigation.uvue) | 按[导航契约](navigation.md)承载四个稳定目的地及中央语音插槽；普通项只分发根页切换。 |
| [voice-action-button](../../../visitor-app/components/voice-action-button/voice-action-button.uvue) | 在触按开始时记住操作意图，由实际状态驱动录音、结束、取消、打断或继续。进入面板或离页立即停止挂起的长按。历史入口由页头提供，文字入口在字幕行，独立暂停等控制由会话页面提供。 |
| [guide-sheet](../../../visitor-app/components/guide-sheet/guide-sheet.uvue) | 承载第二层的长内容和操作。保留遮罩关闭、可聚焦关闭按钮和独立滚动。 |
| [guide-message-card](../../../visitor-app/components/guide-message-card/guide-message-card.uvue) | 保留提问与回答全文、来源和回听，按业务 kind 呈现路线推荐、景点讲解或一般回答。 |
| [guide-level-meter](../../../visitor-app/components/guide-level-meter/guide-level-meter.uvue) | 每个有效音频帧推动七根电平柱前进一步，即使连续帧的音量相同。柱高与光球共用轻声显示增益，原始录音保留线性 RMS。连续静音应全部回到底线，缺少读数时隐藏，减动时静止。 |
| [sg-ai-ambient-orb](../../../visitor-app/components/sg-ai-ambient-orb/sg-ai-ambient-orb.uvue) 与 [sg-guide-glow](../../../visitor-app/components/sg-guide-glow/sg-guide-glow.uvue) | 前者呈现状态和可选响度，后者只呈现光晕。主操作和状态文本位于外部，保持装饰层无交互职责。 |

微信收音的界面验收要区分持续数字静音与连续丢帧。前者保留七根底线，后者应撤下电平条并显示「未提供音量」。恢复采样后按新分片重新绘制。[三段音量与断帧自测](../quality/wechat-orb-self-test.md)

当前 AI 页将舞台高设为窗口高度的 44%，并限制在 192–360 逻辑像素；在系统栏隐藏后重测。视觉球在不足 350px 宽时用 62px，其余用 76px。舞台允许显示已核实的当前景点/景区摄影作轻背景。该页面尺寸优先于球体通用预览直径；重新调参时按小屏、可触达区域与立绘相对比例重新取证。[实际页面](../../../visitor-app/pages/ai-guide/index.uvue) · [摄影](../assets/image-guidelines.md)
