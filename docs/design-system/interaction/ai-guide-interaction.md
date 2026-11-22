# 导游会话和声音的操作约定

默认进入语音模式，人物、可读状态和单一开始操作先可见。文字提问、历史和资料可在同一会话中访问。数字人不可用或不方便说话时，用户仍能完成景点查询和路线提问。

中央麦克风继承当前话轮语义。空闲可点击开始、再次点击发送，也可按住说话、上滑取消。思考或播报中点击可打断，宿主暂停时可继续。手势按下至释放间若音源自然结束，释放不得开启新的录音。字幕旁的操作显示当前会话支持的命令，页头的历史和字幕行的打字入口各自打开原有面板。[导航操作](../components/navigation.md) · [语音按钮](../../../visitor-app/components/voice-action-button/voice-action-button.uvue)

| 规则 | 实际交互和保护条件 | 复测 |
| --- | --- | --- |
| GUIDE-INT-01 | 支持点击开始、再次点击结束的完整路径。录音开始时显示计时，取消清理临时授权/文件，上传只发生在明确发送后。录音限长以业务配置为准。 | 允许/拒绝、授权等待中取消、收音后取消、系统结束、主动提交及请求失败逐条计数。无障碍用户无需保持按压。[RecorderManager](https://doc.dcloud.net.cn/uni-app-x/api/get-recorder-manager.html) · [球体交互](ai-ambient-orb-interaction.md) |
| GUIDE-INT-02 | 输入模式、建议问题和地图带入问题复用同一问答链路。文字模式不申请麦克风；切换界面不会自行发送草稿，历史读取不触发旧答案再合成。 | 重复点同一建议、切到另一个 tab、返回地图发问；检查服务端收到一份请求、语言及位置正确，客户端出现一份回答。[现有问答入口](../../../visitor-app/pages/ai-guide/index.uvue) |
| GUIDE-INT-03 | 只让当前 owner 持有回答的声音。数字人支持打断时走桥，宿主播放器支持暂停/继续时保存当前段。后续音频到达前先核对当前轮次。 | 在中段暂停、恢复、打断，在第一段加载中打断，再快速提问。不会出现重播上一段、背景说话或云端和本地双声。[InnerAudioContext](https://doc.dcloud.net.cn/uni-app-x/api/create-inner-audio-context.html) · [舞台架构](../engineering/ai-guide-architecture.md) |
| GUIDE-INT-04 | 授权失败指向录音权限或键盘替代，网络失败允许重试，模型失败保持文字问答。字幕、提示和操作使用本机选择的简体、繁体或英语，历史引用沿用原文。 | 模拟断网、跨域音频、初始化失败、取消后的迟到回调。每个错误有明确阶段和可行下一步；仅真实重连显示重连状态。[三语契约](../quality/guide-locale-verification.md) · [Apple Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) |
| GUIDE-INT-05 | 读屏依次接触到导游身份、当前可读字幕/状态、主操作与输入模式。尊重动态偏好、系统声音与用户自动播报选择。 | 大字、灰阶、静音、键盘导航各完成一次开始、取消和文字提问。宿主不支持的 ARIA 属性须用原生可读文本/输入标签补足并分别记录。[Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) · [跨端审查](../engineering/cross-platform-compatibility.md) |
