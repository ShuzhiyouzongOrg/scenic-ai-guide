# 动效参数与中断

依据[来源规则 MOT-01–07](../references/source-index.md)。先写交互完成的证据，再选动效。点击、录音结束、清除选点立即改变业务状态；动画仅说明刚发生的变化。

[机器源](../../../visitor-app/design/tokens.json)生成同名 Sass 变量与两种 transition mixin。四类组件按压共用[实现](../../../visitor-app/design/press.scss)。时长与幅度是项目可校准的初始数值。下表“复核”指可执行验收，当前已经运行过的路径单列于[实测](../quality/motion-source-verification.md)。

| ID / 参数与范围 | 原因与用法 | 例外与复核 | 原始出处 |
| --- | --- | --- | --- |
| TIM-01 immediate 0ms / fast 120ms | 按下立即确认，放手后 fast 恢复局部透明度。pressed 中断正在进行的恢复 | 录音停止、地图点选等业务动作立即执行；按下、取消、再次按下时只剩当前态 | [EM Button press][button] |
| TIM-02 normal 200ms / medium 280ms | 短内容更换或确需说明空间关系的面板才用较长档位 | 快速反向、切 tab 后不能出现迟到的旧层；拖动跟手不用补间 | [EM Interruption][interrupt] |
| TIM-03 page 320ms / delay 0ms | 自定义导航的时长上限；输入反馈不人为等待 | 使用系统导航时不加第二段入场；真机复核返回、键盘与快速切换 | [Apple Motion][hig] |
| TIM-04 arrive / depart / direct | ease-out 对应到位、ease-in 对应移除、linear 对应直接变化；跟手动作不使用惯性曲线。跨端使用宿主支持的 CSS 关键字 | 开始动作时立即可取消，收尾不延迟输入；Web 查看 computed style，Vapor 检查编译诊断 | [EM Easing][ease] |
| TIM-05 pressScale 0.98 / pressedOpacity 0.76 / translation 8px | 位移及缩放只作必要小部件的幅度预算；游客卡片仅改变透明度，避免正文在读时缩小与重排 | 不在地图、朗读或正文叠加位移。减少动态时保持同一文字与热区 | [DMP Accessibility][access] |
| TIM-06 press-release / instant | 前者为 opacity + fast + arrive，后者为 opacity + immediate + direct，共享零延迟。sg-choice、sg-service-row、sg-editorial-card、spot-card 松手时取前者，按下或减少动态时取后者 | 按下 0.76，取消回 1；标准模式恢复为 120ms，减少动态全程 0ms。动画中重复点击不会推迟原业务回调 | [EM Recipes][button]、[DCloud transition](https://doc.dcloud.net.cn/uni-app-x/css/transition.html) |
| TIM-07 系统与本机偏好 | 系统要求减少动态或用户明确开启时取静态反馈。没有可信 OS 接口的宿主第一次使用静态模式。选项值保存在本机；反馈不能强制抵消系统限制 | 系统开关、应用开关、重载、退出再进入分别核对；跨端取样和能力边界见实测 | [DMP Respect User Preferences][access]、[Apple Motion][hig] |

系统键盘、导航、地图相机、音频时钟和加载超时均由宿主或业务服务管理。CSS opacity 的恢复只描述视觉状态。没有新增动画运行库。UI 中不逐帧改变大面积尺寸、模糊或阴影。

[button]: https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/animate/RECIPES.md#button-press
[interrupt]: https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/animate/SKILL.md#6-interruption-and-exit
[ease]: https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/animate/SKILL.md#5-easing-and-duration--or-a-spring
[hig]: https://developer.apple.com/design/human-interface-guidelines/motion
[access]: https://github.com/kylezantos/design-motion-principles/blob/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3/skills/design-motion-principles/references/accessibility.md

## 减少动态与质量判定

design/motion.uts 提供 reducedMotion、用户偏好和初始化。Web 监听 prefers-reduced-motion 的即时变化。Android 在启动和回到前台读取系统动画启用状态，标准基座缺失桥时取静态。iOS 原生 UTS 读取 UIKit 系统偏好，缺失桥时取静态；微信新安装默认轻量动效。导游设置和个人页共享保存的选择，系统已开启减动时只显示原因。静态模式保留录音、等待、暂停等文本，关闭装饰循环、自动位移、口型装饰与页面叠加动画；真实媒体的用户控制保留。系统转场由平台管理。检查打开、关闭、App 重启、切后台四条路径。

每个效果审核四次：快速重复输入验证末态；中途返回验证旧回调不会复活；关动画后仅看文字完成任务；在地图/键盘/低端机负载下观察输入是否延迟。存在请求竞态时先修业务所有权与取消；增加时长不能修复竞态。这里的毫秒值是实现基线，真机通过前保留校准状态。[情境配方](motion-principles.md)
