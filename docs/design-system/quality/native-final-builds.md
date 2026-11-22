# 最终 Android 与 iOS 目标构建

2026-11-22 使用已安装的 HBuilderX 5.24、uni-app x Vapor 字节码工具链。两个临时目录从同一工作树复制，保留仓库原始生产连接配置。使用已运行的 HBuilderX 构建器的 SDK、Node、编译器入口和路径，分别设置 Android/Kotlin 和 iOS/Swift 模拟器目标，两个目标独立编译、独立缓存。完成后将每一份输入的相对路径及 SHA-256 与当前 visitor-app 核对。共 395 份源输入一致，统计时跳过 .git、.hbuilderx、node_modules 与 unpackage。[输入摘要、输出摘要及检查项](evidence/native-final-builds.json)

| 项目 | Android | iOS 模拟器目标 |
| --- | --- | --- |
| 编译器 ready 日志 | 10 页，39,946 ms，91 个 .bytes | 10 页，34,916 ms，61 个 .bytes |
| 景点分包摄影 | 6 张详情与 6 张缩略图逐字节匹配 | 同样的 12 份文件均逐字节匹配 |
| 原生桥 | scenic-motion-preference 调试 dex 1,032 B，scenic-form-label 调试 dex 2,380 B，两个 JS 调用代理均存在 | 两个 Android 专属调用和 dex 均正确排除 |
| 语音与舞台 | JS 含语音问答 multipart 文件与 locale、英文录音提示、WebView 舞台 locale/theme/motion、大字建议短标题 | 相同断言全部通过 |

照片核对覆盖灵山梵宫、九龙灌浴、五印坛城、拈花塔、五灯湖广场和祥符禅寺。详情位于 pages/spot/static，缩略图位于 static/destinations。原生编译器对 Web role、tabindex 和部分 ARIA 属性仍发出不支持的警告。Android 三个表单字段的可访问性关联有独立的原生节点验证。[表单原生节点与系统显示实测](android-followup.md)

MuMu Android 12 另运行同版的回环 API 测试副本，应用语言选为 English。在 AI Guide 开始录音，实际出现计时、Send audio 和 Cancel recording。按 Android Home 键切后台，再回到应用，录音已结束，恢复可用的 Record 入口，原生五个标签继续显示英文。从拈花湾热门目的地打开五灯湖广场，实际加载分包实景摄影。测试结束后恢复简体中文、灵山、浅色模式与原录音权限。[录音中](evidence/android-followup-final-record-en.webp) · [返回前台](evidence/android-followup-final-resume-en.webp) · [五灯湖广场](evidence/android-followup-final-wudeng.webp)

英文语音的真实 HTTP 路由与讯飞首帧语言另有合成 PCM 测试。本轮模拟器的后台切换测试未将录音发往商业服务。Windows 构建的 iOS 结果限于模拟器目标代码与资源生成，尚无 Xcode 运行、签名、VoiceOver 和 Apple 真机结果。本轮未启动鸿蒙宿主。[语音语言边界测试](guide-locale-verification.md)

在具备 HBuilderX 编译服务的机器，从根目录将 visitor-app 的绝对路径传给 cli.exe。Android 使用 `launch app-android --project <目录> --compile true`，iOS 使用 `launch app-ios --project <目录> --iosTarget simulator --compile true`。核对 unpackage/dist/dev/app-android 和 app-ios 中的 app-service.js、bytes、目标模块和图片。输入摘要按 UTF-8 编码，对排序后的每条「相对路径 + NUL + 文件 SHA-256 小写十六进制 + LF」连接后再计算 SHA-256。[工程验收入口](release-checklist.md)
