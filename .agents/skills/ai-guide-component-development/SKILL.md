---
name: ai-guide-component-development
description: 在 Scenic AI Guide 的 uni-app x／UTS 中拆分或接入导游舞台、状态球、字幕、录音控制和平台适配组件时使用。
---

# 导游组件开发

中央语音操作由 VoiceActionButton 分发，音频和导航生命周期留在各自拥有者。[导航契约](../../../docs/design-system/components/navigation.md)列出系统栏恢复、隐藏失败回退、焦点和安全区；修改时对照四个真实根页运行双向验证。

先读[组件契约](../../../docs/design-system/components/ai-guide-components.md)、[球体接口](../../../docs/design-system/engineering/ai-ambient-orb-architecture.md)和[宿主架构](../../../docs/design-system/engineering/ai-guide-architecture.md)。定位真实 easycom 使用点，区分页面拥有的录音、请求和播放器，以及只读视觉输入。沿用统一 Token、现有消息桥、音频 owner 与微信原生舞台。

改 Android Live2D 时，让 WebView 与原生立绘互斥。分别验证页面加载、模型就绪、动作和失败回落。从系统设置及输入法设置返回，保存人物连续帧，核对恢复时只查询状态且没有重播。单张静态立绘不能证明动态舞台已恢复。

接入新属性时同时验证默认值、异常值、静音、缺失样本、快速切换、减少动态、隐藏及卸载。不得为装饰开第二只麦克风、播放器或 WebView，不把 Web API 放进未隔离的 UTS。按[构建与取证清单](../../../docs/design-system/quality/ai-ambient-orb-checklist.md)运行 Token 和项目 Skills 校验，再用对应目标编译、比较发布包体并检查真实页面。记录第三方资源授权和未验证宿主。
