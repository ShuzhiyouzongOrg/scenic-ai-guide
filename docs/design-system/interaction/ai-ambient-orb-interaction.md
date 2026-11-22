# 语音状态球的交互契约

球的视觉状态来自单次业务回话，音频 owner 和会话标识决定哪些回调仍有效。用户在授权弹窗点同意、网络返回文本、数字人网页 load，分别不等同于录音器 start、音频 playing 和模型 ready。

| 显示状态 | 进入条件 | 操作与退出 |
| --- | --- | --- |
| IDLE | 页面可用，录音与当前回答的播放均已结束 | 点开始或切换文字；既有会话保留 |
| LISTENING | 收到本轮录音器 start，页面可见 | 停止并提问，或取消且丢弃音频 |
| THINKING | 正在授权、识别、请求回答、合成或等待播报确认 | 文字细分实际阶段，阻止同一请求重复提交；可取消的阶段提供取消，晚到结果按操作版本丢弃 |
| SPEAKING | 当前音频 owner 发出 playing 或数字人可信讲话事件 | 显示当前音频段；支持的 owner 可暂停，所有 owner 可打断 |
| PAUSED | 真实暂停或宿主确认暂停 | 从当前段恢复；停止会清后续队列 |
| ERROR | 当前请求、录音或播放失败 | 显示具体失败阶段和合法重试入口，保留可读回答或草稿 |
| DISABLED | 语音能力不可用或尚未完成初始化 | 说明原因，允许进入可用的文字模式 |
| CANCELLED | 用户明确取消当轮录制或有效请求 | 立即失效旧请求，丢弃未提交录音，清除电平，后续可重新提问 |
| RECONNECTING | 现有服务实际报告重新连接 | 弱等待效果，保留消息；从后续成功/失败事件确定终态 |

| 规则 | 适用范围、实现与验证 |
| --- | --- |
| ORB-INT-01 | 默认可点击开始、再点结束；若实现按住录音，提供同等的点击和取消入口。未经开始确认时不宣称收音，owner 不支持暂停时仅提供打断。在拒绝授权、快速连点和切换语言后重放全链路。[录音器](https://doc.dcloud.net.cn/uni-app-x/api/get-recorder-manager.html) · [导游交互](ai-guide-interaction.md) |
| ORB-INT-02 | 从显示切入后台或正文模式时停止装饰和采样；录音取消、释放轨道，依据宿主业务策略停止当前播报。离页后才到达的上传、云端或采样事件无权发布旧状态。回页不会自动录音。[页面生命周期](https://doc.dcloud.net.cn/uni-app-x/page.html) · [应用入口](../../../visitor-app/pages/ai-guide/index.uvue) |
| ORB-INT-03 | 静音、无样本和静态偏好互相独立。缺失测幅不改变录音/播报的真实状态。偏好只影响运动；状态变更由文字告知读屏，对电平每次变化保持安静。[Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) · [Motion](../motion/ai-ambient-orb-motion.md) |
