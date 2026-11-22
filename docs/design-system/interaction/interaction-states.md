# 交互、反馈与恢复

[HIG-02、03、06–09 与 MOT-03–07](../references/source-index.md)用于判断是否可触达、可中止和可恢复。

| ID 与状态 | 进入条件 | 界面、退出和检查 | 原始出处 |
| --- | --- | --- | --- |
| INT-01 默认/按下 | 有可执行目标，触点位于热区 | 文案用动词，44×44 以上，触点移出或取消恢复；快速点击相邻操作检查不会串到另一项 | [HIG buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) |
| INT-02 已选 | 业务 id 已提交到选择状态 | 勾选、编号或明确文字与色彩一致；地图和列表复用同一 id。取消后删掉高亮与对应操作 | [HIG focus-and-selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection) |
| INT-03 禁用 | 前置输入不全、正在保存、引擎不支持 | 保留原因或替代入口，业务处理函数同时阻止触发。颜色降低不能替代事件拦截 | [HIG buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) |
| INT-04 工作中/可中断 | SDK 已开始或请求已发出 | 就近给“正在识别/正在保存”等单一说明。取消录音和停止并发送分开。多次触发不得多次写入 | [HIG progress-indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) |
| INT-05 成功 | 服务确认或本地存储已写入 | 更新列表、计数或选中标识，必要时配短 toast。立即返回再进入，证实状态一致 | [HIG feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) |
| INT-06 空/失败/过期 | 成功但列表空，或请求失败，或旧结果晚到 | 空态给生成或浏览入口。失败保留草稿/旧内容与重试。切景区或离页后旧响应不覆盖新状态 | [HIG feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) |
| INT-07 权限拒绝 | 麦克风/相册/定位回调失败 | 指明是哪项权限；保留文字输入、手动选点或默认头像。用户主动重试时再次请求 | [HIG privacy](https://developer.apple.com/design/human-interface-guidelines/privacy) |
| INT-08 破坏性选择 | 清空历史、退出会话 | 系统对话框指明影响和动作，取消保留原数据。退出不抹除本地游客足迹 | [HIG alerts](https://developer.apple.com/design/human-interface-guidelines/alerts) |

**INT-09**　触摸冲突按归属处理：拖动把手只改变当前节点，地图画布接平移/缩放，底卡接内部滚动，行内动作不触发整卡跳转。滚动期间不强制抢焦点。输入、拒绝权限、请求超时、后台回来、慢网连点与字体放大都要走一遍。系统返回、按钮和读屏路径应能获得与手势相同的结果。 [HIG Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)
