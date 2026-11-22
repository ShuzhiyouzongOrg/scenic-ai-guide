# 导游页面与语音、数字人边界

页面持有会话、录音状态、语音输出 owner、消息和历史。舞台容器提供尺寸、插槽和可见性；字幕及状态球只消费投影。可视层的销毁不得意外修改游客资料、切换景区、创建额外云会话或触发地图提问。

五个根页面经 useScenicInsets 协调系统栏。导游的中央按钮、四个目的地由独立组件渲染，普通根页沿用原生栏。切离导游后使挂起手势和当前录音失效；系统隐藏失败时留存原栏并在正文提供麦克风。修改这条路径时，要分别测量屏内实色轨道、底部安全区、键盘焦点和语音手势的上缘可点击范围。[导航契约](../components/navigation.md) · [布局适配器](../../../visitor-app/design/layout.uts)

打开文字输入时，H5 依据 visualViewport 与页面底边计算遮挡；App 在聚焦之前记录页面底边，订阅系统键盘高度，并扣除宿主已经缩小或上推的距离。关闭或卸载时解除本次监听。微信使用 textarea 的宿主避让。验收时必须让一个有实际高度的键盘保持打开，输入一段文字，确认整个“发送”按钮可见并可直接点击。[App 键盘事件](https://doc.dcloud.net.cn/uni-app-x/api/keyboard.html) · [多行输入框](https://doc.dcloud.net.cn/uni-app-x/component/textarea.html) · [验收记录](../quality/guide-navigation-verification.md)

| 规则 | 数据流、平台取舍与验证 |
| --- | --- |
| GUIDE-ENG-01 | 录制开始→停止得到本轮音频→携带 locale 和景区/会话上下文的现有接口→回答及资料→已有 TTS/数字人路由。服务器保留缓存和编码协商；若微信实际改用 PCM 须验证 WAV/PCM 元信息与供应商首帧。英、简中、繁中分开验收，账号真实音色能力单列。[讯飞协议](https://static.xfyun.cn/doc/asr/voicedictation/API.html) · [项目语音服务](../../../server/src/services/voice.mjs) |
| GUIDE-ENG-02 | WebView/网页内部的 SDK、模型和媒体仍由原实现拥有。握手分开记录页面可达、模型 ready、讲话、结束、错误。宿主按页面可见、会话或播放轮次接收桥通知，对可能迟到的同名事件验证标识。[讯飞舞台](../../../server/src/web/digital-human/app.js) · [本地舞台](../../../server/src/web/live2d/runtime.ts) |
| GUIDE-ENG-03 | 微信维持 scenic-live2d 原生 overlay 和实际插槽。App/Web 保留既有云端与本地路径；收到页面卸载、离后台或偏好变化时调用各自的暂停、停止或销毁。回到前台重新测量；隐藏的画布和已经过期的云会话不更新可见 UI。[微信原生接入](../../../visitor-app/wxcomponents/scenic-live2d/index.js) · [微信实测基线](../quality/wechat-followup.md) |
| GUIDE-ENG-04 | 使用独立轮次识别录音授权、请求、TTS 队列和模型播放事件，结束、打断及切 owner 时失效旧结果。用户看到的字幕和电平均从有效轮次取得；只有同源真实采样可驱动响度。状态球缺数据时返回 -1，保留真实零值。[Web Audio](https://www.w3.org/TR/webaudio/#AnalyserNode) · [电平来源与不可用值](ai-ambient-orb-architecture.md) |
| GUIDE-ENG-05 | 各端能力用 UTS 条件编译隔离。新增 JS 只在原 Web 或微信原生专用边界装载；抽出的 UI 复用 easycom、动态主题和现有导航。构建时核对微信四个业务分包、实际主包余量以及原生十页；截图需注明宿主及服务类型。[现有工程规范](component-architecture.md) · [平台限制](cross-platform-compatibility.md) |

功能变更应同时检查[页面结构](../pages/ai-guide.md)、[动效](../motion/ai-guide-motion.md)、[交互](../interaction/ai-guide-interaction.md)与[发布前取证](../quality/ai-ambient-orb-checklist.md)。模型授权受项目既有声明约束。[模型及运行时许可](../../../server/src/web/live2d/THIRD_PARTY_NOTICES.md)

### Android 从系统设置返回

透明 WebView 可能先画出模型，再向 UTS 发出就绪消息。Android 导游启用 Live2D、存在舞台地址且舞台未失败时，WebView 独占人物区域，加载提示也由舞台提供。减动、地址缺失或加载失败时显示原生立绘。页面加载、模型就绪和本轮发声是三个独立事件。收到模型就绪消息时更新形象状态，只有匹配当前播放轮次的发声事件才更新播报状态。

回前台时，通过现有 WebView 查询模型当前状态。查询应可以重复执行，保留当前模型，也不能触发朗读。测试时从系统设置与输入法设置返回，检查连续画面只出现一个人物，并分别确认模型就绪和人物有动作。减动或模型加载失败时，应当看到一张静态立绘。[WebView 通信接口](https://doc.dcloud.net.cn/uni-app-x/component/web-view.html) · [导游实现](../../../visitor-app/pages/ai-guide/index.uvue)

冷启动等宿主页面就绪后挂载人物舞台。若前台连续 6 秒没有收到网页加载或桥消息，清除旧的舞台地址和原生上下文，间隔 250 ms 后按照当前形象重新生成地址并挂载一次。这段间隔让 Vapor 有机会提交视图移除。重试后 20 秒依然没有响应时，释放舞台，恢复立绘并在设置中提供重试。进入后台或卸载时清理等待任务。模型文件已经开始加载时，由 Cubism 舞台报告真实的成功、失败或模型超时。

舞台随服务端静态资源提供同源 DCloud SDK。宿主以字段访问方式读取 WebView 返回的 JSON。即使首次就绪或失败发生在消息桥可用之前，下一次查询仍可取得模型状态。[SDK 来源及许可证](../../../server/src/web/live2d/THIRD_PARTY_NOTICES.md) · [可复跑的消息桥测试](../../../server/scripts/test-live2d-bridge.py)

## 本轮接线

| 音频路径 | 项目实际取数方式 | 降级与验证范围 |
| --- | --- | --- |
| Web 收音 | 复用当前 MediaStream，analyser 每约 80 ms 取一次时域样本，计算 RMS；分析图未接入扬声器。 | 无 Web Audio、上下文挂起、音轨不活跃或 muted 时不向 UI 发布读数。业务录音走原 MediaRecorder。[Web 采样](../../../visitor-app/services/web-audio-meter.js) · [录音器](../../../visitor-app/services/web-recording.js) |
| 微信收音 | 尝试 16 kHz 单声道 PCM、2 KiB 分片。已确认活动的 PCM 帧按带符号 16 位小端计算 RMS。 | 宿主拒绝格式可退回 48 kbps MP3；压缩帧不作 PCM 解释。麦克风真机响度和权限需单列。[微信适配](../../../visitor-app/services/wechat-audio.js) · [页面](../../../visitor-app/pages/ai-guide/index.uvue) |
| 宿主朗读 | Web 解码音频副本为 80 ms 分窗，随 HTMLAudioElement 的 currentTime 取样。其他宿主可使用服务随分段返回的 levels80ms；微信在缺少包络时可旁路解码本段副本。 | 服务的 mock 包络来自实际生成的 WAV，能证明测试音频对应能量。云端 MP3 不自动带该字段。跨域、解码或原生不可观测时依旧通过原播放器发声；不把进度当响度。[播放](../../../visitor-app/services/web-narration.js) · [分窗](../../../visitor-app/services/decoded-levels.js) · [TTS](../../../server/src/services/voice.mjs) |
| Live2D／讯飞 | Live2D 网页从真实播放图取 rms；带本轮 requestId 的事件可更新字幕或口型。讯飞转发带本轮身份的 frame_start/frame_stop。微信形象在有有效播放幅度时可接收 level。 | 讯飞帧开始/结束只证明发声状态。静态立绘、模拟源与商用真人服务的结果分别记录。[Cubism 采样](../../../web/src/lib/live2d/live2dManager.ts) · [讯飞桥](../../../server/src/web/digital-human/app.js) · [状态投影](../../../visitor-app/stores/guide-audio.uts) |
