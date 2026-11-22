# 微信编译与模拟器追加验证

2026-11-22，Windows，DCloud HBuilderX 5.24，微信开发者工具 Stable 1.06.2303220。追加的宿主运行检查针对地图、AI 导游、个人中心和四个微信子包。最终生产目录的编译检查覆盖全部九页。首页和行程此前的游客模拟器截图另有记录。[前一次宿主实测](wechat-verification.md)

[本轮七页操作、截图和复测结果](#七页宿主记录)使用已授权的正式 AppID 和本机隔离服务。下文先保留早期游客副本的编译、访问限制与诊断。

## 编译与本地数据

从当前 `visitor-app` 建立独立副本，使用 DCloud 内置 Vite 执行 `build -p mp-weixin`，得到 `DONE Build complete`。仅在测试副本使用本机 API、游客 AppID 和可用模拟器基础库设置。输出 `app.json` 注册了五个标签页以及 spot、auth、favorites、feedback 四个分包。独立数字人 WebView 是其他平台的子页；此端的 AI 页注册原生 `scenic-live2d`。

最终测量从原工作区生成全新的生产目录，保留项目本身的 AppID 和服务地址。核对生成的语言表含英文收音说明及大字建议标签，AI 页注册原生 Live2D，其他端的全屏数字人舞台排除。再用微信开发者工具安装包自带的 WCC、WCSC 分别编译以下九页，共 18 次。输入包含页面、递归解析 `usingComponents` 得到的自定义组件、模板引用的 `common/uniView.wxs` 及样式导入文件。每个命令都以 0 退出并产生非空结果。表中为密码和 Live2D 修正后这一版生产目录的编译器输出字节数，单位 B。最终生产主包为 2,083,158 B，距 2 MiB 限额余 13,994 B，账号分包为 8,339 B。

| 页面 | WCC 模板输出 | WCSC 样式输出 |
| --- | ---: | ---: |
| 首页 | 79,267 | 5,771 |
| 行程 | 77,394 | 6,003 |
| 地图 | 76,683 | 7,302 |
| AI 导游 | 67,480 | 8,398 |
| 个人中心 | 69,402 | 5,452 |
| 景点／设施详情 | 65,909 | 4,853 |
| 登录与注册 | 59,976 | 5,099 |
| 收藏与最近浏览 | 67,952 | 4,684 |
| 反馈 | 59,394 | 5,278 |

直接向测试副本指向的本机内存 API 发起四个只读请求。灵山和拈花湾的 `GET /api/map-guide/bootstrap` 分别返回 HTTP 200、241,922 B 和 HTTP 200、201,256 B；灵山 `GET /api/map-guide/spots` 返回 HTTP 200、141,935 B；`GET /api/digital-human/config` 返回 HTTP 200、717 B。四个响应均含 success、data、meta。这些是独立 HTTP 检查，微信小程序的域名白名单和网络权限仍需在宿主验证。

## 官方自动化接口

原工具实例已有 HTTP 服务。官方 CLI 指定不同端口时返回需要先重启现有 IDE。为保留用户已经停止控制的窗口，改用位于临时路径的独立开发者工具和独立游客配置，在一个非活动 Windows 桌面启动。验证本次 IDE HTTP 监听进程属于临时工具实例后，才对该游客副本执行自动化。运行结束后关闭该测试进程组。

| 操作 | 实际响应 |
| --- | --- |
| 官方 CLI `auto --project <guest> --auto-port 19631 --port <独立实例端口>` | CLI 返回码 0，输出 `Using AppID: touristappid` 和 `√ auto` |
| `miniprogram-automator` 0.13.0 连接本机游客实例 | WebSocket 成功连接，尝试 `switchTab('/pages/profile/index')` 后 4.4 秒未收到页面对象 |
| 重新启动测试实例，先等初始化，再读取当前路由 | 新实例 CLI 成功并再次连接 WebSocket，额外等 6 秒，再调用只读 `currentPage()`，15 秒内仍未返回 |
| 独立实例诊断 | 开发者工具日志同时记录 `41001`、`access_token missing`、`login expired`、`no userinfo`。这些日志未给出页面 JS 堆栈，不能据此确定某个组件出错 |

本次有官方编译输出、IDE 游客初始化与 WebSocket 握手证据；未能从微信宿主取得七个待验页面的路由、组件树或截图。地图、AI、个人和四个子页的模拟器视觉与交互仍待核验，未执行登录、预览或上传。微信真机的授权、音频、原生地图和 Live2D 也需另验。[发布核对表](release-checklist.md)

## 正式 AppID 的本机模拟器验收 · 2026-11-22

本轮导入目录为 `%TEMP%\scenic-wx-seven-acceptance\mp-project`。已比对工作区与临时编译输入的 395 个文件，仅 `config/env.uts` 有差异。HBuilderX 5.24 按微信 VDOM 目标编译，生成的 API 配置只返回 `http://127.0.0.1:5178`，编译出的 JS 中未检出生产 API 域名。导入项目的 AppID 与正式工程相符。CLI 已登录且项目权限校验成功，开发者工具完成信任确认后实际运行了项目。微信开发者工具版本为 1.06.2303220，模拟器机型 iPhone 12/13 Pro，显示比例 79%。项目配置的基础库为 3.7.1，本次宿主显示 WeChatLib 3.18.0。

最终宿主复测使用修复后的构建。除本机 QA 配置外，临时项目和最终生产目录的其余 283 个产物文件已逐字节比对一致。

### 后端隔离预检

本机服务监听回环地址，使用内存数据库，LLM、ASR、TTS 均为 mock。健康检查和灵山景点列表返回 HTTP 200，列表含 218 条景点及详情样本 `LS-006`。通过同一回环 API 创建临时账号（201）、登录（200）、读取个人资料（200）、创建会话（201）、写入反馈（201）并读回（200）。预检写入与后续模拟器登录、反馈写入均在本机环境内完成。

### 七页宿主记录

逐页手动操作微信开发者工具模拟器。下列路由对应工程页面；页面到达和状态变化以实际操作及模拟器画面为据。证据图保留完整手机屏幕，裁去宿主窗口其余区域，为 309 × 668 像素 WebP。

| 页面 | 工程路由 | 宿主实际操作及结果 | 本轮证据 |
| --- | --- | --- | --- |
| 地图 | `pages/map/index` | 灵山胜境显示 47 个点位。选中 1 号点后，底部卡片显示九龙灌浴，点击详情进入对应页面。切到英文后，点 Filters 可展开景区、搜索和地图模式等控件。 | [选点与底部卡片](evidence/wechat-host-map-selected.webp) · [英文入口](evidence/wechat-host-map-en.webp) · [展开筛选](evidence/wechat-host-map-en-filters.webp) |
| AI 导游 | `pages/ai-guide/index` | 首屏显示静态导游形象。点击一次“第一次来怎么玩”，获得 10 站路线及资料引用，看到“正在播报”、暂停与停止，随后返回空闲。此轮问答使用本机 mock。英语界面下，静态与动态 Live2D 的两次切换按下节复测。 | [欢迎页与建议](evidence/wechat-host-ai.webp) · [路线、出处和播报控件](evidence/wechat-host-ai-answer.webp) |
| 个人中心 | `pages/profile/index` | 操作详情页后，游客个人中心显示 1 个收藏、0 个保存行程、1 个游览足迹。登录临时账号后身份切换，退出后原计数仍在。撤销收藏与到访后个人中心三项均为 0。 | [游客身份与三项统计](evidence/wechat-host-profile.webp) · [撤销后三项归零](evidence/wechat-host-profile-restored.webp) |
| 收藏与记录 | `pages/favorites/index` | 收藏、足迹、最近浏览三个分组均显示九龙灌浴。从此处进入详情，分别撤销收藏与到访，返回列表，收藏和足迹归零，显示收藏空态插画。最近浏览仍有九龙灌浴一条。 | [三组记录](evidence/wechat-host-favorites.webp) · [撤销后空态及浏览记录](evidence/wechat-host-favorites-restored.webp) |
| 登录与注册 | `pages/auth/index` | 空提交显示用户名长度提示，用临时账号在本机登录成功。首次发现密码明文后修复并重编，在注册模式输入 11 个独立测试字符，全程显示圆点，切回登录后仍全掩码。最终包从注册表单提交另一个一次性游客，自动返回个人中心，显示该游客名及已登录状态；确认退出后恢复游客。 | [空表单](evidence/wechat-host-auth.webp) · [空提交校验](evidence/wechat-host-auth-error.webp) · [修复后切回登录](evidence/wechat-host-auth-masked.webp) · [注册成功后的个人中心](evidence/wechat-host-auth-registered.webp) |
| 景点详情 | `pages/spot/detail` | 从地图打开九龙灌浴，实景照片和景点介绍可见。依次收藏和标记已到访后，两项操作均显示可撤销状态。 | [操作前](evidence/wechat-host-spot.webp) · [收藏与到访后](evidence/wechat-host-spot-marked.webp) |
| 意见反馈 | `pages/feedback/index` | 选二星并留空，提交时出现补充意见提示。输入 18 字符后计数为 18/500，提交成功并返回个人中心。 | [二星空意见校验](evidence/wechat-host-feedback-validation.webp) · [18 字符计数](evidence/wechat-host-feedback-typed.webp) |

同一模拟器在个人中心从简体切到英文，再切到繁体。地图显示「靈山勝境」「篩選」「展開」；AI 页显示「今天想怎麼玩？」「錄音」「送出」和普通话录音提示。结束时恢复简体中文与原先开启的减少动态效果。[繁体地图](evidence/wechat-host-map-traditional.webp) · [繁体导游](evidence/wechat-host-ai-traditional.webp)

**工具链观察。** 微信灰度基础库 3.18.0 热编期间，`WAServiceMainContext` 两次报告 `__subPageFrameEndTime__ of null`。随后首页正常载入，登录页密码掩码复测通过。该日志位于基础库上下文；最终冷启动时依赖分析也提示 Cubism Core 内的 fs、path 分支；本轮微信环境仍绘制出真实纹理帧。按手机预览与上传包结果继续复查。

### 微信 Live2D 与减少动态效果复测

首次进入动态模式时，模型区域出现竖纹。修复过程中的一个中间版本能首屏显示模型，但切换减少动态效果后再返回标准模式，界面显示模型暂不可用并回落到立绘。这两张图记录当时可重现的现象。[首次动态模式](evidence/wechat-host-ai-dynamic-before.webp) · [中间版本恢复结果](evidence/wechat-host-ai-resume-fallback.webp)

| 最终构建的手动步骤 | 模拟器画面与结果 |
| --- | --- |
| 英文界面冷启动，保持减少动态效果 | 显示浅色服装立绘，状态为 Still avatar，讲解入口可用。[首次静态](evidence/wechat-host-ai-final-en-static.webp) |
| 在个人中心将动态偏好改为 Standard，再回 AI 页 | 模型就绪，显示深色服装动态人物，标题下为 Live2D ready。[首次标准模式](evidence/wechat-host-ai-final-en-ready.webp) |
| 在个人中心打开减少动态效果，再回 AI 页 | 回到立绘，页头改为 Still avatar，没有将静态偏好显示成载入失败。[再次静态](evidence/wechat-host-ai-final-static.webp) |
| 恢复 Standard，再回 AI 页 | 两次采样均显示深色服装人物，标题下为 Live2D ready，先前的竖纹和错误文案均未再出现。[恢复第一帧](evidence/wechat-host-ai-final-resumed.webp) · [恢复第二帧](evidence/wechat-host-ai-final-resumed-second.webp) |

在最终恢复的两张未压缩截屏中，取人物区域 76 × 148 像素（相对本页 309 × 668 手机截图左上角 x=115、y=184）。11,248 个像素中有 5,417 个 RGB 值变化，其中 1,904 个至少一个色彩通道绝对差值超过 8。此采样覆盖模型姿态变化。末次进入的宿主日志记录单次 onShow 为 77 ms，未采集连续帧耗时。微信真机图形性能、麦克风与商业语音服务仍待相应设备和账号验证。
