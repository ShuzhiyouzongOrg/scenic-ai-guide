# AI 导游自适应底栏交付记录

2026-11-22。截图中的旧布局在系统五栏上方再放一整排打字、录音与记录。现在同一块屏幕底部只保留一排。进入 AI 导游后，导航中心成为 56px 绿色语音按钮。历史在标题右侧，文字入口在当前回答的字幕标题行，手指离开主要操作时仍能看到人物、光球和正在讲解的内容。

## 工程改动

| 位置 | 改动与保留的行为 |
| --- | --- |
| [页面](../../../visitor-app/pages/ai-guide/index.uvue) 与 [字幕](../../../visitor-app/components/guide-subtitle-panel/guide-subtitle-panel.uvue) | 记录和文字使用原来的历史与输入抽屉。人物舞台高度取可用窗口的 44%，按 192–360px 限定。朗读、暂停、继续、取消、来源、完整回答和清除历史均沿用已有入口或面板逻辑。 |
| [根页布局](../../../visitor-app/design/layout.uts) 与 [导航组件](../../../visitor-app/components/guide-bottom-navigation/guide-bottom-navigation.uvue) | 保留 pages.json 的五个 Tab 和已有地图、详情、行程导航。导游页确认 hideTabBar 成功才安装自绘栏，离开时走 switchTab。旧 hide 回调通过调用序号失效。若宿主拒绝隐藏，就保留系统栏，并在字幕附近提供一个可用的麦克风。 |
| [语音按钮](../../../visitor-app/components/voice-action-button/voice-action-button.uvue) | 取代旧的三按钮组件，接收页面当前的交互态、权限请求、播放所有者和可选真实电平。手势记录按下时的动作，图形从麦克风切换为停止时保留同一个触摸目标。按钮只发操作事件，采集、请求、播放与资源回收仍由既有控制器执行。 |
| [抽屉](../../../visitor-app/components/guide-sheet/guide-sheet.uvue) 与 [键盘焦点](../../../visitor-app/services/guide-sheet-focus.js) | 面板遮盖底栏并暂时停用麦克风。App 监听系统键盘高度，扣除宿主已上推的距离后抬升面板；原生输入框使用已解析的主题文字色和占位色。H5 根据 visualViewport 的实际遮挡调整面板，关闭时释放监听并恢复焦点。 |
| [布局 Token](../../../visitor-app/design/tokens.json)、[生成器](../../../scripts/design-tokens.mjs)、[导航译文](../../../visitor-app/stores/locale.uts) 与 [语音界面译文](../../../visitor-app/design/guide-locale.uts) | 自绘栏复用既有四个目的地的图标、三语目的地名和主题，系统底部安全区单独计算。中心交叉淡化与缩放 200ms，减动时立即切换。无新增运行时依赖。 |

## 麦克风与光球

| 页面实际状态 | 中心入口及可执行动作 |
| --- | --- |
| 等待提问 | 点一次开始收音；长按 350ms 后进入按住说话。初次欢迎区提示两种用法。 |
| 授权或开启采集中 | 再次操作可取消；松手、打开弹层或离页，使尚未返回的授权结果失效。 |
| 正在录音 | 开始回调后显示方形停止图标、舞台计时和聆听状态。短点启动时再点发送；长按启动时松手发送、向上移出 44px 取消。收到实测幅度时，按钮光圈和舞台光球共用同一音源数据。 |
| 正在识别、生成或准备播报 | 中心为三点和可读的处理状态。按中心打断当前轮次；同一手势只触发一次操作。 |
| 播报或暂停 | 播放回调决定播报态，点中心停止。宿主播放器暂停后可在原位置继续；数字人使用其桥实际提供的打断操作。 |
| 权限、识别或网络异常 | 字幕附近展示错误原因，中央按钮允许重试；文字入口与历史仍可访问。 |

原生 Tab 项的图标、文字与选中态可配置。录音还需要按下、移动、松开和取消，因而只在已选中的导游页使用页面控件。切页前先取消录音或打断播放，后台与卸载继续走原有清理路径。[本地导航规范](../components/navigation.md) · [DCloud TabBar API](https://doc.dcloud.net.cn/uni-app-x/api/set-tab-bar.html)

针对“录音时光球几乎不动”的反馈，复测了中央按钮接入后的页面。390px 宽的 Chromium 中，76px 珠体接受可控音源经过实际 Web Audio 分析得到的响度。静音到轻声时有 1,534 / 5,776 个像素的通道变化超过 8 / 255，轻声到中等输入时有 2,887 个，开启减动后观察窗口内为 0。微信模拟器实看播报与按钮共同切换，真实手机麦克风的幅度还需实机采样。[最终构建的测幅结果](evidence/guide-navigation/h5-ime-rebuild.json) · [微信播报帧](evidence/guide-navigation/wechat-speaking.webp)

## 实际获得的空间

在 390×844 的 Chromium 中，对旧版和新版生产 H5 使用相同的视口与本机服务。原打字、语音、记录区独占 105px。取消这一排并给中央麦克风留出 8px 上方触区后，导游可滚动正文由 574px 增至 671px，实际多出 **97px**。其中人物与景区舞台由 308px 增至 360px。四个普通目的地的图标、文字和有色轨道仍在原位置。[同视口几何记录](evidence/guide-navigation/content-height.json) · [改造前后实拍对照](evidence/guide-navigation/before-after.webp)

## 已运行的验收

- **H5。** Chromium 与 WebKit 的 390px 浅色中文、320px 暗色英文均完成五页往返，四个普通入口的图标和标签与各自系统栏的矩形偏差为 0 CSS px。最终 390px 视口两引擎冷启动往返共取 192 帧，双栏与空栏均为 0 帧。点击、长按发送、上滑取消、等待权限时松手、权限拒绝、暂停、继续、打断、文字提交、历史读取、切走释放与两种导航失败恢复均有记录。Chromium 的收音使用可控音源经过真实媒体链。Windows WebKit 实测现有录音 API 不可用，文字提问可用。[完整浏览器报告](guide-navigation-web-verification.md) · [录音手势结果](evidence/guide-navigation/button-results.json)

- **微信。** 在已登录的开发者工具 Stable 1.06.2303220、基础库 3.18.0、iPhone 12/13 Pro 模拟器中实看首页→导游、导游→行程→导游。先用截图发现四个普通图标偏小、标签约高 4 个截图像素，按微信系统项校准至 27px 图标后复测。最终地图、行程、我的标签上缘均与系统栏同为 y=784，四个图标上缘与系统项相差不超过一个截图像素。人物加载出 Cubism 首个纹理帧；从字幕旁输入“灵山大佛在哪里？”并提交后，舞台显示正在讲解，中央麦克风切换为停止，顶部历史抽屉同时保留原来的问答和这条新问答。开发者工具仍提示 Cubism 的 Node 分支引用 fs/path。正式主包 2,063,999 B，距 2 MiB 上限余 33,153 B，九路由的 WCC 与 WCSC 均通过。测试问答只写入本机验收会话。[导游实拍](evidence/guide-navigation/wechat-guide.webp) · [系统首页](evidence/guide-navigation/wechat-home.webp) · [像素测量](evidence/guide-navigation/wechat-alignment.json) · [文字输入](evidence/guide-navigation/wechat-text.webp) · [播报](evidence/guide-navigation/wechat-speaking.webp) · [历史](evidence/guide-navigation/wechat-history.webp)
- **工程。** HBuilderX 5.24 分别完成 Web、微信小程序、Android 和 iOS 的编译。Token 生成校验与离线上游完整性通过，Codex 能列出 9 个项目 Skills。原生的 UTS 编译覆盖 10 个页面。[构建与包体](evidence/guide-tab-navigation-builds.json)

- **Android。** MuMu Android 12 中分别从导游切至首页、地图、行程、我的再返回。点击中央按钮启动平台录音，计时出现；录音中切地图与长按上滑均取消采集。432px 宽截图上，四个普通图标的横向中心相对原生栏最多相差 0.5px，纵向图标上缘有 1–2px 的光栅差异。[导航与手势数据](evidence/guide-tab-android.json) · [正在聆听](evidence/guide-tab-android-listening.webp) · [离页后的地图](evidence/guide-tab-android-map.webp)
- **键盘。** MuMu 自带输入法向系统报告的可见窗口高度为零。为检验实际遮挡，在模拟器临时启用仅对本测试基座显示的 Android 输入法，获得 226dp 高的真实 IME 窗口。修正整面板避让和正文颜色后，输入的 Scenic 清晰可见，完整发送按钮距键盘上缘约 28dp。保持键盘展开直接点发送，本机问答成功。已还原默认输入法、启用列表与原基座，并卸载临时输入法。微信最终包也实际输入、提交了“景区适合在哪里拍照？”。H5 最终版提交文字并读取实际前景色，正文浅色对比度 12.97∶1，暗色 10.61∶1。[Android 输入状态](evidence/guide-tab-android-ime-visible.webp) · [Android 系统窗口与恢复记录](evidence/guide-tab-android-ime.json) · [H5 最终构建](evidence/guide-navigation/h5-ime-rebuild.json)

**底栏验收时发现的数字人重影。** 当时的 MuMu 构建从 Android 系统设置返回后，静态立绘与 Live2D 偶尔同时可见。一次观察到发送后 26 秒均为单人，另两次拍到了双层。后续将此问题独立修复并按冷启动、连续返回及键盘发送重新取证。[修复专项记录](android-live2d-resume.md) · [原始时序](evidence/guide-tab-android-avatar-return.json)

## 待真机与账号验收

| 需要准备 | 对应验收 |
| --- | --- |
| Mac、Xcode、签名开发包或包含项目插件的 iOS 自定义基座，以及带 Home Indicator 的 iPhone | iOS 原生 Vapor 已编译。用设备检查底部手势区、VoiceOver 焦点、中文输入法候选栏、真实麦克风权限与系统中断。原生编译器对部分视图上的 ARIA 属性有警告，读屏名称要由设备确认。 |
| 带麦克风和扬声器的 Android 手机，允许 ADB 调试并安装同版基座 | 对比厂商手势导航与三键模式，测试 TalkBack、系统软键盘、真实采集、响度及耳机/来电抢占。 |
| 装有微信的手机、小程序测试成员权限、手机可达的 HTTPS 测试后端与已配置的合法域名 | 复核真机录音权限、实际 PCM 电平与光球变化、微信软键盘和 Home Indicator。开发者工具验收使用已登录的项目。 |
| 已开通并有额度的讯飞 ASR、TTS、数字人形象和音色；若验真实在线回答，配置已有 LLM 服务 | 在测试后端注入凭据，完成真人提问、实际播报、嘴型及打断，记录首个识别结果、首音和中断响应。 |

鸿蒙按本轮约定暂缓，无需开启 Hyper-V。设备与服务端配置明细见[发布核对表](release-checklist.md)。
