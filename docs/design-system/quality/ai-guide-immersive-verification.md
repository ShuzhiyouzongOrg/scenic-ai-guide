# 沉浸式 AI 导游与光球交付记录

下文保留独立固定语音栏时期的实测。中央麦克风并入五格导航后，人物舞台、手势和页面双向切换已按[新版 H5 宿主验收](guide-navigation-web-verification.md)重新测量。

本文截图和语音底栏说明记录沉浸式舞台第一版。中央麦克风并入五栏后的入口、截图和手势结果见[自适应底栏交付记录](guide-navigation-verification.md)。

2026-11-22。AI 导游标签页现在按景区位置、角色舞台、当轮字幕和固定语音底栏排列。从地图或景点详情提问时带入地点。点击或按住麦克风开始收音，长按时松开发送、上滑取消。文字提问、历史和设置分别从独立入口打开。历史保留完整回答、来源、重读和清除操作。[页面入口](../../../visitor-app/pages/ai-guide/index.uvue) · [页面与组件契约](../components/ai-guide-components.md)

## 分阶段交付

| 阶段 | 修改与验证 | 尚需外部条件的部分 |
| --- | --- | --- |
| 技术审查与设计 | 核对 HBuilderX 5.24、App Vapor、微信原生画布、H5 Web Audio、宿主/模型/讯飞三种播放 owner。将跨端图形、预制 GIF 和音源方案写入[可行性报告](../engineering/ai-ambient-orb-feasibility.md)。 | 各厂商音频与图形权限以正式宿主为准。 |
| 光球和素材 | UTS 单时钟驱动原创透明珠体、高光、光晕和声音环。独立锚定在人物侧边。从同一份 Token 生成时长、增益和材质。切后台、收起舞台、暂停与减动均可停表。[球体实现](../../../visitor-app/components/sg-ai-ambient-orb/sg-ai-ambient-orb.uvue) · [材质生成](../../../scripts/build-guide-art.py) · [实际状态帧](evidence/ai-orb-motion-perception.webp) | 低端实体设备的长时间发热与耗电。 |
| 音频与对话 | 分离录音授权、录制、问答、分段播报、模式及可见性，取消和打断使旧轮次失效。录音与播放器分别提供实测 RMS，无法获取时保留状态反馈。已有非流式接口返回整段答案，字幕采用当前真实播报分段。宿主播放器支持暂停和原位置续播；无对应能力的数字人播放路径只给出打断。[音频与异步实测](evidence/guide-audio-runtime.json) · [状态规则](../interaction/ai-ambient-orb-interaction.md) | 商用讯飞云数字人、上行识别准确率、真实音色和嘴型同步。微信当前随包原生模型为 Haru，选择其他导游音色不增加其他原生模型。 |
| 页面与交互 | 新增舞台、字幕、语音底栏、电平、历史消息与抽屉组件。修复 Android 弹层高度，真正在页面上打开设置、历史、文字三个面板。H5 验证焦点圈定、Esc、窄屏、大字、中文和英文。[双引擎报告](ai-guide-immersive-web-verification.md) · [Android 设置](evidence/ai-guide-native-settings.webp) · [历史](evidence/ai-guide-native-history.webp) · [文字](evidence/ai-guide-native-text.webp) | iOS 原生软键盘避让、VoiceOver、Android TalkBack 和来电/耳机抢占。 |
| 项目知识库 | 新增舞台和光球的视觉、动效、交互、架构与质量规范。四个专项工作流归入项目 Skills，根指导文件已关联，实际发现九个项目 Skills。[设计索引](../README.md) · [项目指导](../../../AGENTS.md) · [质量核对](ai-ambient-orb-checklist.md) | 以后 SDK 或音源契约变更时需要重跑对应链路。 |

## 为什么录音时看起来几乎静止

这次打开已信任的微信验收项目时，导游设置中的“减少动态效果”有勾选，页面也显示静态形象。旧版本还会把没有保存偏好的微信安装默认设为减动。即使允许动画，轻声 RMS 直接用于很小的缩放和旋转时，在 62–76px 图形上也难以察觉。[实际微信设置](evidence/immersive-guide-wechat-reduced.webp)

修复后的微信新安装采用轻量动效，仍恢复之前明确保存的偏好。在导游设置可直接切换同一个开关。支持读取系统偏好的宿主继续服从系统减动。收到真实声音时先做感知压缩，再通过不对称的起落时间平滑，驱动珠体轮廓、高光和单圈扩散。数字静音、无采样和减动分别采用微弱听候、带文字说明的状态呼吸和完全静止。[运行时偏好](../../../visitor-app/design/motion.uts) · [动作参数](../motion/ai-ambient-orb-motion.md)

在微信独立验收窗口关闭已勾选的减动、退出设置后，开发者工具加载 Cubism Core 4.2.2，报告首个有效纹理帧。原生完整人物出现在右侧，未盖住左侧光球与底部麦克风。该 QA 窗口保留标准动效，便于继续对照。[微信实际 Live2D 舞台](evidence/immersive-guide-wechat-live2d.webp)

微信开发版和体验版的录音诊断仅记录格式、帧数、帧长度和数值峰值。复测时点击麦克风、先轻声再正常说话约三秒，使用左侧“取消”结束。控制台的 `[guide-recorder] stopped` 可区分未收到帧、有效静音与有声输入。当前已确认官方 API 的编译产物与可控 PCM 测试；真人微信录音的峰值单列待核。[微信录音桥](../../../visitor-app/services/wechat-audio.js) · [已测音源](evidence/guide-audio-runtime.json)

实际 320px 宽的 Chromium 页面上，受控音源走浏览器真实录制与分析链，62px 球体静音切到轻声、轻声切到中等输入时，分别有 1,192 和 1,849 个像素超过差异阈值，总面积为 3,844 像素。开启减动后同一观察窗内为 0。演示是测试用生产页面录屏，应用本身由状态和音频实时绘制。[页面实录](evidence/guide-immersive-orb-demo.webp) · [测量方法](ai-guide-immersive-web-verification.md)

## 平台结论与复测准备

另在最终 H5 页面单独观察了一次完整待机周期。76px 珠体在 10.03 秒、19 次取样中有 19 个不同变换；5,776 像素中有 560 个像素的通道范围超过 8/255。这解释了短窗口内待机看似静止的现象，也提供了与录音时明显变化的量化对照。[待机整周期实测](evidence/ai-guide-h5-idle-cycle.json)

| 环境 | 本轮结果 | 后续需要准备 |
| --- | --- | --- |
| H5 | Chromium 151、WebKit 26.5 各两种尺寸。Chromium 通过真实浏览器 MediaStream/播放器、取消、打断、暂停、回页和不同时序测试。此 Windows WebKit 缺少录音 API，已验证不可用提示与文字替代。 | 若验收移动 Safari，使用能访问测试 HTTPS 站点的 iPhone 并授予麦克风权限。 |
| 微信小程序 | 开发者工具 Stable 1.06.2303220，基础库 3.18.0，独立项目已登录。冷启实看舞台、底栏及设置，复现并切换已保存的减动偏好。九路由分别经 WCC/WCSC 通过。生产主包 2,054,538 B，余量 42,614 B。开发者工具有 Cubism 中 Node 分支依赖分析提示和启动耗时提示。[微信舞台](evidence/immersive-guide-wechat.webp) · [源快照与构建](evidence/ai-guide-voice-builds.json) | 一台装有微信、已加入小程序体验成员的手机。允许麦克风，能访问已配 HTTPS 合法域名的测试后端；分别核对说话、静音、拒绝权限与重入。 |
| Android App | 10 页 Vapor 编译。MuMu Android 12 上实测录音与取消，该宿主未提供实时 PCM，界面显示“未提供音量”。听候状态九帧有 34.15% 像素可辨变化。已分别核查三种抽屉。[录音连续帧](evidence/ai-guide-native-listening-frames.webp) · [复测记录](evidence/ai-guide-native-voice.json) | 一部开启 USB 调试的 Android 手机，含项目插件的基座，麦克风/扬声器；检查实际录音质量、系统抢占与持续性能。 |
| iOS App | Windows 完成 10 页 Vapor 编译并生成 UIKit 减动接口代理。Windows 标准基座无法加载 iOS UTS 插件。[构建结果](evidence/ai-guide-voice-builds.json) | Mac/Xcode 与可运行的签名构建，或含该插件的自定义基座和 iPhone。验证系统减动、真机收音、键盘及音频中断。 |
| 语音供应商 | 演示环境对 ASR、LLM、TTS 使用本机隔离服务，另核对真实音频解码和本地模型回调。 | 在测试服务器配置已授权的讯飞听写、TTS、数字人/XRTC 服务、可用虚拟人及音色；手机可达该服务器。凭据由服务端保管。 |
| 鸿蒙 | 按本轮约定暂缓。 | 本轮无需准备设备或开启 Hyper-V。 |
