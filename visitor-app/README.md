# Visitor App

面向游客的正式多端应用，基于 HBuilderX 5.24、uni-app x Vapor 和 RiceUI 构建。AI 对话的信息架构与交互参考 `uni-ai-x 2.1.3`，运行时代码继续调用项目现有 Node API；为满足微信包体限制，未使用的 `uni-ai-x`、KaTeX、Mermaid 和语法高亮运行时已从测评工程中裁除。管理后台仍保留在原项目中，本目录只承载游客端。

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
- 地图和 AI 导游页均展示数字人，状态随检索、讲解和音频播放变化。
- 景区导览提供手绘地图、点位、推荐路线编号、搜索、定位、平移和缩放，并保留腾讯导航地图切换。
- 行程生成、保存、读取和恢复到地图。
- 游客账号注册、登录、登录态恢复与退出。
- 本设备景点收藏、游览足迹和“我的”真实数量统计。
- 意见反馈提交到现有 `/api/feedback` 服务。

服务端已接入讯飞流式 IAT：移动端 MP3 或 8/16 kHz、单声道、16-bit PCM WAV/PCM 由 Node 服务端签名并发送到讯飞，随后继续执行 RAG/LLM 与讯飞 TTS。真实 TTS→ASR 往返测试已通过；AppID、APIKey 和 APISecret 只保存在服务端环境变量中。

## 使用的组件与官方能力

- DCloud 内置 `map`、`scroll-view`、`textarea`、`image`、`uni.request`、`uni.uploadFile`、`uni.getLocation`、`uni.getRecorderManager`、`uni.createInnerAudioContext`。
- RiceUI：`rice-button`、`rice-icon`、`rice-search`、`rice-tag`、`rice-cell`、`rice-loading`。
- AI 页复用了 `uni-ai-x` 的欢迎态、消息气泡、输入工具栏和安全区设计思路，但不依赖 uniCloud，也不把未使用的 Markdown/公式/流程图渲染器打入小程序。

当前移动视觉系统复用了桌面端 `desktop/assets/icons/icon-master.png`，并生成 Android、iOS、HarmonyOS、页面品牌图和原生 tabBar 图标。布局参考了 DCloud `casecode/hello-uni-app-x` 中的 Vapor 信息流、地图和移动卡片示例；仅复用布局思路和全端组件模式，没有覆盖本项目业务 store 与 API。手绘地图由项目已集成的灵山 4×4 图块重新拼接；本地“官方小程序解包”仅用于 clean-room 分析交互模式，未复制其中无许可证代码、生产接口、密钥、POI 快照和媒体资源。

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

再在 HBuilderX 中打开 `visitor-app`。开发者工具模拟器可以访问电脑的 `127.0.0.1`；手机真机不能把它当作电脑地址。当前评测构建已切换到 `https://api.shuzhiyouzong.cn`，微信公众平台也已配置 `request` 与 `uploadFile` 合法域名。该公网入口已完成独立 TLS 证书和 `/api/*` 反向代理；如需纯本地联调，可临时把 `config/env.uts` 改回 `development`。

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

- Web：9 个页面编译成功；390×844 移动视口已验证首页、人气景点横滑、手绘/腾讯地图与数字人 AI 页面。
- 微信小程序：9 个页面完整编译成功；主包仅保留 5 个 tab 页面，景点详情、账号、收藏和反馈拆为 4 个分包。开发产物为 145 个文件、1,730,528 字节（1.65 MiB）。
- Android：Vapor 原生资源与字节码严格编译成功。
- iOS：Vapor 模拟器目标原生资源与字节码严格编译成功；安装、签名和发行仍需 macOS/Xcode。
- HarmonyOS：UTS、ArkTS、CMake/Ninja、资源和 HAP 全链路构建成功，并已在 Pura 90（API 24、x86_64）模拟器免签安装、启动；手绘地图、平移、数字人和业务卡片均通过设备截图复核。最新未签名 HAP：
  `D:\harmony-build\scenic-visitor-dev\entry\build\default\outputs\default\entry-default-unsigned.hap`
  （87,076,885 字节，SHA-256：`F3E26E30EAA71B4E41A82AA2A96C6C5FC73B32792EC88663C34242563E1A6EE2`）。
- 后端：`npm run check`、`npm run test:routes`、`npm run test:voice` 和真实 `npm run test:xfyun-asr` 均通过。

项目已为 Android、iOS 和 HarmonyOS 配置网络、前台定位与麦克风用途声明，并已写入测评用 DCloud AppID、腾讯地图 Key、各端包标识与应用图标。Key、签名和域名限制仍需在公开发布前按生产安全策略拆分与收紧。

## 已知限制

- `launch app-android --compile true` 不是独立 APK 打包；HBuilderX 的 `android_base.apk` 也不是本项目 APK。DCloud 公共测试证书已经下线，独立包必须选择 DCloud 云证书或自有 keystore 后执行云打包。本轮按用户确认继续使用当前 manifest AppID，不再切换到旧截图中的 AppID。
- 微信原生 `<map>` 的底图、marker 和 polyline 不需要腾讯 WebService Key；POI 搜索、地址解析和腾讯算路才需要。生产环境建议由本项目 HTTPS 后端保管 Key/SK 并代理请求。
- HarmonyOS Pura 90 模拟器已安装镜像并成功运行应用；手绘地图作为 x86_64 可用的正式降级路径。腾讯原生地图 `libmapengine.so` 仍只有 `arm64-v8a`，导航地图最终需用 arm64 真机复测。
- 微信后台已配置 `request` 与 `uploadFile` 合法域名；公网 API 已配置匹配证书与 `/api/*` 反向代理。若服务器迁移或证书异常，可从仓库根目录运行 `deploy/scripts/verify-public-api.sh` 复检。
- 仓库原有讯飞 Web IAT 供应商示例按本轮评测要求保持不动；游客端没有新增或复制任何讯飞密钥。正式公开前仍应轮换历史凭据并另行清理 Git 历史。

平台账号、签名与地图 Key 的获取方式见 `../docs/multi-platform-credentials-and-map-keys.md`。
