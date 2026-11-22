# Android 补充验收

2026-11-22，在 MuMu Android 12、1080×1920、480dpi 的 DCloud 标准 uni-app x 基座中运行游客端。HBuilderX 5.24 的 Vite/UTS 工具链编译 10 页 Vapor 字节码。将源码复制到临时目录，只在副本把 API 指到 127.0.0.1:5178，通过 adb reverse 访问同仓内存测试服务。使用调试应用的 run-as 安装其 www 构建产物，核对已安装 app-service.js 与本机构建 SHA-256 一致。截图取自模拟器合成画面，等比缩到 405×720。[原生采样记录](evidence/android-followup-results.json)

| 原生操作 | 观察与结果 |
| --- | --- |
| 首页→热门目的地→景点 | 灵山首页正常显示目的地实景和两张功能插画。滚动后可见官方路线入选次数，点击九龙灌浴进入 LS-006，详情加载子包 pages/spot/static/jiulong.webp，照片与标题一致。[首页](evidence/android-followup-home.webp) · [热门目的地](evidence/android-followup-highlights.webp) · [详情实景](evidence/android-followup-spot.webp) |
| 收藏、浏览与手动到访 | 从详情收藏后，经原生返回和个人中心打开列表。本次在深色英文模式手动标记已到访，收藏、到访和最近浏览分别显示 1、1、2 条。再次进入同一详情撤销到访及收藏，个人页相应计数回到 0。记录与位置权限各自独立。[最新详情](evidence/android-followup-visit-marked.webp) · [三类本机记录](evidence/android-followup-visit-list.webp) |
| 原生账号和反馈 | 登录页空用户名显示纠正提示，Android EditText 可输入，密码为掩码。初测发现 Vapor 原生输入层无法从页面 CSS 变量获取前景色，改为向表单输入节点绑定 Token 解析后的实际颜色，重测用户名和反馈意见可见。2 分反馈需补充意见，输入「Local test only」并提交到回环后端，返回个人中心。[登录](evidence/android-followup-account.webp) · [输入后](evidence/android-followup-account-fields.webp) · [深色反馈](evidence/android-followup-feedback-fields.webp) |
| 英文地图、AI 和录音操作 | 从「我的」在系统选择器选 English 后，地图的 Locate、Filters、Places 及操作文案变化，AI 显示英文输入和播报动作，保留真实地名及历史问答原文。模拟器点击 Record，出现计时、Cancel recording 和 Send audio，随后取消。测试前录音权限为拒绝，模拟器宿主期间授予，采集后恢复拒绝；此轮没有向识别服务提交录音。[英文地图](evidence/android-followup-map-en.webp) · [英文 AI](evidence/android-followup-ai-en.webp) |

## 渲染性能、可访问性和键盘

在首页重置进程的 dumpsys gfxinfo 计数后，切系统暗色、滚动热门地点、进详情、标记与撤销、进入收藏和反馈并编辑。Skia OpenGL 共渲染 410 帧，帧时间 P50 5ms、P90 26ms、P95 61ms、P99 150ms。Android 同时报告 Janky frames 0 和 legacy 103（25.12%）。此统计包含页面打开、系统主题切换与测试交互，长尾超过常用的 16.7ms 帧预算。模拟器的整段结果不能给出某一动效或物理 GPU 的稳定帧率。[原始计数](evidence/android-followup-results.json)

首次检查时 Android 的服务清单中有两个无障碍服务，均不是 TalkBack，已启用列表为空。UIAutomator 在反馈页读到 44 个节点，焦点位于带有测试文本的 android.widget.EditText。当时控件的 content-desc 为空，Android 编译器也提示多个 Web ARIA 属性不受支持。需要安装 TalkBack 的设备逐项验证标签、读屏顺序及非文本控件，后续原生标签关联结果见下节。

测试中系统 IME 授予输入焦点，dumpsys input_method 返回 ADJUST_RESIZE 和 mInputShown=true；该模拟器的搜狗 IME 以主机输入，IME 帧为 [0,1920][1080,1920]，高度 0。已观察输入、滚动、返回和提交，正高度软键盘的真实遮挡及避让仍需换用触屏设备或可显示软键盘的宿主。设备的 ime list -a -s 仅列出搜狗输入法，未安装 LatinIME；允许实体键盘同时显示 IME 的设置已为 1。

## 暗色冷启动与原生标签

第一次在系统已处于暗色时重启基座，状态栏和标签栏采用暗色，首页正文却为浅色。按宿主 appTheme=auto 读取 osTheme，并在应用恢复时重新取色后，重新编译、安装、核对设备端 SHA。暗色冷启动时状态栏、正文、底栏均为暗色。再次切换系统配色、按系统 Home 键并回到前台后，页面与五个原生英文标签保持一致。测试结束恢复系统原来的浅色模式、应用简体中文及首页。[冷启动](evidence/android-followup-tab-locale-relaunch.webp) · [切换暗色](evidence/android-followup-tab-locale-theme.webp) · [恢复前台](evidence/android-followup-tab-locale-resume.webp)

本轮范围包括标准基座、原生页面和本机服务。物理设备的 TalkBack、正高度软键盘、麦克风声音质量和商业数字人会话各自需要对应环境。

## 原生字段标签

账号和反馈使用已有平台输入控件。Android Vapor 5.24 会忽略网页 ARIA 声明，于是为用户名、密码和意见各保留一个可识别的可见标签容器。在页面 onReady 时通过项目自有 UTS 模块 scenic-form-label 取得原生 EditText 和标签 View，给无 ID 的字段生成 Android View ID，在标签上调用 setLabelFor。标签名称使用页面当前语言。编辑控件保留原生输入值、光标、掩码和焦点行为。Web 继续给其实际 HTML 控件关联可见标签。该模块只进入 APP-ANDROID，使用系统 API，未引入第三方库或授权资源，本次调试 classes.dex 为 2,380 字节。[DCloud 的原生 View 接口](https://doc.dcloud.net.cn/uni-app-x/api/dom/unielement.html#getandroidview) · [Android View 的标签关系](https://developer.android.com/reference/android/view/View#setLabelFor(int))

在真实基座切入账号和反馈页，用本地临时 Android Instrumentation 调用 getUiAutomation，并从活动窗口遍历 AccessibilityNodeInfo。探针只查询类名、正反向关联及标签的描述，不读取编辑框内容。两页都观测到以下设备返回；测试结束卸载临时探针。另以一次性测试账号在模拟器走完注册、自动登录、返回个人中心和退出流程。两个浏览器引擎重跑子页交互均通过。[原生节点结果](evidence/android-followup-results.json) · [输入与密码掩码](evidence/android-followup-account-fields.webp) · [注册后的个人中心](evidence/android-followup-account-signed-in.webp) · [H5 验收](subpage-verification.md)

| 页面 | EditText.getLabeledBy() 返回的标签描述 | 标签的 getLabelFor() |
| --- | --- | --- |
| 注册／登录 | 用户名 | android.widget.EditText |
| 注册／登录 | 密码 | android.widget.EditText |
| 反馈 | 意见或建议 | android.widget.EditText |

该测试读取 Android 的可访问性节点。模拟器未安装 TalkBack，仍需验证真实朗读、输入法动作及读屏焦点顺序。
