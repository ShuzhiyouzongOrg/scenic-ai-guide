---
name: ai-motion-design
description: 设计或评审 Scenic AI Guide 状态球、角色舞台、语音幅度平滑、可中断过渡与减少动态效果时使用。
---

# 导游动效

阅读[状态球动效](../../../docs/design-system/motion/ai-ambient-orb-motion.md)、[人物与字幕](../../../docs/design-system/motion/ai-guide-motion.md)和[项目减动实现](../../../visitor-app/design/motion.uts)。确定当前业务态、用户偏好、画面是否可见、音源是否可测，再选静态、状态节律或采样驱动路径。

优先固定几何并改变内部透明度、变换与层级，禁止无理由叠加常驻粒子、滤镜或第二套 WebGL。测量连续的静音/脉冲、暂停、切模式、隐藏与卸载后的回调数。审查时用[专项清单](../../../docs/design-system/quality/ai-ambient-orb-checklist.md)记录动态两帧、减动同态、低性能退化与实际采样范围；未测量的 FPS、耗电或 iOS 真机表现保持待验。

微信新装测试和保存过减动偏好的测试分别执行；检验导游设置与个人页改动同一偏好。iOS 和 Android 读取系统后，系统减动开启时不得以应用开关覆盖。调节响度响应时在实际舞台的 62/76px 尺寸比较静音、轻声、中等声与无采样的像素变化。[宿主适配](../../../docs/design-system/engineering/cross-platform-compatibility.md)

复查电平条时，从正常音量回到多帧连续的精确零值，检查历史柱逐帧退回到底线。用低于 0.025 RMS 的受控输入验证轻声可与静音区分，并记录宿主实际收音、测试注入帧和物理手机各自的证据。
