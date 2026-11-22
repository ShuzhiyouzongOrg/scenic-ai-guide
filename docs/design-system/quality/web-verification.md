# 游客端 H5 视觉与交互实测

导游底栏合并后的两种浏览器、五个根页往返及同源服务复测见[五格导航 H5 验收](guide-navigation-web-verification.md)。本文保留各次样本的原始布局和日期。

2026-11-21 采集改造前首页，11-22 用改造后的真实 uni-app x 页面复测。DCloud HBuilderX 5.24 / Vite 5.2.8 运行 H5 VDOM 工程。Python Playwright 驱动 Windows Chromium 151.0.7922.34 与 WebKit 26.5。两种引擎各运行 2 种视口、每种 5 个真实 tab，总计 20 次页面测量。浏览器的 mobile/hasTouch、配色与降低动效由测试上下文设置。iOS、Android、微信另由各自宿主验收。

## 样本与数据来源

- Web 仅监听 `127.0.0.1:5156`，`127.0.0.1:5178` 运行仓库 server 的原始 Node 路由、种子景区资料和内存 SQLite。Playwright 将应用原配置的生产 API 域名逐次改投到本机，保留 HTTP 方法、请求体和接口返回值，额外拒绝其他公网请求。账号文件与生产服务均未写入。
- LLM、ASR、TTS 使用项目 mock 供应商；本次正常首页、路线、保存、会话、个人计数都由真实本地 API 响应。云数字人 session 在没有供应商凭据时返回预期 503；页面显示本地形象与重新连接按钮。该路径有 HTTP 和应用的错误日志，未发生未捕获 JS 异常。
- 重构后五页首次加载不依赖远程照片，每种尺寸的 5 个 tab 图标均成功加载。基线截图打开了原页面，网络图片被阻断；图片状态应与当时的网络条件一起解读。[原始首页，390×844](evidence/before-home-390.png)

| 页面 | 390×844，浅色 | 320×690，深色＋减少动态效果 | 检查对象 |
| --- | --- | --- | --- |
| 首页 | [截图](evidence/home-390-light.png) | [截图](evidence/home-320-dark.png) | 本地景区摄影、切区选中符号、导游与行程入口、推荐卡 |
| 地图 | [截图](evidence/map-390-light.png) | [截图](evidence/map-320-dark.png) | 原工程标定手绘图、点位、独立缩放按钮、底部卡片及暗色上层 |
| AI 导游 | [截图](evidence/ai-guide-390-light.png) | [截图](evidence/ai-guide-320-dark.png) | 数字人降级、录音状态文本、消息输入和发送 |
| 行程 | [截图](evidence/trip-390-light.png) | [截图](evidence/trip-320-dark.png) | 按时长/兴趣选择、主操作、推荐/空状态 |
| 我的 | [截图](evidence/profile-390-light.png) | [截图](evidence/profile-320-dark.png) | 身份、收藏/行程/足迹、设置、字体及底部导航 |

两个引擎的每一页均无横向溢出，内容底边与 tab 顶边相差 0px。390 视口边界在 y=790，320 视口在 y=636。深色时内容背景采样 RGB(17,26,22)，地图保留其实际地理底色。另在 430×932 复查首页及景区切换。[390px 测量与控制台记录](evidence/browser-390-light.json) · [320px 测量与控制台记录](evidence/browser-320-dark.json)

两个 WebKit 运行均完成全部断言，未捕获的脚本异常为零。原始记录保留模拟开关、各页边界、HTTP 状态及已验证的键盘或字体场景。[WebKit 390px](evidence/webkit-390-light.json) · [WebKit 320px](evidence/webkit-320-dark.json)

## 手动场景的自动浏览器操作

| 实测输入 | 观察与结果 |
| --- | --- |
| 首页在灵山与拈花湾间切换 | 景区名称、Hero 图片、选中图标和接口 area 随同切换，两次加载返回 200。 |
| 景点接口依次返回故障、空集与正常数据 | 仅此故障注入场景用 Playwright 返回 503 及 200/空数组。页面先显示重试，重试后显示空态，切区后恢复真实 API 并得到景点卡。 |
| 第一阶段从真实卡片进入详情并收藏 | 当时的个人中心按浏览统计足迹。本轮已把收藏、浏览与手动到访分别存储，未标记的浏览不会增加到访计数。[当前交互实测](home-followup.md) |
| 生成半日行程 → 调整首站 → 保存 → 切 tab → 从已保存记录恢复 | 灵山返回 9 站；在系统操作表点“下移一站”，首两站由“南门入园、灵山大照壁”变为“灵山大照壁、南门入园”。保存返回 201；个人中心行程计数为 1；从记录可重新打开地图。 |
| 个人中心切为 English、重载、打开反馈深链接、回到根页 | 五个标签分别变为 Home、Map、AI Guide、Trips、Profile，刷新后保留。详情页冷启动和返回未出现 setTabBarItem 错误。新增的语言动作、录音和系统授权仍需各端复验。 |
| 开关减少动态，改变宿主配色 | 组件探针随媒体事件由浅色切深色，`reducedMotion` 由 false 变为 true；启用按钮点击 1 次，禁用按钮未产生额外回调，选项有勾选状态。按钮外层实测高 44px。可见状态独立于位移/动画。 |
| 用键盘激活动作、已禁用按钮和服务行 | Chromium、WebKit 均能通过 button 角色定位“生成行程”，Enter 与 Space 各发一次推荐请求。保存后的按钮向辅助技术报告禁用并移出 Tab 顺序，再按 Enter 未重复保存。Chromium 的景区选择可用 Enter，收藏服务行可用 Space 打开。 |
| 在 320px 深色视口开启大号字体，然后重载 | Chromium 与 WebKit 实测页头 32→40px、设置行 16→20px，重载后仍为 40/20px。页面保持 320px，无横溢，用空格仍能打开语言面板。[大号字体实拍](evidence/profile-320-large-type.png) |

语音的录制/取消、PCM 格式、播报暂停续播和中断，以及地图筛选、选中、取消与跨页恢复，详见[导游与地图专项测试](guide-verification.md)。行程双景区、拖动和恢复见[旅游页面专项测试](travel-page-verification.md)。

实测修复了 H5 启动页挂载前设置 tab 文案引起的五条错误，以及框架 wrapper 和 page-body 同时预留下方 tab 高度造成的 54px 空带。H5 的 viewport 支持浏览器放大，首次渲染与路由返回均用同一底部布局规则。

## 本地复跑

交付时另以普通 Chromium 会话从 `http://127.0.0.1:5156/` 打开可交互预览。在临时游客端副本的 `config/env.uts` 中使用 development，H5 直接请求本地 API。未加入 Playwright 网络重写时，首页“发现无锡”和灵山景点列表正常显示，`/api/map-guide/spots?area=lingshan` 返回 200；第一阶段首页只访问本机的 5156 和 5178 两个端口。本轮使用工程默认允许的前端来源 127.0.0.1:5173，连接包含语音与 WebView 更新的 127.0.0.1:5198。5156/5178 保留作第一阶段预览。下文的截图回归保留其独立的网络重写方式。

1. 在临时目录放置 `server/`、`vendor/` 的仓库副本。用 Node 22 在副本的 server 下执行 `npm ci --no-audit --no-fund`，保留仓库的 lockfile 与随包 xlsx。设置 `HOST=127.0.0.1`、`PORT=5178`、`SQLITE_PATH=:memory:`、`LLM_PROVIDER=mock`、`ASR_PROVIDER=mock`、`TTS_PROVIDER=mock`、`RAG_REMOTE_ENABLED=false`，启动 `node src/app.mjs`。临时 API 不载入生产 .env。
2. 将 visitor-app 源码复制到本机临时目录，跳过 unpackage、node_modules、.hbuilderx。实测使用 HBuilderX 自带的 Sass；在副本的父目录建立 `node_modules/sass` 指向 HBuilderX 的 `plugins/compile-dart-sass/node_modules/sass`（Windows 可用 Junction）。在临时副本设 development 并把 developmentApiBaseUrl 指向本次回环 API；默认服务端允许来自 127.0.0.1:5173 的跨域请求。正式源码、package.json 和线上 API 配置均无需修改。以下 PowerShell 命令中的两个路径替换为本机绝对路径。

   ```powershell
   $env:HX_APP_ROOT = 'D:\HBuilderX.5.15.2026070915\HBuilderX'
   $env:UNI_INPUT_DIR = 'C:\scenic-qa\visitor-app'
   $env:UNI_OUTPUT_DIR = 'C:\scenic-qa\h5-output'
   $env:UNI_APP_X = 'true'
   Set-Location "$env:HX_APP_ROOT\plugins\uniapp-cli-vite"
   & "$env:HX_APP_ROOT\plugins\node\node.exe" node_modules/@dcloudio/vite-plugin-uni/bin/uni.js -p h5 --host 127.0.0.1 --port 5173
   ```

3. 在有 Python 3.10+ 与 Playwright 的独立测试环境中安装匹配的浏览器（`python -m playwright install chromium webkit`）。从工作区根目录运行下方命令。输出目录应按引擎区分，每个目录含十张常规页面截图、一张大号字体截图、热门目的地与空错态截图及两份运行记录。复跑可用下列默认 5178，也可用 --api http://127.0.0.1:5198 指定测试后端。测试器拦截正式 API 请求后只访问指定回环地址。原生条件编译分支需使用对应工具。

   ```powershell
   python scripts/verify-visitor-web.py --web http://127.0.0.1:5173 --engine chromium --output "$env:TEMP\scenic-web-chromium"
   python scripts/verify-visitor-web.py --web http://127.0.0.1:5173 --engine webkit --output "$env:TEMP\scenic-web-webkit"
   ```

4. 各视口依次点击五个真实系统 tab，脚本检查页面渲染、当前主题、总宽度、底部导航边界及图标加载。人工对照供稿头像、地图关键区域、字距、文案换行及按压状态；本地测试账号注册和登录见[子页运行记录](subpage-verification.md)。真机软键盘、系统读屏、真实音频、云数字人和原生地图服务需要另有验证条件。[复跑脚本](../../../scripts/verify-visitor-web.py) · [跨端操作表](../engineering/cross-platform-compatibility.md)

最终双引擎回归使用 5173 的实际游客端与 5198 的内存 API。五页共 20 次测量和附加业务断言全部通过，四组均无未捕获脚本异常。截图检查等待 tab 图片解码成功，以覆盖开发构建首次按需编译的情况。[本轮测量及故障注入](evidence/home-followup-results.json) · [本轮五页总览](evidence/five-tabs.webp)

H5 正式模式另建静态输出，用本机临时 HTTP 服务为前端路由回退到 index.html，测试器将 API 指向本地 SQLite 服务。Chromium 与 WebKit 再各走 390px 浅色、320px 深色共 20 次页面测量。热门目的地、故障重试、空态插画及到访撤销断言通过，四组均无未捕获脚本异常。静态输出文件树摘要与分组结果见[正式构建记录](evidence/home-followup-results.json)。
