# 多端发布账号、签名与腾讯地图 Key 获取清单

本文对应 `visitor-app`。先区分三类标识：

- DCloud AppID：DCloud 项目标识，用于 uni-app x 云打包和相关服务。
- 微信小程序 AppID：本项目为 `wxc8dc4bac62076888`，只用于微信小程序。
- Android applicationId / iOS Bundle ID / HarmonyOS Bundle Name：各应用商店和系统识别应用的包标识。

三者不能互相替代。

## 1. DCloud AppID

获取入口：

- [DCloud 开发者中心](https://dev.dcloud.net.cn/)
- [DCloud AppID 官方说明](https://uniapp.dcloud.net.cn/dev/app/introduction.html)
- [项目成员管理](https://uniapp.dcloud.net.cn/dev/app/add-member.html)
- [uni-app x manifest 配置](https://doc.dcloud.net.cn/uni-app-x/collocation/manifest.html)

操作：使用长期归属团队的 DCloud 账号登录 HBuilderX，在 `manifest.json → 基础配置` 中“重新获取”或创建应用。微信 AppID 仍是另一项独立配置，不能互相替代。

团队已确认本轮及后续游客端测评构建继续使用 `visitor-app/manifest.json` 中的 `__UNI__87D2500`。2026-08-14 的 Android 云证书评测包也已按该 AppID 构建；控制台截图中的其他 AppID 不得混入本项目配置。

只有 AppID 所有者或被添加为项目成员的账号才能提交云打包。不要手工伪造或随意更换 AppID。

## 2. Android 包名

Android 包名不是从网站领取，而是团队自行确定。建议基于实际控制的域名使用反向域名格式。项目当前的开发暂定值为：

```text
com.scenic.guide.visitor
```

正式云打包前应由团队确认是否长期使用。规则：至少两段、每段以英文字母开头，只使用字母、数字和下划线。发布后修改包名会被视作另一个应用。

- [Android applicationId 官方说明](https://developer.android.com/build/configure-app-module?hl=zh-cn)
- [uni-app x Android/iOS 云打包](https://doc.dcloud.net.cn/uni-app-x/tutorial/app-package.html)

## 3. Android 签名证书

DCloud 公共测试证书已经下线，不应继续寻找或使用。独立 APK/自定义调试基座必须使用以下二选一：

- DCloud 云证书：在云打包界面按冻结后的 AppID 自动生成，适合开发测评，可在开发者中心查看和下载。
- 自有 keystore：适合长期发布，私钥完全由项目方保存。

- [DCloud 当前 Android 证书说明](https://ask.dcloud.net.cn/article/35985)
- [uni-app x 云打包与云证书](https://doc.dcloud.net.cn/uni-app-x/tutorial/app-package.html)

自有 keystore 可使用 HBuilderX 内置 JDK 的 `keytool` 免费生成：

```powershell
& 'D:\HBuilderX.5.15.2026070915\HBuilderX\plugins\amazon-corretto\bin\keytool.exe' `
  -genkeypair -alias lingshanvisitor -keyalg RSA -keysize 2048 -validity 36500 `
  -keystore 'D:\secure-signing\lingshan-visitor.keystore'
```

管理要求：

- 文件必须放在 Git 仓库外，并至少保留两份加密备份。
- 密码放入密码管理器或 CI Secret，不写入代码、文档、命令脚本或聊天记录。
- 使用 RSA 2048；alias 建议只使用英文和数字。
- 按 DCloud 当前说明，key password 与 keystore password 保持一致。
- 记录 alias、SHA-1、SHA-256 和到期日；正式发布不得使用 debug keystore。

官方资料：

- [DCloud Android 证书生成说明](https://ask.dcloud.net.cn/article/35777)
- [Android 应用签名与密钥管理](https://developer.android.com/studio/publish/app-signing?hl=zh-cn)

## 4. 图标、启动页和 Android 包

图标和启动页不是“领取”的凭证，需要由设计稿导出。Android PNG 图标至少准备：

- hdpi：72×72
- xhdpi：96×96
- xxhdpi：144×144
- xxxhdpi：192×192

当前已从 `desktop/assets/icons/icon-master.png` 生成 Android 72/96/144/192、iOS 1024、HarmonyOS/页面品牌图和原生 tabBar 图标，可用于本地测评。UI 定稿后仍应统一复核安全区、圆角遮罩、启动页、商店截图与宣传图。

Vapor 当前没有可用于 Android Studio 本地独立打包的已发布离线 SDK。`launch app-android --compile true` 只验证原生资源和 Vapor 字节码，不会产生可安装 APK；`android_base.apk` 是通用基座，也不能交付。

正式 APK 最小材料：DCloud AppID、有权限的 DCloud 账号、最终 applicationId、release keystore 四项信息、版本号、APK 格式、图标、ABI、原生模块和权限配置。模拟器若为 `x86_64`，打包时必须包含该 ABI；普通真机通常使用 `arm64-v8a`。

- [uni-app x 云打包](https://doc.dcloud.net.cn/uni-app-x/tutorial/app-package.html)
- [HBuilderX CLI 云打包](https://hx.dcloud.net.cn/cli/pack)
- [uni-app x Android 离线 SDK 状态](https://doc.dcloud.net.cn/uni-app-x/native/download/android.html)

云打包会把构建材料发送给外部 DCloud 构建服务。本项目当前未执行云打包；应先解决 AppID 冲突并选择云证书或自有 keystore，再单独执行。

## 5. 腾讯位置服务统一入口

- [腾讯位置服务控制台：应用与 Key](https://lbs.qq.com/dev/console/application/mine)
- [账户配额与商业授权](https://lbs.qq.com/dev/console/quotaImprove)
- [WebService 签名、白名单和 SK](https://lbs.qq.com/service/webService/webServiceGuide/getSig)

建议在同一个“灵山AI导游”应用下创建隔离 Key：Web、微信/WebService、Android、iOS。分 Key 便于限制权限、泄露隔离和轮换，但调用额度仍按账户下全部 Key 共享。

## 6. Web/H5 Key

- [腾讯 JavaScript API GL 入门](https://lbs.qq.com/webApi/javascriptGL/glGuide/glBasic)

测评用 Web Key 已填写：

```text
visitor-app/manifest.json
web.sdkConfigs.maps.tencent.key
```

当前腾讯控制台域名白名单只配置了 `www.shuzhiyouzong.cn`。本地 `localhost/127.0.0.1` 或其他 H5 域名可能因此鉴权失败；开发期建议使用隔离的开发 Key，生产 Key 只保留实际 H5 域名。不要把 WebService 的 Secret Key 写进前端。

## 7. 微信小程序

微信原生 `<map>` 组件绘制底图、marker 和 polyline 时，不需要腾讯位置服务 WebService Key。只有 POI 搜索、地址解析、距离计算和腾讯算路等数据服务才需要 Key。

- [腾讯位置服务微信小程序 JavaScript SDK](https://lbs.qq.com/miniProgram/jsSdk/jsSdkGuide/jsSdkOverview)
- [小程序调用 WebService API](https://lbs.qq.com/service/webService/webServiceGuide/miniprogram)
- [腾讯位置服务小程序 FAQ](https://lbs.qq.com/faq/miniprogramFaq/wxJsSdk)
- [微信公众平台](https://mp.weixin.qq.com/)
- [微信小程序网络规则](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)

如果小程序前端直接请求腾讯接口，需要在微信公众平台的 `开发管理 → 开发设置 → 服务器域名 → request 合法域名` 添加：

```text
https://apis.map.qq.com
```

生产环境更建议：小程序只请求本项目的 HTTPS 后端，由后端保存腾讯 WebService Key/SK 并调用腾讯接口。这样 Key/SK 不会进入可被提取的小程序包，微信后台也只需配置本项目 API 域名。

微信后台当前 `request` 合法域名已包含 `https://api.shuzhiyouzong.cn` 与 `https://apis.map.qq.com`，`uploadFile` 合法域名也已配置为 `https://api.shuzhiyouzong.cn`。若音频或文件改为 `uni.downloadFile`，还应同步配置 `downloadFile` 合法域名。

当前开发 API 为 `http://127.0.0.1:5178`，只适合电脑开发者工具；Pura 90/Android 模拟器可使用局域网地址。生产地址为 `https://api.shuzhiyouzong.cn`。2026-08-14 已为该子域签发独立 Let's Encrypt 证书，并将 `/api/*` 反向代理到 `127.0.0.1:5178`；严格 TLS 下的健康检查、双景区地图、数字人、问答、讯飞 TTS、讯飞 ASR、语音文件上传与 SSE 均已通过公网验证。服务器配置、回滚步骤及只读复检脚本位于 `deploy/`。

## 8. Android Key

- [腾讯 Android 地图 SDK Key 申请与配置](https://lbs.qq.com/mobile/androidMapSDK/developerGuide/getKey)

测评 Key 已勾选地图 SDK，并绑定 `com.scenic.guide.visitor`；manifest 也已填写。若应用还要使用 SDK 内检索功能，同时启用 WebService API。正式发布前建议拆分平台 Key 并复核包名、额度和授权。填写位置：

```text
visitor-app/manifest.json
app-android.distribute.modules.uni-map.tencent.key
```

## 9. iOS Key

- [腾讯 iOS 地图 SDK Key 申请与配置](https://lbs.qq.com/mobile/iOSMapSDK/mapGuide/introKey)

测评 Key 已写入 iOS 配置；正式打包前仍需冻结 iOS Bundle Identifier，并在腾讯控制台绑定完全一致的标识。填写位置：

```text
visitor-app/manifest.json
app-ios.distribute.modules.uni-map.tencent.key
```

## 10. HarmonyOS 地图

DCloud 当前文档要求在原生 Harmony 配置中使用 `TENCENT_MAP_KEY`：

- [DCloud uni-app x 模块、权限与 Harmony 地图配置](https://doc.dcloud.net.cn/uni-app-x/collocation/manifest-modules.html)

项目已经预留：

```text
visitor-app/harmony-configs/entry/src/main/module.json5
module.metadata[name=TENCENT_MAP_KEY].value
```

腾讯控制台当前 Key 编辑界面已经明确显示“地图 SDK（Android/iOS/HarmonyOS NEXT）”，并允许按 appIdentifier 授权；项目的测评用 `TENCENT_MAP_KEY` 已填写。正式发布前仍应向 DCloud/腾讯确认该 Key 对 uni-map Harmony 实现、配额和商业授权的要求；腾讯 WebService 的 POI/路线数据继续建议由本项目后端代理。

另外，当前腾讯地图原生库中的 `libmapengine.so` 只有 `arm64-v8a`，Pura 90 模拟器是 `x86_64`，地图页可能不兼容；地图最终应在 arm64 HarmonyOS 真机验收。

## 11. 填写前的最终清单

- [x] 团队负责人创建并保存 DCloud AppID。
- [x] 测评包已统一使用 `com.scenic.guide.visitor`（iOS 正式 Bundle ID 仍需在打包前复核）。
- [ ] 确认唯一 DCloud AppID，解决 manifest 与控制台截图不一致。
- [ ] 选择并备份 DCloud 云证书，或在仓库外生成并备份 Android release keystore。
- [x] 已复用桌面端品牌图标生成各端测评图标。
- [x] 已配置测评用腾讯地图 Key；正式发布前建议拆分平台 Key。
- [ ] 在后端环境变量保存 WebService Key/SK，前端不保存 SK。
- [ ] 修复公网 API 的 TLS 证书与 nginx `/api/*` 反向代理；微信 request/uploadFile 已配置。
- [ ] 公开发布前与 DCloud/腾讯复核 HarmonyOS Key、额度和商业授权。
- [ ] 明确授权后再执行 DCloud Android 云打包。
- [ ] 正式商业发布前核对腾讯位置服务商业授权和调用额度。
