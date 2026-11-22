# Android 导游从系统设置返回后的形象渲染

## 复现基线

MuMu Android 12，HBuilderX 5.24 的 uni-app x Vapor 基座。选用「春和」Live2D 和标准动效。在 AI 导游已显示人物时打开 Android 系统输入法设置，再用系统返回回到导游。旧版返回 17 秒后，舞台右侧能同时辨认出两道头顶、两层领口和重合的手臂。[修复前实拍](evidence/android-live2d-resume/before.webp)

## 最终包实测

修复前后对照均取自 MuMu 返回后第 17 秒。右侧为最终修复包，模型保持原有取景比例，头发、领口、手臂各只有一层。[并排对照](evidence/android-live2d-resume/comparison.webp) · [修复后原图](evidence/android-live2d-resume/after.webp)

| 验收项 | 实际结果 |
| --- | --- |
| 五次独立冷启动 | 每次强制停止基座后重新进入导游。五次在进入系统设置前均加载了真实 Haru。以同页历史请求为起点，前三次约 0.64–0.70 秒后发出舞台页面请求。另两次初检无原生 WebView，约 7.1 秒后自动发出请求，随后画布达到 552×846，三张纹理加载成功。 |
| 从系统设置返回 | 五个冷进程各做一次，随后同进程再做一次。每轮检查 1、2、5、10、17 秒的舞台，均可见一位活动人物。检查轮廓、眼睛及脸部的连续画面，并从 WebView 读取画布尺寸、纹理与模型加载状态。 |
| 减少动态效果 | 开启后显示单张立绘。恢复标准动效后，设置中重新显示「Live2D 模型在线」，画布加载了一个模型与三张纹理。 |
| 系统输入法与文字提交 | 在系统设置和输入法选择器往返后，用 226dp 高的测试输入法输入 Scenic，并在键盘展开时点击发送。本机模拟问答及 TTS 均返回 200。提交后即刻及 2、5、10、17、26 秒的截图中持续只有一人，真实模型和纹理仍在。[发送后实拍](evidence/android-live2d-resume/ime-submit.webp) |
| 服务端与构建 | Android Vapor 编译并在 MuMu 运行。共享消息处理代码通过 iOS Vapor 编译，仅记录编译结果。服务端数字人集成和静态资源路径用例通过，同源桥脚本可取。Chromium 实际加载 Cubism，并验证真实模型早于桥就绪、模型请求 404、重复查询及 H5 iframe 通信。 |

中间构建曾在冷进程出现空舞台。对应时段没有模型 HTTP 请求，原生视图树里也没有 WebView；在另一轮中抓到的成功画布不能替这次结果作证。此后增加了宿主就绪及单次重建，再从零开始统计上表。Android 结论限于本次 MuMu 配置，微信真人音量、Android 厂商真机与鸿蒙不计入上述次数。

[六次返回的连续画面](evidence/android-live2d-resume/return-sequence.webp) · [恢复后的模型状态](evidence/android-live2d-resume/model-status.webp) · [每轮测量、源码与构建指纹](evidence/android-live2d-resume/results.json)

结束时已复核原基座校验值，恢复默认和已启用的输入法，卸载临时测试键盘，关闭本机测试后端并撤销测试端口映射。MuMu 已恢复到测试前的关机状态。正式部署时应同步应用页面与服务端 Live2D 静态资源，包含编译后的 runtime.js 和同源 SDK。

## 修复范围

在 Android 上，原生立绘和透明 Live2D WebView 由同一条件互斥显示。WebView 在宿主页面就绪后挂载。若第一次挂载没有收到任何加载或消息回调，前台只补挂一次；仍然失败时提供立绘和手动重试。已有舞台从后台恢复时，宿主只查询当前状态。DCloud 消息桥在模型和原生宿主之间传递就绪、失败及当前播放事件，宿主按实际收到的 JSON 字段取值。[页面](../../../visitor-app/pages/ai-guide/index.uvue) · [消息桥](../../../server/src/web/live2d/runtime.ts) · [SDK 来源和许可证](../../../server/src/web/live2d/THIRD_PARTY_NOTICES.md)

## 手工复跑

1. 在安装修复版的 Android 基座打开 AI 导游。让 App 和 WebView 同时能够访问测试后端。检查设置中的「Live2D 模型在线」，关闭设置并观察人物的眼睛、头发或身体在相邻帧中的变化。
2. 用系统设置打开输入法管理，或用 ADB 执行 `adb shell am start -a android.settings.INPUT_METHOD_SETTINGS`，再通过系统返回回到 App。记录返回即刻及 1、2、5、10、17 秒的舞台。系统 Activity 收起时的过渡帧单列。
3. 强制停止测试基座，重新进入导游并重复以上过程。另在同一进程中再做一次往返。每次核对一个动态人物、有效画布及真实模型加载状态。空舞台或仅有立绘均不能通过动态模式验收。
4. 启用能够显示实际系统键盘的测试输入法，从系统设置返回，打开「打字」，输入文字，保持键盘展开并点「发送」。核对问题已提交、字幕有回答、人物持续可见。测试结束恢复输入法和原基座。
5. 打开「减少动态效果」，观察单张立绘；关闭后核对模型重新上线。模拟模型失败的独立回归可在安装 Playwright 和 Chromium 后执行 `python server/scripts/test-live2d-bridge.py`，覆盖模型 404、桥晚到和重复查询。
