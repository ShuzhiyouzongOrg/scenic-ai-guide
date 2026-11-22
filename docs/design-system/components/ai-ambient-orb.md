# AI Ambient Orb · 语音状态球

球位于舞台的导游身份区，用于快速辨认收音、等待和播报。游客通过文字、主按钮和字幕完成操作。组件不包含数字人，不占用地图或其他页面的渲染层。

| 规则 | 适用范围与设计理由 | 实现和验收 |
| --- | --- | --- |
| ORB-01 | 一个面板只呈现一颗球。导游形象与当前字幕是主要内容。 | 球由小而可辨的内核、柔和层次和稳定外轮廓构成，周围控件保留背景留白。缩至 320 逻辑像素或放大字体，人物脸部、字幕及麦克风仍完整可见。[Apple Layout](https://developer.apple.com/design/human-interface-guidelines/layout) |
| ORB-02 | 形态与色彩用来协助扫视，录音、失败等关键信息需可读。 | 从工程 Token 取状态色和间距，在浅色、深色、灰阶检查。文字标出状态和下一步，失效时可打字，错误重试以独立按钮呈现。忽略装饰层的读屏焦点，避免实时幅值触发播报。[Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) · [对比规则](../foundation/design-tokens.md) |
| ORB-03 | 宿主选择与实际布局相符的 size 和 active。 | 保持方形容器与固定中心，内部变换不触发布局。用 size 控制视觉直径，点击目标由独立主操作提供，至少 44 × 44 逻辑像素。若球承接点击，点击与键盘必须转发同一业务动作，避免两个重复焦点。[交互规范](../interaction/ai-ambient-orb-interaction.md) · [Apple Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) |
| ORB-04 | 装饰资源失效、低性能或偏好静态时仍能读出状态。 | 渐变/软边可预渲染；无纹理时保留语义色内核与文字。项目只分发有记录的原创/授权资源。不得复刻其他产品的专有球体资产或要求下载一套 GPU 框架。[资产规范](../assets/asset-management.md) · [方案比较](../engineering/ai-ambient-orb-feasibility.md) |

组件输入、可选命令适配及公开枚举见[架构契约](../engineering/ai-ambient-orb-architecture.md)，视觉变化按[动效规范](../motion/ai-ambient-orb-motion.md)执行。

当前实现从 Token 读取默认直径 172 逻辑像素，页面可传较小尺寸。最终版五张原创 WebP 共 7,266 B：主体 2,730 B、高光 666 B、光晕 538 B、思考态蓝紫材质 2,266 B、实测音量提示环 1,066 B。透明边缘在构建前生成。重新生成后核对尺寸、字节和层级；最终主包另算。[图层生成器](../../../scripts/build-guide-art.py) · [资源目录](../../../visitor-app/static/guide-stage/) · [尺寸 Token](../../../visitor-app/design/orb-tokens.uts)
