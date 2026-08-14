# Visitor App

面向游客的正式多端应用，基于 HBuilderX 5.24、uni-app x Vapor、RiceUI 和 `uni-ai-x` 源码构建。管理后台仍保留在原项目中，本目录只承载游客端。

## 目标平台

- Web/H5
- 微信小程序（AppID：`wxc8dc4bac62076888`）
- Android
- iOS
- HarmonyOS

## 产品结构

底部五个主入口：

1. 首页
2. 地图
3. AI 导游
4. 行程
5. 我的

当前共 9 个页面：5 个主页面、景点详情、登录/注册、收藏与足迹、意见反馈。

## 已形成的业务闭环

- 首页景点 → 景点详情 → AI 自动携带景点问题。
- 景点详情 → 地图自动定位；推荐路线 → 地图绘制实际节点。
- AI 导游恢复服务端历史，支持录音上传，并串联 ASR、知识库问答和 TTS 播放。
- 行程生成、保存、读取和恢复到地图。
- 游客账号注册、登录、登录态恢复与退出。
- 本设备景点收藏、游览足迹和“我的”真实数量统计。
- 意见反馈提交到现有 `/api/feedback` 服务。

录音链路已经过真实 HTTP multipart 上传回归，但当前服务端 `ASR_PROVIDER=mock`，因此语音识别结果仍是开发占位实现；LLM/RAG 与讯飞 TTS 已接入。正式语音验收前需要配置真实 ASR 提供商。

## 使用的组件与官方能力

- DCloud 内置 `map`、`scroll-view`、`textarea`、`image`、`uni.request`、`uni.uploadFile`、`uni.getLocation`、`uni.getRecorderManager`、`uni.createInnerAudioContext`。
- RiceUI：`rice-button`、`rice-icon`、`rice-search`、`rice-tag`、`rice-cell`、`rice-loading`。
- `uni-ai-x` 官方源码及自定义服务适配层位于 `uni_modules`；当前 AI 页面调用项目已有 Node API，不依赖 uniCloud。

当前移动视觉系统复用了桌面端 `desktop/assets/icons/icon-master.png`，并生成 Android、iOS、HarmonyOS、页面品牌图和原生 tabBar 图标。布局参考了 DCloud `casecode/hello-uni-app-x` 中的 Vapor 信息流、地图和移动卡片示例，参考基线 commit 为 `f8e077d6552a097ab84eb2415131a3390716aee4`；仅复用布局思路和全端组件模式，没有覆盖本项目业务 store、API 或本地 `uni-ai-x 2.1.3`。

## 本地开发

开发 API 位于 `config/env.uts`：

```text
http://127.0.0.1:5178
```

先启动现有后端：

```powershell
Set-Location ..\server
npm start
```

再在 HBuilderX 中打开 `visitor-app`。开发者工具模拟器可以访问电脑的 `127.0.0.1`；手机真机不能把它当作电脑地址。真机、体验版和正式版必须改为公网 HTTPS API，并在微信公众平台配置 `request` 合法域名。

- HBuilderX：`D:\HBuilderX.5.15.2026070915\HBuilderX`（目录名为历史名称，应用版本为 5.24）
- 微信开发者工具：`D:\WeChatDevelopTool`
- DevEco Studio：`D:\DevEco Studio`

## 编译命令

```powershell
& 'D:\HBuilderX.5.15.2026070915\HBuilderX\cli.exe' launch web --project '<repo>\visitor-app' --compile true
& 'D:\HBuilderX.5.15.2026070915\HBuilderX\cli.exe' launch mp-weixin --project '<repo>\visitor-app' --compile true
& 'D:\HBuilderX.5.15.2026070915\HBuilderX\cli.exe' launch app-android --project '<repo>\visitor-app' --compile true
& 'D:\HBuilderX.5.15.2026070915\HBuilderX\cli.exe' launch app-ios --project '<repo>\visitor-app' --iosTarget simulator --compile true
& 'D:\HBuilderX.5.15.2026070915\HBuilderX\cli.exe' launch app-harmony --project '<repo>\visitor-app' --compile true
```

## 当前验证结果

- Web：9 个页面编译成功，并完成主要浏览器业务回归。
- 微信小程序：9 个页面完整编译成功。
- Android：Vapor 原生资源与字节码严格编译成功。
- iOS：Vapor 模拟器目标原生资源与字节码严格编译成功；安装、签名和发行仍需 macOS/Xcode。
- HarmonyOS：UTS、ArkTS、CMake/Ninja、资源和 HAP 全链路构建成功，并已在 Pura 90（API 24、x86_64）模拟器免签安装、启动。最新未签名 HAP：
  `D:\harmony-build\scenic-visitor-dev\entry\build\default\outputs\default\entry-default-unsigned.hap`
  （102,706,377 字节，SHA-256：`A04B28B9BEF0996C5A927BA7A592B84B5AD0D6DEC69D0804107F667BD8CD4A3C`）。
- 后端：`npm run check`、`npm run test:routes`、`npm run test:voice` 均通过。

项目已为 Android、iOS 和 HarmonyOS 配置网络、前台定位与麦克风用途声明，并已写入测评用 DCloud AppID、腾讯地图 Key、各端包标识与应用图标。Key、签名和域名限制仍需在公开发布前按生产安全策略拆分与收紧。

## 已知限制

- 当前没有独立 APK/AAB。`launch app-android --compile true` 不是打包；HBuilderX 的 `android_base.apk` 也不是本项目 APK。当前 DCloud AppID、包名、图标和测评 Key 已配置；独立 Android 包仍需要选择公共测试证书或自有 keystore，并在负责人明确授权上传构建材料后执行 DCloud 云打包。
- 微信原生 `<map>` 的底图、marker 和 polyline 不需要腾讯 WebService Key；POI 搜索、地址解析和腾讯算路才需要。生产环境建议由本项目 HTTPS 后端保管 Key/SK 并代理请求。
- 微信开发产物包含完整 `uni-ai-x` 字体、KaTeX、Mermaid 和语法高亮资源，当前开发目录约 18.3 MB。正式上传前必须裁剪或分包。
- HarmonyOS Pura 90 模拟器已安装镜像并成功运行应用，但腾讯地图 `libmapengine.so` 仅有 `arm64-v8a`，该 x86_64 模拟器上的地图页不能作为最终验收结论，需用 arm64 真机复测。
- 微信后台已配置 `request` 合法域名，但语音问答使用 `uni.uploadFile`；还需把实际 HTTPS API 域名加入 `uploadFile` 合法域名。`config/env.uts` 的 production 地址仍是占位值，部署游客端后端后再切换。
- `uni-ai-x` 的 uniCloud 警告是预期提示；当前实现使用 `/api/chat/ask`，无需启用 uniCloud。

平台账号、签名与地图 Key 的获取方式见 `../docs/multi-platform-credentials-and-map-keys.md`。
