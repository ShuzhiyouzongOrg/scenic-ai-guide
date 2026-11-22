# 动效、偏好与规则来源复核

2026-11-22。用本机真实页面测量按压和减少动态，另外隔离测试了各端可查询的系统偏好。时长为项目初始设计值，低端真机 GPU 负载仍需单独量测。

## 同源参数与网页实测

- [唯一参数源](../../../visitor-app/design/tokens.json)生成 Sass 的 immediate/fast/normal/medium/page、delay、scale、opacity、位移、三种 easing 和 press-release/instant 两种属性配方；UTS 接收给原生触摸事件的逻辑毫秒值。生成器拒绝引用未定义 duration 或 easing 的配方。四个共享组件使用同一个 [press.scss](../../../visitor-app/design/press.scss)。
- HBuilderX 5.24 H5，Playwright Chromium 151.0.7922.34 与 WebKit 26.5。打开真实 Home 的 sg-choice，默认测得 opacity、120ms、ease-out、delay 0ms。Chromium 经 DevTools Protocol 发送实际 touchStart，透明度为 0.76、过渡 0ms；touchCancel 恢复为 1。切换操作系统媒体偏好后，两种引擎均立即改用 0ms 与 linear。
- 从真实 Profile 打开减少动态，把系统偏好切回标准，再刷新。两个引擎仍为 0ms。触发行程推荐，测试只延迟这一次回环服务请求。正在生成的按钮有文字、aria-busy=true 与 aria-disabled=true，旋转加载组件计数为 0。注入 503 后按钮重新可用；返回设置关闭项目偏好后恢复 120ms。两种引擎均未发生未捕获页面异常。[逐项读数](evidence/motion-preferences.json) · [实际等待状态](evidence/motion-busy-chromium.png)
- 对照原始 Skill 时使用固定的 EM、DMP 文件、主题标题和 Git blob。CMP、INT、TIM、FX、VOC、REV、ENG 标识就在各规则旁。基础、视觉资源、页面及平台使用[逐条来源表](../references/rule-provenance.md)。检查命令同时检查 Markdown 行内和命名引用，以及规则来源字段；内容与原文语义仍需人工复审。

## 宿主差异

| 平台与具体依据 | 当前工程行为与实测范围 |
| --- | --- |
| Web。[媒体查询规范](https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion) | 初次读取及订阅系统 query.change；用户显式开启与系统要求取并集。上表已在两种浏览器验证热切换及本机保存。 |
| Android。[ValueAnimator.areAnimatorsEnabled](https://developer.android.com/reference/android/animation/ValueAnimator#areAnimatorsEnabled())、[UTS 与 Vapor 原生边界](https://doc.dcloud.net.cn/uni-app-x/uts/) | 项目自有 Android UTS 插件，API 26 起在冷启及 onAppShow 读取系统。旧系统及缺失桥默认静态。Android 12 MuMu 中以 HBuilder 生成的 Kotlin 入口制作临时 QA Activity，依次设 animator_duration_scale 为 1、0、1，原生桥实际返回 false、true、false，恢复原始未设置状态并卸载 QA 应用。Android Vapor 全工程可生成应用字节码与 1,032 B 调试 classes.dex；正式标准基座装入 10 页产物后，在 refreshSystemMotion 临时观测实际 JS 返回；两次冷启把 scale 设为 1/0，读到 Boolean false/true。再给同一调用注入异常，应用启动并取静态 true。结束时原 app-service.js 哈希、系统原值与临时存储均已恢复。[标准基座测量](evidence/android-motion-preference.json) |
| iOS。[UIKit 偏好](https://developer.apple.com/documentation/uikit/uiaccessibility/isreducemotionenabled) · [UTS 原生插件](https://doc.dcloud.net.cn/uni-app-x/plugin/uts-plugin.html) | 先前 5.24 独立探针提示标准基座部署自定义插件需要相应基座，此为当时工具链观察。本轮已添加 [app-ios 实现](../../../visitor-app/uni_modules/scenic-motion-preference/utssdk/app-ios/index.uts)，启动及回前台读取 UIAccessibility.isReduceMotionEnabled，失败时静态。Windows 无法观察 iPhone 系统值；请在有签名基座上切换系统设置、返回应用，核对界面与用户保存的偏好。 |
| 微信。[官方 API 类型中的 SystemSetting](https://github.com/wechat-miniprogram/api-typings/blob/e5dc50ccea71e7999a8aa8a942a6f68045e141ca/types/wx/lib.wx.api.d.ts#L13351-L13364)、[MediaQueryObserver 描述符](https://github.com/wechat-miniprogram/api-typings/blob/e5dc50ccea71e7999a8aa8a942a6f68045e141ca/types/wx/lib.wx.api.d.ts#L8542-L8557) | 设备设置列出蓝牙、方向、定位、Wi-Fi，媒体观察器只接受尺寸和方向。基线微信使用静态默认。本轮调整为新安装启用轻量状态反馈；已明确保存的本机开关优先，导游设置与个人页操作同一值；不从方向、系统字号或读屏状态猜测用户的动效偏好。 |
| HarmonyOS | 本轮依用户要求跳过平台测试。 |

Android 插件只调用系统 SDK，属于项目自产源码，零第三方运行库、无网络和新增权限。HBuilderX 开发环境首次构建原生 UTS 模块需官方 uniapp-runextension 和 uts-development-android 编译工具。它们不计入应用；上表 DEX 字节数是本机调试产物。完整 APK 体积、签名、iOS 自定义基座均按各自发行流程验证。如后续直接统一 SDK 提供等效查询，可替换此适配层并用相同开关序列复测。

## 复跑

本阶段修改 Token 源及生成器、press.scss、motion.uts、App 前台回调、Android 偏好插件、四个按压组件及 sg-button。知识库同时更新了组件、动效、交互、工程、来源目录和三个项目 Skill。两组独立 H5 工程副本在 5156、5163 回环端口分别通过双引擎回归。交付前一次离线校验检查了 124 个规则 ID 和具体来源位置、两份源档案 54 个 Git blob、130 条本地关系；Codex 强制重扫发现五个 repo scope 入口。[检查代码](../../../scripts/check-design-system.py) · [回归脚本](../../../scripts/verify-visitor-motion.py)

先按 [H5 环境说明](web-verification.md) 启动仅监听本机的游客 H5 和同仓 API，安装 Python Playwright 对应的 Chromium/WebKit。依赖是测试工具，不打入移动端。回归默认请求 127.0.0.1，也接受其他回环端口。

```powershell
node scripts/design-tokens.mjs --check
python .agents/skills/motion-design/scripts/verify_upstream.py
python scripts/check-design-system.py --codex
python scripts/verify-visitor-motion.py --output "$env:TEMP/scenic-motion-evidence"
```

Android 系统对照需专用测试设备，先记下 `adb shell settings get global animator_duration_scale`；在 1 和 0 下分别带着 app 返回前台验证。结束按原值恢复，原值为 null 时 delete 该键。普通服务连接状态、重复点击、中断与语音/地图的其余回归见[导览验证](guide-verification.md)。
