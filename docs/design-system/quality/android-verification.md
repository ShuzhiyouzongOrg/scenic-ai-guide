# Android Vapor 模拟器复核

2026-11-22，HBuilderX 5.24 的标准 uni-app x 调试基座。MuMu Android 12、ADB 设备 127.0.0.1:16384，1080×1920、480dpi，约 360×640 逻辑像素。使用设备自带导航、原生文本/图层与 Vapor 字节码。另试过 Pixel AVD，其 x86 加速驱动缺失，转用 MuMu 完成本轮检查。

源工程复制到独立测试目录。测试副本只把 API 主机替换为 http://127.0.0.1:5178，通过 adb reverse 转发至使用内存数据的项目服务。仓库配置仍为原 HTTPS 入口。标准基座启动后从模拟器屏幕采集 PNG，再等比缩小保存 WebP。以下界面通过点击原生 tabBar 切换。

| 页面 | 观察与修正 | 实际截屏 |
| --- | --- | --- |
| 首页 | 两个景区、实景照片和功能入口在竖屏可见。修正 CSS 计算式被 Vapor 丢弃导致标题挨着状态栏的问题；改读运行时窗口并在回到页面时更新 | [浅色](evidence/android-home.webp) · [系统暗色](evidence/android-home-dark.webp) |
| 地图 | 检查了手绘底图、路线与实际 47 个景点的数据。点击点位可展开同名详情，选点后的文字方向修正。取消后恢复地图 | [手绘导览](evidence/android-map.webp) · [选择九龙灌浴](evidence/android-map-selected.webp) |
| AI 导游 | 无商业凭据时显示真实的数字人降级状态、重新连接、建议问题、停止/文字输入入口。模拟器静态截图证明排版和降级；语音事件另有[交互测试](guide-verification.md) | [AI 页面](evidence/android-ai-guide.webp) |
| 行程 | 根页滚动容器、时长与兴趣、提交操作正常显示，视觉上有明确的已选勾形。拖动、恢复与保存的业务回归另见[行程验收](travel-page-verification.md) | [行程](evidence/android-trip.webp) |
| 我的 | 本机身份、导航数据和设置入口可见。与原生底栏无重叠 | [个人中心](evidence/android-profile.webp) |

将该模拟器切至系统夜间模式，首页背景采样为 RGB(17,26,22)，深色 tab 图标与页面同步。检查结束后恢复原系统夜间设置。模拟器使用宿主合成层，UIAutomator 快照稳定提供五个原生导航标签；读屏是否能逐项操作正文和每个自绘区域仍需 TalkBack 实机验收。原生编译器会忽略部分 Web ARIA 标记，不能以 H5 键盘通过代替该验证。

使用标准基座的运行与签名 APK、真机麦克风、室外 GPS、物理设备 GPU 帧时间分开记录。上述截图不构成签名发行或商业数字人服务验收。
