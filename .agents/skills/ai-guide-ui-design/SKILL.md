---
name: ai-guide-ui-design
description: 调整 Scenic AI Guide 的沉浸式导游舞台、语音优先布局、字幕或文字模式的视觉层级时使用。
---

# 导游界面设计

修改底栏或入口时先读[五个根页面的导航](../../../docs/design-system/components/navigation.md)。四个普通根页使用系统栏。导游的中心格提供当前语音操作，打字入口在字幕行，历史位于页头。对照宿主系统栏测量四个普通目的地，观察两个方向的切换和减少动态表现。

从本 Skill 目录读取[页面规范](../../../docs/design-system/pages/ai-guide.md)、[导游组件](../../../docs/design-system/components/ai-guide-components.md)与[版式 Token](../../../docs/design-system/foundation/design-tokens.md)。检查页面源码里人物、字幕、麦克风与键盘之间的实际层叠和所有权。

调整文字面板后，保持有实际可见高度的系统键盘展开，验证光标、当前输入和整个发送按钮同时可达，直接点击发送后检查回答及焦点。原生宿主已经上推页面时只补偿剩余遮挡。[键盘适配与测量](../../../docs/design-system/engineering/ai-guide-architecture.md)

让游客在首屏认出导游并找到说话入口。给文字提问、暂停或打断及历史留可发现的路径。使用原角色立绘、系统偏好和已授权资产；避免把状态球扩大为舞台主页或按页面另造主题。复查简中、繁中、英文、暗色、大字、缩屏及软键盘。在[专项核对表](../../../docs/design-system/quality/ai-ambient-orb-checklist.md)为每个宿主标明尺寸、操作和截图，未实测情形保留原因。
