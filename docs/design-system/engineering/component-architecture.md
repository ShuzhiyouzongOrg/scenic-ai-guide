# uni-app x、UTS 与 Vapor 工程适配

依据 [SRC-02](../references/source-index.md) 和 [DCloud 样式说明](https://doc.dcloud.net.cn/uni-app-x/css/)。visitor-app 是 HBuilderX 工程，编译器、Sass 与 UTS 插件由同一版 HBuilderX 配套。渲染目标和样式隔离读取 manifest，Web 的 VDOM 成功仅代表 Web。

1. **ENG-01** 页面通过 services/guide-api.uts、stores 与已有接口通信。组件目录采用 components/组件名/组件名.uvue，单向 props + 命名事件。共享组件只处理界面，session、route 和语音 SDK 归实际所有者管理。提交新组件前查 Rice 现有资源及调用方。 [DCloud Vue 组件](https://doc.dcloud.net.cn/uni-app-x/vue/)
2. **ENG-02** 使用 script setup lang="uts" 与显式类型，存储值及跨桥 JSON 均检查空值。条件编译隔离 Web DOM、微信原生组件及 App WebView；域外对象不跨原生边界传递。异步请求分配版本，离页销毁计时器、录音器订阅、播放队列与媒体轨。 [UTS 编译矩阵](https://doc.dcloud.net.cn/uni-app-x/uts/)
3. **ENG-03** 使用逻辑 px、flex、text 和 DCloud 原生资源。尺寸与色值源文件为 design/tokens.json，运行 node scripts/design-tokens.mjs 生成 Sass、UTS 及原生导航主题，再用 --check 检测漂移。组件内样式隔离 2.0，页面根设 themeClass；同名 class 不用作穿透第三方组件的 API。 [样式支持](https://doc.dcloud.net.cn/uni-app-x/css/)
4. **ENG-04** 系统导航、键盘、map、录音权限和 actionSheet 优先宿主实现。地图投影与 SDK 尺寸不是间距 Token。原生 map、WebView、微信 canvas 可能独立合成，须以实际点击、遮挡和返回测试验证 z-order。 [原生地图组件](https://doc.dcloud.net.cn/uni-app-x/component/map.html)
5. **ENG-05** 新增库时记录用途、版本、权利来源、各端编译情况、主包字节差异及原生替代。此轮前端运行时沿用项目依赖，项目技能归档、规则和生成器与产物分目录；Python、Node、ImageMagick 是维护工具，不进入客户端。 [插件结构](https://doc.dcloud.net.cn/uni-app-x/plugin/uni_modules.html)
6. **ENG-06** HBuilderX CLI 先 project open --path，再 launch web / mp-weixin / app-android / app-ios / app-harmony --project <绝对路径> --compile true。iOS 在 Windows 指定 --iosTarget simulator。保存诊断和产物信息，安装、签名和云服务验收另记。完整记录见[质量门禁](../quality/release-checklist.md)。 [DCloud CLI](https://hx.dcloud.net.cn/cli/README)
