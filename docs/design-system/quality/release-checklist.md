# 移动端发布核对与交付记录

基线为 6c0035e，工作目录 visitor-app。通过某项需注明平台、构建目标、执行路径与观察结果。模拟数据、未授权传感器和模拟器不能充当真实供应商证据。

## 验收路径

2026-11-22 的 AI 导游重构按[专项交付与设备准备](ai-guide-immersive-verification.md)核验，含最终包体、微信减动设置、Android 录音降级及 H5 声音动态录屏。

| 检查域 | 操作与通过条件 | 记录方式 |
| --- | --- | --- |
| 视觉与导航 | 五页依次打开，检查系统栏、四角安全区、标题、间距、表面、无色选中线索、图片比例、返回顺序和图标。窄/宽屏、长标题及明暗主题重复 | 保存同一运行构建的截图与视口。调色板核对正文 ≥4.5:1；放大文字检查主操作 |
| 触摸与读屏 | 点击按钮四角、拖离、快速连点；键盘与读屏查找语音停止、提交、取消与返回。拖路线另用按钮完成 | 记录实际 tap 区、语义或平台限制；不能只凭属性存在标记已过 |
| Home、Profile | 切换两景区，看地图、照片与列表同步。断网/失败重试。更换语言、减少动态、收藏、足迹、保存数、反馈、登录和取消退出 | 首次启动和恢复已有游客各一次。记录错误、空和零计数的差异 |
| Map、Trip | 切区、搜索、选择/清除、底卡展开/收起、缩放、拖图及定位拒绝。生成→调序→保存→恢复→地图核对节点顺序 | 分别测试手绘和原生引擎、异步切区、后台返回、连续保存。真实定位与模拟位置注明 |
| AI | 输入、授权、拒绝、录音开始/取消/停止发送、等待、分段播报、暂停/继续/停止、切 tab、云桥失效、微信本地形象 | 看事件和请求数；取消/卸载不上传，静音/打断后晚到结果不出声。真实供应商、宿主音频及桩分别记 |
| 动效 | 连按、反向操作、切后台与减少动态四条路径。看贴手性和最后一次输入的终态。测地图滑动、键盘及音频时操作响应 | 某端未测帧时间则标待测；候选 120/200/280/320ms 参数待真机校准 |
| 工程 | 重建各目标，检查日志、无效资源、无效图标、图片来源、包体、文档与 Skill 引用 | 构建成功仅记录该目标的编译结果；源档案校验、发现和实际调用分别入账 |

## 可复跑检查

从仓库根执行：

```powershell
node scripts/design-tokens.mjs --check
python scripts/check-design-system.py --codex
python .agents/skills/motion-design/scripts/verify_upstream.py
git diff --check
```

HBuilderX 导入 visitor-app 后，运行 `cli.exe launch <platform> --project <visitor-app 绝对路径> --compile true`。iOS 设置 `--iosTarget simulator`。H5 实际渲染与交互细节见[浏览器验收](web-verification.md)。鸿蒙按 2026-11-22 用户要求暂停本轮端上测试。

## 阶段记录

| 阶段 | 文件与可交付结果 | 已核对项目与边界 |
| --- | --- | --- |
| 基线 | [审计](../audit/current-mobile-ui-audit.md)；原版首页截图 | 查五个实际入口、共享组件/服务/资源及工具链，基线 H5 编译并显示 |
| 知识引入 | [完整性审计](../audit/skill-integrity-audit.md)、两份 TSV、两个完整动效源档案、[规则索引](../references/source-index.md) | 五个外部仓库固定 SHA。离线检查通过 54 个文件、130 条本地引用；权利不明部分保留引用与原创适配 |
| 项目规则 | [设计系统索引](../README.md)、根 AGENTS.md、.agents/skills 下九个入口 | 基线五项和新增导游四项均通过 quick_validate；skills/list 强制从仓库 cwd 重扫，全部为 repo scope。基线只读调用 maintenance 与 motion；本轮桌面 Codex 两次只读会话实际调用全部四个新 Skill、读取项目说明和源码。[逐项调用记录](../audit/skill-integrity-audit.md) |
| 视觉与组件 | visitor-app/design、uni.scss、theme.json、pages.json、共享组件、[原创插画](../assets/generated-illustrations.md) | 同源生成 Sass、UTS 和导航主题；5 个原创 SVG 生成两主题各两态的 20 张 PNG。AI 与行程功能插画合计 43,254 B，新增空态与错误插画合计 13,730 B |
| 动效与交互 | visitor-app/design/motion.uts、keyboard.uts、[动效规则](../motion/motion-principles.md)与[状态和触控](../interaction/interaction-states.md) | H5 实测减少动态、连续操作、取消录音与打断播报；系统读屏和真机帧时间待验 |
| 五页迁移 | visitor-app/pages 与 stores、[五页设计入口](../README.md)、[行程](travel-page-verification.md)与[导游和地图回归](guide-verification.md) | 浏览器中验证切区、生成→调序→保存→恢复→打开地图、点位→提问、收藏与个人计数。缺凭据时验证云服务降级 |
| 构建与运行 | scripts/verify-visitor-web.py、scripts/check-wechat-package.py、quality/evidence 实际屏幕截图和测量 | 四个目标编译，浏览器、Android 及微信的实测范围列于下表 |
| 交付 | 本记录、[设计系统入口](../README.md)、各平台专项验证记录 | 已复核 Token 同源、离线归档完整性、仓库 Skill 发现、文档路径和微信体积。保留各端独立的待验项 |

## 本轮实测记录

| 环境 | 结果 | 证据与边界 |
| --- | --- | --- |
| H5 | HBuilderX H5 生产构建通过。Chromium 151、WebKit 26.5 分别在 320/390 视口走完五页，开发版与正式静态构建各 20 组页面测量。另测 430px 首页、大号字体持久化与键盘；双引擎走完五个子页，生成十张子页截图 | [H5 截图与复跑命令](web-verification.md)、[本轮双引擎实测 JSON](evidence/home-followup-results.json)。地图/语音与行程的可操作性见下两行 |
| 业务回归 | 本地同仓服务跑通收藏、路线上下移/拖动/保存/恢复、2 个景区、简繁英切换、接口 503 后重试。已保存数、足迹数与收藏数回到 Profile 后可核对 | [行程与个人页测试](travel-page-verification.md)。测试数据存于隔离环境 |
| AI / 地图 | Chromium 合成麦克风录音转换为服务可读 WAV，取消/离页无上传。宿主音频可暂停、续播、打断。点位选择/清除、迟到回调及路线编辑顺序有记录 | [语音、地图和中断实测](guide-verification.md)。讯飞在线会话无商业凭据，走 503 降级，未验真实云端口型 |
| Android | 十页产出 91 份 Vapor 字节码，MuMu Android 12 标准基座实际启动，五个原生 tab 均操作并截屏。英文冷启动、系统暗色切换、回前台、表单读写与三个原生字段的双向标签关联已实测 | [Android 基线](android-verification.md)、[原生模拟器追加验收](android-followup.md)。采集 410 帧，中位数 5 ms、P95 61 ms；需实机复核滑动流畅度、读屏和键盘避让 |
| iOS | Windows 上 iOS Simulator 目标编译通过，十个页面与 61 份字节码均有产物。[最终双端构建与模拟器录音复核](native-final-builds.md) | 未运行 Xcode/iOS Simulator，未验证签名、VoiceOver、真实键盘和物理设备传感器；WebKit 截图按 H5 记账 |
| 微信 | 九个页面均有开发者工具模拟器画面。此前验收首页与行程，本轮以正式 AppID 在本机测试服务上实测地图、AI、个人中心、详情、收藏与记录、登录注册、反馈。九页 WCC/WCSC 共 18 次通过。本地生产主包 2,083,158 B，距 2 MiB 余 13,994 B，四个分包均通过大小检查 | [七页逐项操作与截图](wechat-followup.md) · [当前与历史生产包测量](wechat-verification.md)。手机录音、位置授权、前后台音频、Live2D 性能及微信平台上传包体待真机或平台复核 |
| HarmonyOS | 本轮按用户要求跳过 | 暂停前编译器曾生成中间工程。未对最终工作树启动或验收鸿蒙宿主 |
| 同仓后端 | Node 22.22.2，在隔离副本通过 check、test:auth（6/6）、test:routes、test:voice（含 7 项语言首帧）、test:digital-human、test:profile-avatar | SQLite 测试库与 mock 供应商；数字人脚本使用 SDK/模型静态文件和单测密钥，不代表线上联调 |
| 设计资产与 Skills | 127 个规则 ID、46 组文本对比、20 个导航图标、文档本地引用、Token 生成一致性与两份上游归档通过 | 命令见上。色彩结果对应指定前后景组合；照片文字放于实色说明区域。实测边界保留在各端表中 |

## 可交付与发布条件

### 上轮缺口与本轮交付 · 2026-11-22

| 原要求 | 当前实现边界 | 证据 |
| --- | --- | --- |
| 重要规则逐条溯源 | 组件、交互、参数、语音与动效审查规则已拆出独立 ID，逐项指向上游原始章节或项目契约。生成器与检查器同时校验规则和 Token 的引用 | [规则来源矩阵](../references/rule-provenance.md)、[动效与来源验证](motion-source-verification.md) |
| 五个核心页面与子页统一 Token | 详情、收藏、账号、反馈和数字人宿主已迁移。H5 在两种引擎实际操作了子页输入、失败重试和返回；详情与收藏使用相同的景点、摄影和到访 ID | [子页验证与截图](subpage-verification.md)、[首页与到访测试](home-followup.md) |
| 热门目的地、景区服务和图片资源 | 首页按实际官方路线覆盖次数呈现热门地点；只展示当前景区返回的特色设施。具名实景由两处扩展到七处。空态与错误已接入两张原创插画，加载使用静态骨架。六张详情大图进入景点分包 | [实测与边界](home-followup.md)、[照片来源](../assets/asset-management.md)、[原创状态图](../assets/generated-illustrations.md) |
| 统一动效与跨端无障碍 | 缓动、属性、延迟、时长和过渡配方已生成并用于实际控件；Web 监听系统，Android API 26+ 查询系统动画偏好并在回前台刷新。本轮 iOS 接入 UIKit，微信新装采用轻量动效并恢复用户手动开关；iPhone 系统实读、真机时长和读屏仍需设备复核 | [运行时偏好、宿主限制与测量](motion-source-verification.md) |
| 语音、形象与地图联动 | 七态和宿主朗读可暂停、恢复及打断。现有数字人桥提供打断，供应商未提供可验证的同位置续播事件。地图支持点位与特色设施，取消设施选点后恢复默认图层；已排序路线为站序示意。实际图商定位与商业语音仍待联调 | [状态契约](../pages/ai-guide.md)、[多语言及设施回归](guide-locale-verification.md) |
| 语言与足迹 | 地图与 AI 的界面、状态和权限反馈随简体、繁体、英文切换；文字和录音请求均实测发送对应 locale。景区原始专名按来源保留；本地首帧验证英文 en_us、简繁中文 zh_cn 与旧请求默认值；真实供应商准确率待验。到访、收藏和打开详情的浏览记录分别存储，可单独撤销到访 | [语言与网络请求](guide-locale-verification.md)、[标记与撤销](home-followup.md) |

### 需设备或账号签字的项目

导游页中央麦克风、其他四个系统目的地、键盘与切页释放使用[自适应底栏交付记录](guide-navigation-verification.md)中的当前实现和验收结果。

使用与本次构建相同的源码，在独立测试环境准备一台 iPhone、一台 Android 手机、一台可运行目标 Xcode 的 Mac，以及可访问测试服务的 Wi-Fi 或移动网络。两台手机可兼做微信验收设备。登记系统和微信版本、构建版本、预期操作与观察结果。凭据由环境负责人在对应控制台或服务端注入，交付记录只写能力是否启用。[最终原生构建](native-final-builds.md) · [项目的平台账号与地图配置路径](../../multi-platform-credentials-and-map-keys.md)

| 验收入口 | 负责人需准备什么 | 到场后如何验证 |
| --- | --- | --- |
| iOS 模拟器及 iPhone | Mac 安装兼容的 Xcode、iOS Simulator runtime、HBuilderX 和项目 iOS 工具链。真机配对并信任 Mac，按系统要求开启 Developer Mode。在 Xcode 选择有权使用的 Team 和与工程一致的唯一 Bundle ID，启用自动开发签名，或使用匹配的开发证书、已登记设备和 provisioning profile。个人设备本地开发可用 Apple Account 的 Personal Team；如走 TestFlight／App Store 分发，另需 Apple Developer Program 团队及对应 App Store Connect 权限。 | 先跑模拟器冷启动，再在安装实际包的 iPhone 测刘海/底部安全区、VoiceOver 标签与顺序、系统字号、暗色、真实软键盘、麦克风授权和拒绝、扬声器及前后台音频。在 iPhone 系统切换“减弱动态效果”，前后台重入确认 UIAccessibility 结果及应用开关一致，关闭系统减动后复核应用手动选择。[设备与签名](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices) · [开发者模式](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device) · [会员与分发](https://developer.apple.com/programs/whats-included/) |
| Android 真机 | 可开启 TalkBack、具有实际软键盘、麦克风、扬声器和卫星定位的 Android 手机；用 USB 或无线 ADB 配对，设备接受调试授权。标准调试基座可用于首轮操作。需验正式安装包时准备最终 applicationId、发行签名和对应地图授权；DCloud 云打包另需有权操作该 AppID 的账号。 | 在账号与反馈页逐字段读屏，在软键盘实际展开后滚至提交按钮；测试录音权限拒绝→恢复、精确位置拒绝→恢复。记录地图拖动、长列表和音频切换的真机帧时间。模拟器上的三项字段关联、注册、系统配色及动画设置已有证据。[Android 真机连接](https://developer.android.com/studio/run/device) · [已有测量和标签](android-followup.md) |
| 微信小程序 | 项目正式小程序 AppID 的开发成员在自己的电脑上扫码登录开发者工具，确认可预览与真机调试。由管理员或有开发设置权限的成员核对服务器域名和隐私设置；体验版另给扫码测试者添加体验成员资格。准备装有微信的手机并保留网络、定位、麦克风权限设置入口。 | 用编译所得 mp-weixin 工程预览，从真机进入五个 tab 和四个分包；检查原生 Live2D、登录、反馈、位置、录音上传、来电或切后台后恢复。使用有权限的环境复核平台最终包体，上传、提审、发布按团队另行授权执行。本轮正式 AppID 已登录并完成七页模拟器操作。[微信宿主记录](wechat-followup.md) · [微信网络配置](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html) |
| 腾讯地图与景区现场 | 有权配置腾讯位置服务项目的负责人核对测试 Key 已启用目标地图 SDK、配额可用。Android 绑定实际打包包名，iOS 绑定最终 Bundle ID；H5 按对应授权配置来源域名。微信 map/getLocation 在小程序端使用该 AppID 的隐私申报和位置能力，单独核对 manifest 的 requiredPrivateInfos、scope.userLocation 与平台后台。 | App 在地图筛选中切「导航地图」核对真实底图和点位；再切「手绘导览」检查联动。到景区内已知点分别允许/拒绝定位，核对项目使用的 GCJ-02 坐标、权限反馈和两处景区切换。注册地图账号或开通更多 API 取决于实际使用的图商服务。[腾讯地图 Key](https://lbs.qq.com/mobile/androidMapSDK/developerGuide/getKey) · [项目的位置配置](../../multi-platform-credentials-and-map-keys.md) |
| 讯飞 ASR / TTS | 在测试后端指定 ASR_PROVIDER=xfyun、TTS_PROVIDER=xfyun，提供服务端 XFYUN_APP_ID、XFYUN_API_KEY、XFYUN_API_SECRET，开通流式语音听写及在线语音合成，核对英语/中文识别权限、所选 XFYUN_TTS_VOICE 音色、额度和供应商网络连接。已有同一应用的授权可复用。 | 在真机分别说同一组中英文样句，保存经同意的测试文本、返回文字、首音延迟和是否实际听到播报。核对服务端实际 provider，测试取消、暂停、恢复、打断和网络失败；英语发音由已授权的实际音色验证。本地七组首帧测试已验证 en_us / zh_cn。[听写文档](https://www.xfyun.cn/doc/asr/voicedictation/API.html) · [合成文档](https://www.xfyun.cn/doc/tts/online_tts/API.html) · [项目语言测试](guide-locale-verification.md) |
| 讯飞互动数字人 | 准备具有互动数字人及所选形象、音色授权的测试应用。后端读取 XFYUN_AVATAR_APP_ID、XFYUN_AVATAR_API_KEY、XFYUN_AVATAR_API_SECRET，同一应用已具备该能力时支持回退到通用讯飞凭据。核对 XFYUN_AVATAR_SCENE_ID、XFYUN_AVATAR_SCENE_VERSION、XFYUN_AVATAR_SERVER_URL 与实际开通场景；服务器会话签名使用至少 32 字符的 XFYUN_AVATAR_SESSION_SECRET 或现有受保护的 JWT_SECRET。管理端配置须为 xfyun、online、assetAvailable，并有可用 avatarId 和 vcn。 | App/H5 请求短期会话、载入受控 WebView，由用户实际启动音视频。检查声音、口型、打断、过期重连；云数字人同位置续播须有供应商实际支持。微信另验原生 Live2D 的资源、canvas、前后台和音频。测试报告只记录签发/过期状态。[服务端会话条件](../../../server/src/services/digitalHumanWeb.mjs) |
| 跨设备测试服务 | 部署与游客端**同版**的 server、景区数据、舞台静态资源和 SQLite 测试库。让手机通过可信 HTTPS 访问测试域名，匹配 visitor-app/config/env.uts 的目标。微信后台将真实使用的 API 和资源来源登记为 request、uploadFile 等对应合法域名，发生 downloadFile 调用时登记下载域。用可丢弃的游客账号和测试反馈；真实模型回答另由环境负责人按现有 LLM_PROVIDER、LLM_BASE_URL、LLM_MODEL、LLM_API_KEY 配置已授权的服务。 | 先在手机完成两景区加载、注册/登录/退出、行程保存后重开、收藏/到访/最近浏览、反馈提交，再进行商业语音联调。后端能连通供应商；WebView 能加载本版舞台和 SDK。回环地址仅供本机或已明确设置转发的 Android 调试，不适用于其他实体手机。[服务配置入口](../../../server/src/config.mjs) · [游客端环境选择](../../../visitor-app/config/env.uts) |
| HarmonyOS | 用户本轮暂缓。 | 本轮跳过鸿蒙编译及端测。 |

工程修改覆盖游客端、两个 Android 项目自有 UTS 适配、两套数字人 WebView 宿主、服务端语音 locale 处理、设计知识库、Skills、资源与检查脚本。既有语音请求省略 locale 仍走中文。新舞台资源已加入静态资源许可清单，发布时应与游客端一同更新并重启后端。当前工作区保留正式 API 配置；本轮只运行本地测试服务。
