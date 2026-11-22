# 移动端基线审计

2026-11-21，仓库 main 的 6c0035e946a74973142c55d9ea86f5aac15d92b3。此次从空工作区检出，以下路径和行号均指修改前版本。

## 工程与依赖

仓库根包含 visitor-app（游客端）、web（Vue 网站与管理台）、server（Node 服务和景区数据）、desktop（Electron）、deploy、scripts、docs、vendor 及 .github/workflows。游客端没有独立 npm 构建脚本。visitor-app 下的 pages、components、domain、services、stores、config、static、uni_modules、wxcomponents、native-assets、harmony-configs 分别承载路由、组件、数据类型、网络、状态、环境、应用资源、插件、微信原生组件及各平台工程资源。

manifest.json 声明版本 0.2.0 / 200，Vue 3、uni-app-x.vapor=true、bytecode、styleIsolationVersion=2、微信基础库 3.7.1。main.uts 用 createSSRApp，Web 单独导入 Rice 样式。实测 HBuilderX 5.24，uniapp-cli-vite 5.24.2026081216.3200、uniapp-uts-v1 5.24.2026081216.3203，Vite 插件绑定 DCloud 3.0.0-5020420260812001。Web 编译器报告 VDOM；原生目标使用 Vapor。工程没有单独锁定 UTS 编译器版本。

pages.json 注册五个自定义导航栏 tab 和五个详情/服务分包；微信省去数字人 WebView 分包，AI 页另行注册 scenic-live2d。原生 tabBar 用 10 张 PNG、60px 高度，locale.uts 会重设 tab 文案。Android/Harmony 保留双击返回退出。

## 业务与组件观察

|入口|实际行为与边界|需要改进|
|---|---|---|
|pages/home/index.uvue|加载 fetchScenicSpots 默认灵山，spot-card 进入详情。地图、AI、行程、账号均有入口。|固定 24°、40+ 与路线节点摘要缺乏数据依据。失败和空列表共用提示，缺少重试。54px 顶距与其他页不同。|
|pages/map/index.uvue|原生 map 与手绘引擎共存。App 触点拖图、缩放，其他端 movable-view。投影、稳定点位 ID、版本号防旧请求覆盖；queueGuidePrompt 跨 tab。|面板及控件用固定顶部坐标；8–11px 辅字、28px 切换按钮。点位未提供清除操作。按 id 匹配固定路线会覆盖自定义顺序。|
|pages/ai-guide/index.uvue|文本 askQuestion、录音 askVoice、分段 TTS；云 WebView 收 ready/speaking/idle/error。微信原生 Live2D，其他端支持受控 HTTPS 会话。|停止录音回调总会上传，卸载/取消缺乏区分。onPause 与空闲合并；Web 录音仅提示。云桥公开 speak/interrupt/dispose，缺少精确暂停事件。|
|pages/trip/index.uvue|60/180/360 分钟和五类兴趣调用 recommendRoute，服务端选路。保存按 session 存 nodeIds；恢复需 route graph 映射。|推荐 API 默认灵山，页头可显示拈花湾。手动排序、避免重复保存、加载失败恢复均缺失。|
|pages/profile/index.uvue|读取缓存身份与头像，恢复 profile，5MB 上传，收藏和足迹本地计数，已保存行程来自服务。支持简繁英、景区、数字人、退出确认。|36px 登录、9–10px 信息、重复设置行、固定 58px 顶距。计数失败可能被误读为零。|

页面标记实计 rice-icon 21 次、rice-button 8 次、rice-cell 3 次、rice-loading 3 次、rice-search 1 次。vendored RiceUI 1.1.8 含 60 个组件目录，要求 uni-app x ^5.03。按钮实现已有 loading/disabled 拦截，图标用随包字体。DCloud scroll-view、image、text、textarea、map、movable-area/view、web-view 与 modal/actionSheet/toast 均应继续使用。原有 app-section、spot-card、empty-state、digital-human-guide 具备清晰业务边界，保留入口并改其内部。UI 不得持有新的用户身份或替代服务层。

## 视觉与资源

App.uvue 将 Rice 浅色主题覆为蓝，uni.scss 另有一套 px 比例；Rice 自身 variables.css 则已有绿色浅色主题。组件各自定义蓝色、金色、阴影、渐变和圆角。Home 数据统计与泡泡、Trip 序号、Map 徽标和 Profile 光斑争夺标题注意力。主导航 PNG、Rice 字体、Unicode 箭头和杂项字符混用。static 当前包含品牌 logo、两张数字人图、两张手绘景区地图及十张 tabBar 图。景点图片由 HTTP 服务解析 coverUrl；无本地首页摄影库。手绘图与点位标定有关，不能按卡片裁切规则替换底图。

## 交互与回归优先级

1. 固定现有路由、地图投影、账号/会话、区域偏好及请求契约。定义有名称的状态、复核许可证。
2. 建立主题、字号、热区、安全区和通用组件。先迁移首页/个人页，以一列布局检查文字放大。
3. 行程从生成到存储，再到地图的顺序必须一致。地图底卡与缩放互斥，切区忽略迟到响应；保持原生地图降级。
4. 最后接入语音。分别验证录音取消、上报、暂停、续播、打断、切 tab、云桥超时和微信回退。定时器和音频按会话清理。
5. 运行 HBuilderX CLI 五个目标；Web 截图和交互与原生编译、模拟器运行、真机验收分别记账。本仓库 server/package.json 另有 check、test:routes、test:voice、test:digital-human、test:profile-avatar 等命令。

入口见 [质量记录](../quality/release-checklist.md)。原生 WebView、地图图层、微信胶囊、读屏、系统动态字号和麦克风需要对应宿主。已有 README 的历史运行结果仅用于复现路线。
