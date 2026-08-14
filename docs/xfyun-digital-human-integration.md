# 讯飞动态数字人多端接入与 iOS 测试方案

本文对应 `visitor-app` 的动态数字人测试链路。目标端为 Web、微信小程序、Android、iOS 与 HarmonyOS。

## 1. 当前采用的架构

当前 uni-app x 项目使用 Vapor。测试阶段采用统一的受控 WebView 方案：

1. 游客端向 `POST /api/digital-human/web/session` 申请短期会话。
2. Node 服务验证所选数字人必须为在线讯飞形象，并生成 30–300 秒的 HMAC 会话票据。
3. WebView 打开同源 `/digital-human/?session=...` 页面。
4. 页面通过 `GET /api/digital-human/web/bootstrap` 换取讯飞短期 `signedUrl`；API Secret 永远不下发。讯飞协议要求把 API Key 编码在短期签名 URL 的授权字段中，因此该 URL 按敏感临时凭据处理，并在换取后立即从页面地址中清除会话票据。
5. 用户点击“启动动态数字人”后，官方讯飞 Web SDK 建立 XRTC 连接；AI 问答结果通过 `writeText` 驱动形象、口型和讯飞音色播报。
6. 页面取得票据后立即从地址栏清除票据，并使用 CSP、no-store、SDK 文件白名单和路径校验收紧运行环境。

游客端入口位于 AI 导游头像/数字人卡及地图底部数字人卡。“问问我”仍进入原生 AI 对话页，两个入口互不覆盖。

官方资料：

- [讯飞虚拟人 Web SDK](https://www.xfyun.cn/doc/tts/virtual_human/Web-SDK.html)
- [讯飞虚拟人 WebAPI](https://www.xfyun.cn/doc/tts/virtual_human/API.html)
- [DCloud uni-app x web-view](https://doc.dcloud.net.cn/uni-app-x/component/web-view)

## 2. 为什么微信测试版优先使用受控 WebView

讯飞确实提供微信原生 XRTC 方案，但官方说明该方案不支持 uni-app 等跨端框架，并要求企业主体、开放类目、`live-player/live-pusher` 权限、基础库 2.10 以上及真机调试。微信开发者工具不能完整验证原生实时音视频标签。

因此本项目先使用同一个 HTTPS WebView 页面保证五端一致。微信公众平台还必须在“开发管理 → 开发设置 → 业务域名”加入：

```text
https://api.shuzhiyouzong.cn
```

业务域名不同于 `request`、`uploadFile` 合法域名，三项不能互相替代。受控页使用 HTTPS，不能在真机中打开 `127.0.0.1`。

官方资料：

- [讯飞微信 XRTC 文档](https://voipconference.xfyun.cn/book/#/wechat/README)
- [微信小程序 web-view](https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html)

## 3. 原生插件方案

正式版本若需要减少 WebView 层级，可在取得讯飞对应端 SDK 与商业授权后，新增统一的 `uni_modules/xfyun-digital-human` 接口并分端实现：

- Android：封装讯飞 `AIKit.aar`、`vms.aar` 和 XRTC SDK。
- iOS：封装讯飞 `AIKit.framework`、`XRTCSDK.framework`，或先转为 `xcframework` 再由 UTS 插件调用。
- HarmonyOS：需要讯飞提供与当前 HarmonyOS API/ABI 匹配的 HAR/OHPM 包；在没有完整虚拟人 SDK 前继续使用受控 WebView。
- 微信：原生小程序页面/组件必须使用微信原生工程能力，不能把 Android/iOS 二进制插件复用到小程序。

当前仓库只有已获授权的讯飞 Web SDK，没有 Android/iOS/HarmonyOS 原生虚拟人 SDK 包，因此本轮没有伪造空壳原生插件。

官方资料：

- [讯飞 Android 虚拟人 SDK](https://www.xfyun.cn/doc/tts/virtual_human/Android-SDK.html)
- [讯飞 iOS 虚拟人 SDK](https://www.xfyun.cn/doc/tts/virtual_human/iOS-SDK.html)
- [DCloud UTS 插件](https://doc.dcloud.net.cn/uni-app-x/plugin/index.html)
- [DCloud uni-app x 原生 SDK 限制](https://doc.dcloud.net.cn/uni-app-x/native/index.html)

## 4. iOS 端生成与测试

讯飞 iOS 虚拟人 SDK 支持 iOS 9 及以上，但只提供 arm64，必须使用 iPhone/iPad 真机验证；iOS 模拟器不能验证该原生 SDK。申请材料至少包括讯飞虚拟人授权、最终 Bundle ID、应用签名、AppID/APIKey/APISecret、可用 avatarId/vcn 和讯飞交付的 Framework。

当前 Vapor 工程在 Windows 上可完成 iOS 字节码编译，但可安装到 iPhone 的 IPA 必须签名。不存在 iOS 公共测试证书。可选路径：

- Windows + DCloud iOS 云打包：提供最终 Bundle ID、Apple `.p12`、证书密码和匹配的 `.mobileprovision`。
- Mac + Xcode + 免费 Personal Team：仅适合自己的真机，签名通常 7 天失效，不能作为评委分发方案。
- 付费 Apple Developer Program：使用 Development/Ad Hoc 描述文件登记测试设备 UDID，或通过 TestFlight 分发。

当前 Vapor 工程不应为了“本地导出原生工程”临时退回 VDOM；DCloud 的 uni-app x 原生 SDK嵌入方案目前不支持 Vapor。

官方资料：

- [DCloud iOS 云打包](https://doc.dcloud.net.cn/uni-app-x/tutorial/app-package.html)
- [Apple 会员能力对比](https://developer.apple.com/support/compare-memberships/)
- [Apple Ad Hoc 描述文件](https://developer.apple.com/help/account/provisioning-profiles/create-an-ad-hoc-provisioning-profile/)
- [Apple 在模拟器或真机运行](https://developer.apple.com/documentation/Xcode/running-your-app-on-simulated-or-physical-devices)

## 5. 环境变量与发布边界

服务端新增变量：

```text
XFYUN_AVATAR_APP_ID=
XFYUN_AVATAR_API_KEY=
XFYUN_AVATAR_API_SECRET=
XFYUN_AVATAR_SERVER_URL=wss://avatar.cn-huadong-1.xf-yun.com/v1/interact
XFYUN_AVATAR_SCENE_ID=
XFYUN_AVATAR_SCENE_VERSION=
XFYUN_AVATAR_SESSION_SECRET=
XFYUN_AVATAR_SESSION_TTL_SECONDS=180
```

前三项为空时会复用现有讯飞服务端凭据；测试环境已经通过本地真实连接验证。`XFYUN_AVATAR_SESSION_SECRET` 必须为至少 32 个字符的独立随机值，正式部署不建议长期复用 JWT Secret。短期 `signedUrl` 仍属于敏感临时凭据，不应写入日志、缓存或分析平台。

部署时还需同步受控页面、四个讯飞 SDK 运行文件、Node 接口与 nginx `/digital-human/` GET/HEAD-only 路由。仓库已更新原子发布脚本和 nginx 配置，但公网部署属于外部变更，执行前仍需明确确认目标服务器与回滚点。
