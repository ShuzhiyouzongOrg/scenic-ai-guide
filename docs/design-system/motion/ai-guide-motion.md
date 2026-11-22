# 导游舞台、字幕与输入的动效

导游模型由 SDK 绘制。能量球是另一个具有独立静态模式的轻量视觉反馈。普通界面使用项目[动效 Token](motion-tokens.md)，字幕跟随真实音频分段。

中央目的地和语音操作在进出导游时共用同一格。保持其他四项目的地的图形与文字静止。允许减少动态直接显示目标形态；录音计时和当前话轮的文字反馈始终可读。[导航动作与验收](../components/navigation.md)

| 规则 | 如何实现 | 何时停止，如何检验 |
| --- | --- | --- |
| GUIDE-MOT-01 | 进入页面以稳定占位接收舞台。等待模型和纹理/视频就绪后呈现角色；加载、重连、失败均保留舞台高度及文字。跨模式切换只切必要内容。 | 避免连续整屏推拉、常驻粒子或重复弹簧。重复切页检查微信画布缓冲与槽尺寸，WebView 的网页 load 不可当作模型成功。[Apple Motion](https://developer.apple.com/design/human-interface-guidelines/motion) · [已有舞台验证](../quality/wechat-followup.md) |
| GUIDE-MOT-02 | 获得播放开始时更新当前段；暂停保持相同段，恢复不回头，结束转回可读回答或待机提示。朗读、流式回答和 TTS 合成分别处理。 | 按音频段交接，不用逐字打字机模拟流式识别、字级字幕或口型。关自动播报后仍显示完整文字和来源。[音频事件](https://doc.dcloud.net.cn/uni-app-x/api/create-inner-audio-context.html) · [工程职责](../engineering/ai-guide-architecture.md) |
| GUIDE-MOT-03 | 舞台关闭或减少动态时隐藏/冻结高成本绘制，取该角色静态立绘。能量球接受同一偏好及本机保存的偏好；微信新装默认为轻量动效，系统强制减动时所有手动入口遵守静态结果。 | 切减动时不会二次请求、重复发言、闪白或模拟音量；再恢复只恢复允许的视觉。分别记录 H5、原生、微信行为。[减动实现](../../../visitor-app/design/motion.uts) · [球体配方](ai-ambient-orb-motion.md) |
| GUIDE-MOT-04 | 用户按下麦克风时先有瞬时触摸反馈，业务状态在录音确认后切换；快速取消时旧事件不得改变当前图形。 | 高并发返回、网络超时、重复点按、软键盘显隐期间都可中断；操作目标维持原位，暂停/停止后无残留讲话动作。[项目动效源](../references/source-index.md) · [语音状态机](../interaction/ai-ambient-orb-interaction.md) |
