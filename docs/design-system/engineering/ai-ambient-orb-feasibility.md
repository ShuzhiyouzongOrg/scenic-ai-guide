# 导游语音能量球可行性审查

**审查时间为 2026-11-22，基线为本轮沉浸式页面改造前的工作区。** 首选在导游舞台下方放置单个、可降级的语音状态组件。数字人保有自己的渲染器和音频所有权，能量球读取状态与可选幅度。以下可行性判断与已有宿主实测分开记录。

## 已核实的工程

| 实际入口 | 审查所见 | 对实现的影响 |
| --- | --- | --- |
| [manifest](../../../visitor-app/manifest.json) 及[上轮原生构建](../quality/evidence/native-live2d-final-builds.json) | 应用 0.2.0（200），Vue 3，App 目标为 Vapor bytecode；Web 与微信实际构建为 VDOM。本机同一套 HBuilderX 的 uniapp-cli-vite 为 5.24.2026081216.3200，uniapp-uts-v1 为 5.24.2026081216.3203。 | 以此工具链验证类型、Sass 和平台产物。现行在线兼容表可能含后续版本。 |
| [AI 导游入口](../../../visitor-app/pages/ai-guide/index.uvue) 与[语音面板](../../../visitor-app/components/sg-voice-panel/sg-voice-panel.uvue) | 原页面管理录音授权、录制、提交、聊天、播放队列、取消和错误。播放器 owner 可为宿主、Live2D 或讯飞。等待麦克风与开始录制是两个时刻，回答抵达与正在发声也是两个时刻。 | 把业务状态投影给 UI；只由原控制器获取麦克风、发请求、分配播放 owner。 |
| [Web 录音](../../../visitor-app/services/web-recording.js)、[Web 播放](../../../visitor-app/services/web-narration.js)、[服务端语音](../../../server/src/services/voice.mjs) | H5 使用 MediaStream、MediaRecorder，停止后转换单声道 16 kHz WAV。网页播放使用自己的 HTMLAudioElement。ASR/TTS 在服务端进行，返回文本、分段和可访问的音频。 | 可旁路监听流或音频副本。音量取不到仍应完成原录音上传和播放；保留相同语言、编码、缓存、错误恢复与打断。 |
| [讯飞页面](../../../server/src/web/digital-human/app.js)、[Live2D 页面](../../../server/src/web/live2d/runtime.ts)、[微信组件](../../../visitor-app/wxcomponents/scenic-live2d/index.js) | 讯飞经 WebView/网页接 XRTC 与原 SDK。App/Web Live2D 在独立网页中渲染，微信是独立原生 WebGL 画布；已有 ready/error、讲话、停止与资源销毁路径。[宿主切换记录](../quality/wechat-followup.md) | 维持舞台实例、已有消息桥和单一声源。WebView load 与模型 ready 分开；不得从口型参数或正在播报标志推断声压。 |
| [减少动态设置](../../../visitor-app/design/motion.uts) | Web 可监听系统偏好，Android 有 UTS 读取系统设定。基线为缺乏桥的宿主初始静态。本轮 iOS 接 UIKit 系统偏好，原生应用回前台重读，未完成 iPhone 实读；微信新装默认轻量动效，优先恢复明确保存的应用偏好。[能力记录](../quality/motion-source-verification.md) | 直接消费统一偏好，页面隐藏、进入输入模式或减动时停止装饰循环。不给球单开传感器或全局计时器。 |

## 可选的图形实现

| 路径 | 能做什么 | 代价、边界及选择 |
| --- | --- | --- |
| UTS + 少量嵌套 view／image | 固定布局中对内核、光晕或纹理做小幅缩放、旋转、透明度变化，静态模式保留底色和轮廓。 | 首选复用工程 Token/静态资产。不对宽高或阴影逐帧写入。一个球无需第二个 WebGL 上下文。与原生舞台并存时检查 z 序、裁切和手势命中。[transform](https://doc.dcloud.net.cn/uni-app-x/css/transform.html) · [opacity](https://doc.dcloud.net.cn/uni-app-x/css/opacity.html) |
| CSS 渐变、遮罩、滤镜 | 文档给出 linear-gradient 和方向、色标示例；Web 可表达更多种类。 | 只把通过对应宿主实测的线性渐变用于共享样式。径向、锥形、多背景、模糊、混合模式无统一的 5.24 证明；可在小尺寸原创栅格中预先绘入柔边和静态光色。主题需分别检查。[背景兼容表及示例](https://doc.dcloud.net.cn/uni-app-x/css/background-image.html) |
| Canvas 2D 绘制 | DCloud 提供异步获取上下文及线性/径向渐变；径向绘制在 App、Web 存在差异。 | 若图层无法表达再验证。需要等待非零尺寸与上下文，适配 DPR、隐藏/返回、内存和失效恢复。微信的原生画布与舞台在层叠、关闭/重建时需分别实测。[canvas](https://doc.dcloud.net.cn/uni-app-x/component/canvas.html) · [2D 渐变](https://doc.dcloud.net.cn/uni-app-x/api/canvasrenderingcontext2d.html) |
| WebGL、Shader 或额外 WebView | 支持的宿主能渲染复杂体积形态。 | 已有模型占用 GPU、上下文和网络。单为球新增一套渲染器，会增加弱机帧耗、图层覆盖和恢复成本。代码复查中没有跨端共享的着色器管线。 |
| GIF、动图 WebP、序列帧 | 可回放预制美术；DCloud 列出各原生端支持 GIF 图片。 | 固定帧相位无法逐样本响应。GIF 解码器的循环/停止与页面状态难以同步，跨端 WebP 解码配置不同。序列帧可控，但需预解码、多帧缓存；例如 128² RGBA × 24 帧约 1.5 MiB 的像素缓存，未计缓存层与 DPR。微信上一版主包余量仅 13,994 B。首选静态小资源及可中断变换。冻结帧始终可显示。[image 格式表](https://doc.dcloud.net.cn/uni-app-x/component/image.html) · [包体基线](../quality/wechat-followup.md) |

## 真实电平和替代反馈

| 音源 | 可观测信号及边界 | 无数据时 |
| --- | --- | --- |
| H5 正在录音的 MediaStream | 复用同一次授权的流，在本机取时域 PCM，计算短窗 RMS、归一化、限幅。静音是合法的零；断开节点与音频上下文，原媒体轨按录音器生命周期释放。[Web Audio](https://www.w3.org/TR/webaudio/#AnalyserNode) | 已获准且处于录制时显示收音文字和计时；权限请求期间显示等待。 |
| H5 播放或模型自有音源 | 可读取被允许分析的自有音频；受跨域、自动播放与播放 owner 限制。Web Audio 规范限制跨来源媒体采样。单纯给 audio 元素设置 crossOrigin 或改接分析图可能让声音消失，需先证实同源/CORS 或采用旁路样本并与时钟同步。 | 沿用原播放器。只有播放回调确认才显示播报态。谱、嘴部动作或模拟呼吸不能充当读数。[Web Audio 跨源限制](https://www.w3.org/TR/webaudio/#MediaElementAudioSourceNode-security) · [Cubism 口型输入](https://docs.live2d.com/en/cubism-sdk-manual/lipsync/) |
| Android／iOS 原生录制与播放器 | 当前 DCloud 表把 RecorderManager.onFrameRecorded 在 App 两端列为不支持；InnerAudioContext 有播放/暂停/结束/错误、位置及音量设置，未见实时电平。交付前核对实现是否另有经过验证的实采来源，保持原录音格式与业务链路。[录音事件](https://doc.dcloud.net.cn/uni-app-x/api/get-recorder-manager.html) · [音频接口](https://doc.dcloud.net.cn/uni-app-x/api/create-inner-audio-context.html) | 对用户呈现状态提示；固定包络属于状态动画。不可把编码压缩率、volume 设置、进度或计时器解释为振幅。 |
| 微信录制 | DCloud 的 frameSize 文档仅记 MP3；微信原生资料及类型列 MP3 与 PCM。按 wx 宿主能力和实际选用的编码判断。只有已知采样率、声道、位深与字节序的原始 PCM 才可测 RMS；切换录制格式须一并验证上传的 ASR 输入。[微信 start](https://developers.weixin.qq.com/miniprogram/dev/api/media/recorder/RecorderManager.start.html) · [微信官方类型](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts) · [讯飞 IAT 输入](https://static.xfyun.cn/doc/asr/voicedictation/API.html) | 宿主未交付有效分片时回到状态可视化，记录真机采样缺口。 |
| 讯飞数字人/XRTC、Live2D、后台 TTS | 实际 SDK 的 stream、讲话和结束事件可驱动状态。项目本地模型的嘴型、合成语速和网络请求时间均不能替代采样。若厂商明确公开 meter 并取得授权，再按事件时序验证实际数值。[讯飞 Web SDK](https://www.xfyun.cn/doc/tts/virtual_human/Web-SDK.html) · [本地模型许可](../../../server/src/web/live2d/THIRD_PARTY_NOTICES.md) | 保留静态形象、回答文本与手控朗读。勿将本机 mock 成功推定为已取得云模型、语音或美术公发许可。 |

## 立项结论和验收边界

实际八态为 IDLE、LISTENING、THINKING、SPEAKING、PAUSED、ERROR、DISABLED、CANCELLED。额外重连提示沿用低强度等待视觉。真实测幅保留“不可观测”和“实测静音”的区别。本地 WebView 的 Cubism 音频管理器在播放中读取 analyser.getFloatTimeDomainData，再由 LipSyncFrame.rms 给出该窗能量。接入桥消息须携带本轮播放身份。模拟器中简单张嘴、微信内部正弦口型或静态组件的定时器都不构成该证明。[真实音频图](../../../web/src/lib/live2d/live2dManager.ts) · [分析帧定义](../../../web/src/lib/live2d/lipSyncAnalyzer.ts) · [本地舞台](../../../server/src/web/live2d/runtime.ts) · [状态与架构](ai-ambient-orb-architecture.md)

可实施无新增运行时库的组件与语音优先页面。平台不能提供真实电平时，显示清晰的文字、图标及有节制的状态反馈。与静态相比，动画必须带来明确的操作信息。测试覆盖语音权限、后台、音频抢占、取消、过期回调、重入、弱机和减少动态。动作路径、启停计数、音源证明和截图分别取证。单次 onShow、CSS 编译、普通图片或预制动画都不能证明实时声纹、帧率或功耗。本轮按用户要求跳过鸿蒙运行验证。[Apple Motion](https://developer.apple.com/design/human-interface-guidelines/motion) · [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
