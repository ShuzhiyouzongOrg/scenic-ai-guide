---
name: ai-voice-interaction
description: 修改 Scenic AI Guide 导游录音、ASR、分段字幕、播放 owner、暂停、打断、重连及真实测幅时使用。
---

# 导游语音交互

中央按钮复用[五格导航](../../../docs/design-system/components/navigation.md)。修改点击/长按时，运行[语音操作回归](../../../scripts/verify-voice-action.py)，检查手势期间音源自然结束、权限迟到、切页和键盘释放时的意图。保留字幕行文字替代、页头历史和播放中止入口。

先看[会话操作](../../../docs/design-system/interaction/ai-guide-interaction.md)、[八态投影](../../../docs/design-system/interaction/ai-ambient-orb-interaction.md)和[端能力证据](../../../docs/design-system/engineering/ai-ambient-orb-feasibility.md)。从录音器 start、ASR 返回、音频 playing 或可信的数字人讲话事件追到字幕、状态及对应 owner 的测幅。验证语言、音频编码、轮次与取消后的晚到事件。

真实电平有来源和采样窗，静音值为 0，无读数为 -1。禁用计时器或口型变换冒充实时信号。字幕只在有证据的当前段变化。保持线上接口、既有用户授权和测试数据隔离。用[专项清单](../../../docs/design-system/quality/ai-ambient-orb-checklist.md)分别复测权限取消、中段暂停、恢复、网络失败和切页；记录来自麦克风、预制测试音频或状态节律及可执行的降级路径。
