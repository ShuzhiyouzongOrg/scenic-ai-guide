# 五个游客子页的 H5 复核

2026-11-22 使用 HBuilderX 5.24、uni-app x H5、Vite 5.2.8 运行改造后的实际分包。Chromium 使用 320×690、深色、英文、大号字体；Windows WebKit 使用 390×844、浅色、繁体中文、标准字体。两组均开启减少动态效果。共采集十张页面截图。操作系统原生导航和读屏的验收范围见文末。[交互、网络状态与测量记录](evidence/subpages-results.json)

| 页面 | 实际场景与结果 | 截图 |
| --- | --- | --- |
| 游客账号 | 从「我的」进入。空用户名和短密码分别显示就地纠正提示。键盘切换注册／登录。模拟 503 后输入仍在，通过本地真实注册 201、登录 200 及 /me 200，返回个人中心看到退出操作。密码输入保持掩码。 | [深色注册](evidence/subpage-auth-320-dark.png) · [浅色登录](evidence/subpage-auth-390-light.png) |
| 意见反馈 | 以键盘选择 2 分，空意见拦截提交。输入后模拟 503，屏内提示及草稿仍在；重试由回环服务接收评分和意见，返回 201 后回到「我的」。窄屏大字的五个选项可以换行。 | [深色失败与草稿](evidence/subpage-feedback-320-dark.png) · [浅色评分](evidence/subpage-feedback-390-light.png) |
| 景点详情 | 灵山 LS-006 返回九龙灌浴资料和项目已授权照片。收藏、取消和跳转地图均可操作。断网模拟后点击重试恢复真实内容；未知 ID 返回可打开地图的缺省状态。类别根据界面语言显示，正文及地名沿用服务提供的原文。 | [深色已收藏](evidence/subpage-spot-320-dark.png) · [浅色详情](evidence/subpage-spot-390-light.png) |
| 收藏与足迹 | 初次为空；从详情收藏后，列表和浏览历史显示同一地点。由收藏进入详情并取消收藏，返回时收藏为空，浏览记录仍在。列表取数失败可重试。本次初测记录的是最近浏览。随后增加的手动到访与历史兼容验证见[首页与到访复测](home-followup.md)。 | [深色有记录](evidence/subpage-favorites-320-dark.png) · [浅色收藏为空](evidence/subpage-favorites-390-light.png) |
| 数字人宿主页 | 缺失会话链接显示返回地图动作。以当前项目配置的 API 域和后端已有的 /digital-human/?session=… 路径打开本地受控测试文档，iframe 加载成功。另一轮让文档一直未返回，20 秒后显示重试，键盘重连后文档加载、等待提示消失。宿主保留原 web-view 消息、内联媒体及原生返回机制。 | [深色会话失效](evidence/subpage-digital-human-320-dark.png) · [浅色会话失效](evidence/subpage-digital-human-390-light.png) |

## 设置与复现

1. 按[浏览器验收的本地启动步骤](web-verification.md)准备游客端临时副本与回环 API，本轮端口分别为 5163 和 5178。API 使用同仓 Node 路由、景区数据和内存 SQLite。用独立浏览器上下文把正式域名重写到该回环地址，拦截其余公网流量。注册使用一次性测试账号，反馈使用测试意见。
2. 在 320 宽上下文将系统配色设为深色，在「我的」选 English、大号字体。依次从个人中心打开账号、反馈、收藏。从景点详情使用收藏与地图操作。检查表中负向路径时，仅将该目标请求暂时改为 503，恢复后使用页面上的重试或提交入口。390 宽上下文改用繁中和标准字号，重新打开各页。
3. 有标准页头的页面实测标题为 40px／32px；五页深／浅背景分别为 RGB(17,26,22) 和 RGB(245,246,241)。十张截图的页面宽度均与视口相符，屏内已挂载并有尺寸的操作组件都达到 44×44px。检查了真实 input 和 textarea 的无障碍树名称、输入和键盘激活；文本框均落在卡片边界内。两个引擎的页面未捕获脚本异常。
4. 数字人成功分支使用本地可控 HTML 验证宿主挂载和载入事件。供应商授权、有效短期会话、视频、声音、实际数字人回答和 ArkWeb 的可恢复子资源错误仍需在对应设备与服务联调。本页仅在非微信分包中存在，微信数字人沿用原生组件。该次 H5 证明范围不含原生读屏、键盘避让或物理设备 GPU 性能。

## 修改范围

游客端修改集中在 pages/spot、pages/favorites、pages/auth、pages/feedback、pages/digital-human。表单复用 design/keyboard.uts 的 Web 字段命名辅助，Android 使用项目自有 scenic-form-label 模块关联原生可见标签与输入；原生导航配色沿用 pages.json 的全局主题。页面复用已有组件与资源，沿用账号、收藏、足迹、反馈与数字人会话的数据接口。

原生端三项标签关系、暗色冷启、注册和键盘观测见 [Android 补充验收](android-followup.md)。

## 密码字段的跨端要求

登录和注册共用一个原生 input，使用 uni-app x 的布尔属性 `:password="true"`。密码安全键盘和键盘类型属于独立设置。微信编译输出须包含 `password="{{true}}"`。每次修改都要在开发者工具中输入临时测试字符并切换登录与注册，观察历史字符是否保持掩码，核对校验及提交。可留存空表单或用户名为空且密码全掩码的测试画面。[DCloud 输入组件](https://doc.dcloud.net.cn/uni-app-x/component/input.html) · [微信 input](https://developers.weixin.qq.com/miniprogram/dev/component/input.html)

2026-11-22 的首轮微信宿主观察发现，旧 WXML 仅设置 type，输入以明文显示。修正后独立编译器生成静态布尔掩码，微信官方 WCC 与 WCSC 均通过。最终生产主包 2,083,158 B，距 2 MiB 余 13,994 B，账号分包 8,339 B。H5 Chromium 与 WebKit 均确认实际 HTML 控件为 password 类型，内存测试串可输入且不出现在页面可见文本中。微信模拟器 WeChatLib 3.18.0 重编后，在注册模式输入 11 个独立测试字符，全部显示圆点。切换至登录时输入值仍被完整掩码。[登录模式宿主截图](evidence/wechat-host-auth-masked.webp) · [微信实际页面验收](wechat-followup.md)
