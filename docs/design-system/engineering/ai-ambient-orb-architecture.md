# 状态球的工程边界

业务控制器 → 当前语音状态与活动音源 → 一个声明式视觉组件。组件不接收音频字节、用户文本、私钥或云会话，不创建录音器、播放器、WebView 或网络请求。实际可用信号见[源端审查](ai-ambient-orb-feasibility.md)。

| 命令语义 | Vue / UTS 等价输入或生命周期 | 调用者应观察到的结果 |
| --- | --- | --- |
| setState | 切换 state 枚举 | 失效旧状态的相位和幅度；含 IDLE 等八态，可显示单独的 RECONNECTING 提示 |
| setAudioLevel | 把当前 owner 的归一化读数赋给 level | 只有采样合法、owner 与轮次正确时才接收；0 为静音，-1 为不可用 |
| setListeningLevel / setSpeakingLevel | 控制器按 LISTENING/SPEAKING 在同一 level 属性中选择录音器或播放器读数 | 两个来源不混合，不同时驱动同一个组件 |
| setReducedMotion | 把页面实际 reducedMotion 绑定给 reduced-motion | 终止装饰动画，输出当前状态的静态图层 |
| pause / resume | active=false/true，并结合 state=PAUSED 描述业务暂停 | 隐藏时不调度。再次活动时只用当前状态；组件的 resume 不会启动媒体 |
| reset | 置 IDLE、level=-1 并清理本轮包络与版本 | 退回可操作待机；无脉冲残留 |
| destroy | 组件卸载钩子和页面关闭 | 清理定时器、监听和引用；取消后的异步回调保持无效 |

UTS 组件以 `state`、`level`、`active`、`size`、`reducedMotion` 接收上述语义，对父组件显式暴露 `reset()`、`pause()` 和 `resume()`。Web 的 visibilitychange 和卸载清理是额外保护。调用 reset 复位其内部相位/包络时，上层若想回到待机也要同时把业务投影改回 IDLE。SG 组件不提供能停止业务音频的命令。[实际组件](../../../visitor-app/components/sg-ai-ambient-orb/sg-ai-ambient-orb.uvue)

导游设置与个人页共用一个持久化偏好。系统要求减动时，界面说明系统原因并保持静态；原生 iOS／Android 在 App 返回前台时刷新。桥异常采用静态保护。微信无已验证系统读取能力，新安装采用轻量状态动效，之后优先之前明确保存的选择。iOS UIKit 值在物理设备上仍待核对。[统一实现](../../../visitor-app/design/motion.uts) · [iOS UTS](../../../visitor-app/uni_modules/scenic-motion-preference/utssdk/app-ios/index.uts)

| 规则 | 适用范围、实现与验证 |
| --- | --- |
| ORB-ENG-01 | 宿主以 state、level、active、size、reduced-motion 作为单一输入。命令式适配若需提供，复用同一路径；由上层执行媒体行为。输入异常需保持静态或无样本，避免无效缩放。[组件规范](../components/ai-ambient-orb.md) · [UTS 边界](component-architecture.md) |
| ORB-ENG-02 | 读取真实 PCM 或已验证的 RMS，记录来源、归一化、所有者、生命周期和不可用值。Web Audio 旁路只复用当前授权/有效音源。分片协议、云回调、跨域媒体均按本轮能力验证，丢弃晚到的其他 requestId；每次暂停、停止与换段复位电平。[Web Audio](https://www.w3.org/TR/webaudio/#AnalyserNode) · [讯飞听写](https://static.xfyun.cn/doc/asr/voicedictation/API.html) |
| ORB-ENG-03 | 对比修订前后同一发布模式的主包和分包字节数；记录运行时依赖、生成素材与许可证。原生构建通过后仍需检查微信画布和两种 App/WebView 舞台的遮挡。每项缺乏实测的能力明确列为待验。[宿主基线](../quality/wechat-followup.md) · [质量清单](../quality/ai-ambient-orb-checklist.md) |
