# 设计决策与来源索引

基线为 2026-11-21。每条记录说明要解决的问题、在 Scenic AI Guide 中的适用边界及复测办法。本表是项目原创规范的来源记录。交付功能的实际实现与实测状态分别在各页面规范和发布记录中维护。

## 来源及定位

| 代码 | 固定入口与可定位的资料 | 适用范围 |
| --- | --- | --- |
| ADS | [Apple Design Skill 入口](https://github.com/dickwu/apple-design-skill/blob/91e15664896f6f27e75dcf1414d1226cb95fa167/SKILL.md) · [跨平台词汇](https://github.com/dickwu/apple-design-skill/blob/91e15664896f6f27e75dcf1414d1226cb95fa167/references/cross-platform.md) | 组件路由、轻重分级、证据及平台适配 |
| EM | [Animate 步骤](https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/animate/SKILL.md) · [组件示例](https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/animate/RECIPES.md) | 频率、目的、属性、进退场、中断和减少动态效果 |
| DMP | [创建工作流](https://github.com/kylezantos/design-motion-principles/blob/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3/skills/design-motion-principles/workflows/create.md) · [审查工作流](https://github.com/kylezantos/design-motion-principles/blob/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3/skills/design-motion-principles/workflows/audit.md) · [过度动画实例](https://github.com/kylezantos/design-motion-principles/blob/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3/skills/design-motion-principles/references/anti-checklist.md) | 动效场景权重、可访问性、性能、按影响审查 |
| HAS | [HIG Agent Skills 路由](https://github.com/justinwetch/HIGAgentSkills/blob/2206ff935b4affa9ad249a5399a3e8e29f5f6edd/routing-index.md) · [证据格式](https://github.com/justinwetch/HIGAgentSkills/blob/2206ff935b4affa9ad249a5399a3e8e29f5f6edd/references/enforce-format.md) | 任务匹配和观察证据，供参考 |
| SPEC | [HIG Spec 项目与资料来源](https://github.com/HIG-Spec/hig-spec.github.io/blob/7348b029fa61283fc1ee7f53f79b72d829cc3840/README.md) · [授权边界](https://github.com/HIG-Spec/hig-spec.github.io/blob/7348b029fa61283fc1ee7f53f79b72d829cc3840/THIRD_PARTY.md) | 组件几何、资料与渲染器的区分 |
| HIG | [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/) · [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) · [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) · [VoiceOver](https://developer.apple.com/design/human-interface-guidelines/voiceover) · [Color](https://developer.apple.com/design/human-interface-guidelines/color) | 触摸目标、信息结构、平等替代、语义色 |
| HIG-I | [Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures) · [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets) · [Motion](https://developer.apple.com/design/human-interface-guidelines/motion) · [Generative AI](https://developer.apple.com/design/human-interface-guidelines/generative-ai) | 手势、非模态查看与模态操作、动效目的与 AI 用户控制 |
| RIGHTS | [Apple 设计资源](https://developer.apple.com/design/resources/) · [SF Symbols](https://developer.apple.com/sf-symbols/) · [SF Symbols HIG](https://developer.apple.com/design/human-interface-guidelines/sf-symbols) · [字体](https://developer.apple.com/fonts/) | 权利、平台适用范围、视觉重量；下载件的具体检查见完整性审计 |
| AA | [WCAG 2.2 SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [Android Accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps) | 项目采用的对比度门槛与 Android 触控参考 |

## 项目规则与复测

| ID | 目的与适用场景 | 项目实现或约束 | 检查方式 | 依据 |
| --- | --- | --- | --- | --- |
| HIG-01 | 五个根入口始终表达当前所在位置 | 固定栏目次序、图标语义和可读文字；详情使用返回导航；点击录音是页内动作 | 逐个进入栏目再下钻、返回，检查活动栏和历史栈 | ADS 的 Navigation structure；HIG。[原始依据](https://developer.apple.com/design/human-interface-guidelines/tab-bars) |
| HIG-02 | 离开主屏幕后依然能一次点中小图标 | 按钮默认至少 44×44 逻辑单位；Android 高频独立控件争取 48dp；以外层操作区扩展图形的触控范围，避免相邻区域重叠 | 在窄屏沿控件四角点击，验证对应动作及旁边控件 | HIG Buttons；AA Android；项目尺寸适配。[原始依据](https://developer.apple.com/design/human-interface-guidelines/buttons) |
| HIG-03 | 地图、收藏及语音状态在弱视或无色条件下仍可识别 | 同步文字、图形及语义角色；选中、禁用或错误状态通过明确描述呈现 | 在灰阶、暗色及系统读屏环境完成选择和撤销 | HIG Color、VoiceOver；ADS 的 Accessibility。[原始依据](https://developer.apple.com/design/human-interface-guidelines/voiceover) |
| HIG-04 | 多语言和放大字号能读完关键内容 | 采用宿主系统字体和语义字号；标题、操作词、错误提示可换行；标题和图片可分成独立区域 | 放大系统文字、使用长字符串与最窄支持宽度，检查截断和遮挡 | HIG Accessibility；ADS 的 Typography 及 Cross-platform。[原始依据](https://developer.apple.com/design/human-interface-guidelines/typography) |
| HIG-05 | 户外强光和景区摄影仍能读清 | 正文目标 4.5:1，大字至少 3:1；按实际背景测量；不可控照片上的重要文字迁到实色底或使用可实测的稳定遮罩 | 在明暗外观及最亮/最暗代表照片抽样测量 | HIG Color；AA SC 1.4.3。[原始依据](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) |
| HIG-06 | 用户能同时理解点位与地图方位 | 查看点位使用非模态信息区；展开与收起都有可见按钮，保留地图互动空间；确认有影响的编辑时才采用模态控件 | 点两个相邻点位、缩放、收起、再选择，确认点位与卡片一致 | HIG-I Sheets、Gestures；项目地图状态。[原始依据](https://developer.apple.com/design/human-interface-guidelines/sheets) |
| HIG-07 | 手势不可用时仍能修改行程 | 拖动绑定稳定条目 ID，保留可点按的上移/下移或等价操作；取消中途手势时恢复上次已提交顺序 | 仅用点击及读屏重排，再用拖动和取消复测一次 | HIG-I Gestures；项目行程存取。[原始依据](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop) |
| HIG-08 | 游客能知道语音助手何时在听、处理或播放 | 文案取录音、请求、播放与暂停的真实状态；仅对有事件/接口支持的动作开放入口，停播与取消提供明确结果 | 录音授权被拒、网络失败、切页、播放完成或中断，检查界面与实际声音 | HIG-I Generative AI；项目 SDK。[原始依据](https://developer.apple.com/design/human-interface-guidelines/generative-ai) |
| HIG-09 | 加载、空结果与故障有不同后续动作 | 加载维持布局并提示等待；空结果给出换条件等动作；故障给出原因或重试，保留已有可用数据 | 分别模拟首次加载、成功空结果、断网和重试成功 | ADS 的 Loading / Feedback；HIG Accessibility。[原始依据](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) |
| MOT-01 | 避免频繁切换降低操作速度 | 先写明一次动作的目的与频率；地图拖动、流式消息追加、按住录音等直接反馈至状态，常规转场只用于建立方向或层级 | 连续三次切换、滚动时点按，核对视觉时长与实际响应时刻 | EM 步骤 1–2；DMP 频率判断。[原始依据](https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/animate/SKILL.md#1-should-this-animate-at-all) |
| MOT-02 | 保持进退方向和对象关系明确 | Sheet 从同一侧进退、对话框停留中心；进入用减速，匀速限于真实进度。时长来自项目档位，原生导航若已播放，页面内容只做稳定呈现 | 录下打开/关闭各一次，逐帧检查来源与方向 | EM 步骤 4–6；HIG-I Motion。[原始依据](https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/animate/SKILL.md#5-easing-and-duration--or-a-spring) |
| MOT-03 | 中断和抢占不重复执行业务动作 | 从当前可见状态接受新目标；异步完成或旧定时器先核对当前会话/条目；手势释放、切页或销毁清理监听 | 进场一半关闭、立即再次打开，验证最后一次意图与提交次数 | EM Interruption and exit；DMP 工作流；项目回调适配。[原始依据](https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/animate/SKILL.md#6-interruption-and-exit) |
| MOT-04 | 移动设备有限资源优先保证地图与收音 | 动画以透明度和有限位移为主。定位、长列表和音频事件期间避免逐项布局动画；原生地图的手势与缩放留给地图 SDK | 在低性能设备中边缩放边选点、边录音边滚动，记录掉帧和误操作 | EM 步骤 3–4；DMP references/performance。[原始依据](https://github.com/kylezantos/design-motion-principles/blob/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3/skills/design-motion-principles/references/performance.md) |
| MOT-05 | 动晕或未开放系统偏好 API 的设备也能完成流程 | 减少动态模式直接显示结果与可用操作，必要时保留短淡变。状态提示始终带文字；没有真实音量数据时展示“录音中”和实际计时 | 同一路径用标准与减少动态分别完成，交互完成条件相同 | EM Reduced motion；DMP references/accessibility；HIG-I Motion。[原始依据](https://github.com/kylezantos/design-motion-principles/blob/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3/skills/design-motion-principles/references/accessibility.md) |
| MOT-06 | 控制注意力和视觉疲劳 | 有数据时音量波形随输入，停录立刻停止；普通 AI 标签、头像、地图点位不常驻呼吸光；一次操作只安排一个主要动效 | 静置各页、反复返回，记录仍在循环的元素和必要性 | DMP references/anti-checklist、creation-gotchas。[原始依据](https://github.com/kylezantos/design-motion-principles/blob/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3/skills/design-motion-principles/references/anti-checklist.md) |
| MOT-07 | 以结果定位问题，便于复验 | 审查每项注明页面/状态、输入、频率、原始/期望状态、触发设备、证据、影响。团队按可完成任务、识别状态、装饰问题排序 | 另一位评审按触发步骤复现，验证修正前后证据 | DMP workflows/audit；ADS review process；HAS 证据格式。[原始依据](https://github.com/kylezantos/design-motion-principles/blob/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3/skills/design-motion-principles/workflows/audit.md) |
| SRC-01 | 明确多端可分发范围 | 每个新增图片/图标记录创作者或 API 契约、许可、原路径、衍生文件。未经确认的外部资源采用项目内占位；系统字体按宿主调用 | 发布前反向检查每个文件的来源、授权范围和变体 | RIGHTS；SPEC 第三方声明。[原始依据](https://github.com/HIG-Spec/hig-spec.github.io/blob/7348b029fa61283fc1ee7f53f79b72d829cc3840/THIRD_PARTY.md) |
| SRC-02 | 让工程能力优先于第三方示例 | 在原生或 RiceUI 中实现设计目标，先核实宿主支持的属性、事件和版本；不兼容的模板作为参考。设计审查证据指向实际组件及设备 | 查看依赖 diff、构建命令、截图和操作记录，并核对候选技术是否引入 | ADS Cross-platform；DMP/EM；项目架构。[原始依据](https://github.com/dickwu/apple-design-skill/blob/91e15664896f6f27e75dcf1414d1226cb95fa167/references/cross-platform.md) |
| SRC-03 | 后续维护者能重建规则由来 | 更新时固定上游 SHA；对同一路径的 blob 对比，重新核验许可证、引用和依赖；再更新规范、项目 Skill、验证记录及页面 | 离线脚本验证两个完整源档案；Codex 列表及只读调用验证活跃入口 | 项目维护约定；HAS 发布流程思路。[原始依据](../audit/skill-integrity-audit.md) |

## 更新记录

| 日期 | 范围 | 采用或调整 | 后续复测 |
| --- | --- | --- | --- |
| 2026-11-21 | 初次审计五个 Git 仓库，核对 Apple 官方指引、设计资源和 SF Symbols 授权 | 建立 HIG-01–09、MOT-01–07、SRC-01–03；归档两份 MIT 动效库；将 Web/React 专用实现保留为上游参考 | 以设备验证结果校准时长、触摸面积和字体缩放。后续版本更新在下方追加规则增删、提交及复测结论 |

原始路径、提交及权利边界见[完整性审计](../audit/skill-integrity-audit.md)。发布阶段须逐条使用[发布核对表](../quality/release-checklist.md)记录实测设备及限制。

## 实测后的工程适配 · 2026-11-22

| ID | 来源与适用处 | 本次调整及验证 |
| --- | --- | --- |
| FND-02 | HIG-04；五页文字 | 增加可持久化的项目大号字体，避免依赖宿主是否提供字号回调。320px 实测 32→40、16→20，键盘仍可触达设置。 |
| FND-03 | [DCloud WindowInfo](https://doc.dcloud.net.cn/uni-app-x/api/get-window-info.html)；自定义标题和地图控件 | 5.24 Vapor 编译诊断指出 calc 中的状态栏变量被丢弃。窗口测量转为逻辑 px，通过 Android 真正渲染复核。 |
| NAV-01 | HIG-01、SRC-01；[原生 tab 的层级](https://developer.apple.com/design/human-interface-guidelines/tab-bars)、[工程图标源稿](../../../visitor-app/design/icons/) | 使用江南屋檐、折图、导游对话、游步路线、人物五个原创 SVG，各端 PNG 同源生成。H5 与 Android 的实拍用来核对小尺寸表达。 |
| MED-01 | SRC-01；[摄影权利记录](../assets/asset-management.md)、[功能与状态图生成记录](../assets/generated-illustrations.md) | 已核实实景摄影与 AI 生成的功能插画分别建账。功能图不充当实景或地图标定。资产更新时复核文件体积与暗色下标签。 |

参见[页面与设备证据](../quality/release-checklist.md)。

## 细分规则变更 · 2026-11-22

以 [逐条来源](rule-provenance.md) 定位 FND、IMG、ASSET、页面与 PLAT 原始依据。CMP、INT、TIM、FX、VOC、REV、ENG 在具体规则表就地附原始章节。初次补录规则级定位；上游 SHA 继承 11-21 固定版本。本次修改 TIM-01、04、06、07 及 CMP-01/15，增加命名过渡、可中断按压与减少动态实际回归。[动效与来源实测](../quality/motion-source-verification.md)

本轮新增 HOME-05/06 与 PROFILE-05，更新 GUI-AI-04 的中英文供应商首帧契约，补齐原生标签及前台恢复证据。NAV-01、MED-01 的项目决策保留独立的依据链接。所有条目在[发布检查](../quality/release-checklist.md)中使用当前源码校验；中央索引拒绝重复 ID 及缺少规则正文的条目。

## 导游舞台与语音状态球 · 2026-11-22

ORB 与 GUIDE 两组均为项目原创的可执行规则。上游 ADS、EM、DMP 的固定提交沿用本页来源表；听写和图形能力以当前工程及供应商接口复核。新规则逐条定位于[球体组件](../components/ai-ambient-orb.md)、[动效](../motion/ai-ambient-orb-motion.md)、[状态机](../interaction/ai-ambient-orb-interaction.md)、[工程接口](../engineering/ai-ambient-orb-architecture.md)，以及[导游组件](../components/ai-guide-components.md)、[舞台动效](../motion/ai-guide-motion.md)、[会话](../interaction/ai-guide-interaction.md)、[平台适配](../engineering/ai-guide-architecture.md)。各规则行记录来源、适用范围及验证。

版本更新时单独比对 DCloud 的 frameSize 与微信原生 SDK 的格式表，按实际宿主采样验证；把新增或停用的采样来源、状态语义、主题和包体变化记入本索引，保持四个项目工作流和[专项质量清单](../quality/ai-ambient-orb-checklist.md)同步。[工程审查](../engineering/ai-ambient-orb-feasibility.md)

2026-11-22 新增 GUIDE-NAV-01～04，更新 CMP-10 和导游组件职责。Apple 将顶层导航与页面操作分开；项目仅在已选 AI 的中心格做语音操作。DCloud 的系统栏隐藏和显示成功回调决定自绘导航是否挂载，普通目的地及根路由保持一致。四条规则分别记录原文、项目适配和跨端测量方法。[五个根页的导航](../components/navigation.md)

2026-11-22 更新 GUIDE-CMP-02、GUIDE-ENG-02/03 的 Android 验证方式。透明 Live2D 舞台和原生立绘以同一挂载条件选择，宿主回前台读取当前模型状态。依据为 MuMu 的系统设置往返记录及 DCloud 的网页到宿主消息协议。[导游舞台](../engineering/ai-guide-architecture.md) · [WebView 官方接口](https://doc.dcloud.net.cn/uni-app-x/component/web-view.html)

2026-11-23 补充导游收音反馈验收。微信界面中的光球与电平条复用同一显示增益，原始 PCM RMS 继续供业务与诊断读取。相同数值的连续有效分片仍应推进电平历史。验收样本包含轻声、稳定发声和说完后的连续静音。[组件契约](../components/ai-guide-components.md) · [微信录音适配器](../../../visitor-app/services/wechat-audio.js)
