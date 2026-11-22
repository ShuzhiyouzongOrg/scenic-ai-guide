# Skill 来源与完整性审计

取样日期为 2026-11-21（上海）。五个 GitHub 仓库均实际克隆到临时目录，并读取提交树、入口、引用索引、脚本依赖和许可声明。Apple HIG、Motion 和 Design Resources 官方网页也已访问。业务工程没有新增 npm、CocoaPods、Gradle 或小程序依赖。

## 安装边界与离线数据

Codex 执行入口位于根目录 `.agents/skills/`，每个入口由项目维护。移动端规则与验收标准位于 `docs/design-system/`，根 `AGENTS.md` 指向该知识库。动效 Skill 另带两份小型 MIT 只读源档案，包含原始目录、入口、参考文档、模板和版权声明。归档内容作为参考数据读取，无需运行其中的代码示例。其他三个候选只保留提交指针、清单和项目独立撰写的适配规则。

| 来源 ID | 提交（点击到不可变版本） | 实际范围 | 决定 |
| --- | --- | --- | --- |
| ADS | [dickwu/apple-design-skill @ 91e15664896f6f27e75dcf1414d1226cb95fa167](https://github.com/dickwu/apple-design-skill/tree/91e15664896f6f27e75dcf1414d1226cb95fa167) | 136 文件，根 `apple-design` 入口，128 份 references 和一个拉取脚本 | 审查方法及任务路由改写入本项目，未复制苹果原文或上游脚本 |
| EM | [emilkowalski/skills @ 64eb3deb9a5fbfa041faf783e0bc3fd635872e9c](https://github.com/emilkowalski/skills/tree/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c) | 36 文件、20 个 SKILL.md，所需入口是 `skills/animate/` | MIT，保存完整仓库原文件供离线溯源。项目动效入口负责调用本地规范 |
| DMP | [kylezantos/design-motion-principles @ 4a9ca879f24a361f4dca4174fe2da0f67b5ddee3](https://github.com/kylezantos/design-motion-principles/tree/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3) | 18 文件，变更日志 2.1.1，1 个入口、2 流程、10 篇参考及 2 个 HTML 模板 | MIT，保存完整仓库原文件和版权声明，选用设计/审查流程 |
| HAS | [justinwetch/HIGAgentSkills @ 2206ff935b4affa9ad249a5399a3e8e29f5f6edd](https://github.com/justinwetch/HIGAgentSkills/tree/2206ff935b4affa9ad249a5399a3e8e29f5f6edd) | 414 文件，根 `apple-hig`，入口所报 release 2026-09-27，Apple 快照 2026-09-12 | 路由与证据模型仅作参考。保留独立规范，避免再分发受单独约束的资料 |
| SPEC | [HIG-Spec/hig-spec.github.io @ 7348b029fa61283fc1ee7f53f79b72d829cc3840](https://github.com/HIG-Spec/hig-spec.github.io/tree/7348b029fa61283fc1ee7f53f79b72d829cc3840) | 87 文件，package.json 0.3.0，Vue/Vite 站点，无 SKILL.md | 查看结构、材料来源和快照边界。没有安装站点、测量数据、字体或符号 |

[完整文件清单](upstream-files.tsv) 的 691 行数据逐项记录来源、原路径、角色、字节数及 Git blob SHA-1，可按来源和路径筛选 references、scripts、templates 或 assets。每份档案的许可证按源提交保留。[引用关系表](upstream-references.tsv) 记录文档中可解析的本地文件引用，并补充按名称跳转的 Skill、HIG 主题路由和相关主题、Python 模块导入。表中不列线上文章链接、宿主输入文件、输出路径、示例路径与动态网络请求。引用到代码示例不构成工程依赖。

## 逐项核查

### ADS · Apple Design

- 入口按平台和所见组件选择材料，再依次检查无障碍、平台习惯、视觉、交互和文案。124 份 `references/hig/*.md` 含 123 份转录页面与一份手写材质说明；另有 code-audit、cross-platform、heritage、hig-lookup 四份索引或手册。表内文件常省略 `references/hig/` 前缀。
- `scripts/pull-hig.mjs` 使用 Node 18+ 的 fetch 和内置文件 API；联网后能刷新或裁剪上游本地快照。已执行 `node --check`。本项目无需抓取/删除历史规范。仓内还有其他宿主的 AGENTS.md、GEMINI.md 和 .cursorrules，保持在上游。
- 根目录没有 LICENSE；README 的 Origin and license 段明确 Apple 拥有转录文本。没有取得完整再分发授权。只记录来源和自己的设计实践，采用先查具体页面、再给来源和设备证据的审查方法。[许可说明](https://github.com/dickwu/apple-design-skill/blob/91e15664896f6f27e75dcf1414d1226cb95fa167/README.md#origin-and-license)

### EM · Animate

- 从 `skills/animate/SKILL.md` 跟到同级 `RECIPES.md`、相邻 `../pick-ui-library/SKILL.md`，再从 recipes 跟到 `../choreograph/SKILL.md` 和对应 RECIPES。入口也会用名字指向 review-animations、improve-animations、find-animation-opportunities 和 animate-expo。单独复制 animate 文件夹会断开其中的跳转。
- 包内所有入口为 animate、animate-expo、animation-performance、animation-vocabulary、apple-design、ask-emil、ask-sonner、break-ui、choreograph、emil-design-eng、find-animation-opportunities、gestures、improve-animations、learn-taste、mobile-native、pick-ui-library、prototype、remove-animations、review-animations 和 write-swift。库内有 API 文档、recipes、审查方案及根目录速查表。根 .pl 是零字节文件。完整包没有需运行的 Perl 程序。
- 阅读 animate/recipes 无运行时依赖。示例涉及 DOM、CSS、WAAPI、JS、Motion/React、弹簧及鼠标环境。相邻库选择器会建议 Base UI、Vaul、Sonner 等 Web 组件；个别旁系 Skill 会请求在线文档。本项目调用路径可离线完成，从现有 UTS 状态、RiceUI 或平台控件实现设计意图。
- MIT 版权归 Emil Kowalski；两段核心流程分别变为设计前的频率/目的判断、实现后的中断/减少动态效果验收。ZIP 含原始作者声明。[LICENSE](https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/LICENSE)

### DMP · Design Motion Principles

- create 和 audit 工作流分别读取 `references/` 下的设计师视角、性能与无障碍资料；audit 另读 anti-checklist、audit-checklist、output-format、demo-shell、report-template。上游在 workflow 内写的 `references/…` 从 Skill 根解析，简写文章名从 references 解析。CHANGELOG 中的 philosophy.md、common-mistakes.md、technical-principles.md 是历史文件名，当前工作流已使用新路径。CLAUDE.md 是宿主项目的可选上下文。
- HTML 模板中的字体资源会联系 Google Fonts，样例面向浏览器。模板位于只读档案中；项目评审记录设备、真实状态与截图，可以完全离线。上游没有独立可执行脚本和随包字体、图片。
- 采用三种审查角度：高频任务的响应速度、位移和对象关系的可读性、低频场景的表现力。对录音、定位和行程排序给前两项更高权重。将同屏多处脉冲、统一逐卡飞入、多层模糊和抢占手势列为需举证的反例。[LICENSE](https://github.com/kylezantos/design-motion-principles/blob/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3/LICENSE)

### HAS · HIG Agent Skills

- 根入口读 routing-index，再按基础主题、平台、关键词和一跳 related 打开 `references/hig/`。完整库还有 156 份 distilled、161 份 references、20 个维护/验证 Python 脚本、2 项测试模块、1 个宿主命令、4 张说明图片及源快照的审查材料。该库的 slash command 与可选多评审员 enforce 模式属于其产品功能。
- 普通只读资料无需 Python；路由辅助需要 Python 3.10+ 标准库。额外的运行包校验器导入 markdown_it，计量/账本脚本导入 tiktoken，并引用上游制备环境目录。联网抓取、源材料冻结和可视验证还需要各自的数据和观察环境。在临时检出执行路由单测 8 项通过，未安装其抓取、计量或 enforce 环境。
- MIT 仅覆盖原创材料；NOTICE 单列 Apple HIG 和开发者讲话资料。按场景加载、发现问题绑定到具体文件/证据的做法转成项目规范。未安装全局 slash 命令。[NOTICE](https://github.com/justinwetch/HIGAgentSkills/blob/2206ff935b4affa9ad249a5399a3e8e29f5f6edd/NOTICE)

### SPEC · HIG Spec

- 站点从 `public/data/` 读取有摘要的测量/材质快照，`src/specs/` 与 `src/rendering/` 分别定义数据处理和 Web 渲染。Sketch 源文件由使用者自行取得；Web 外观与设备原生结果应分别测量。[网站](https://hig-spec.github.io/)
- 开发环境需要 Node ≥22.12、Vue 3.5.22、Vite 7.3.7、TypeScript 5.9.2、vue-tsc、Vite Vue 插件、Node 类型和 Prettier。浏览器验证另需 Playwright 1.55.0、Pillow 11.3.0 与安装的浏览器；Python 提取器使用本地 Sketch 档案。
- 根目录没有整站 LICENSE。symbolist 的 MIT 仅覆盖符号名映射；THIRD_PARTY.md 另述 Apple 素材权利。项目采用独立编写的语义与校验规则，原始快照、Web 渲染器和 SVG 示例均未加入移动端。[第三方声明](https://github.com/HIG-Spec/hig-spec.github.io/blob/7348b029fa61283fc1ee7f53f79b72d829cc3840/THIRD_PARTY.md)

### Apple 官方资源与 SF Symbols

2026-11-21 从 Apple 官方下载页定位到 SF Symbols 27 的磁盘映像。在临时目录提取安装包中的 `Resources/English.lproj/License.rtf` 核对第 2 节，英文文件 SHA-256 为 `12fb2f79eea41813a3658f8eff47c34b769b1c296eaf232be7958be52e2f86d2`。2A 限定相应 Apple 平台的界面模型用途；2B 对修改模板纳入适用 Apple 平台产品规定 Xcode 等条件；2D、2E 限制资源再分发和商标用途。Android、微信小程序与鸿蒙共享资源使用独立设计或有跨平台授权的图标。可借鉴视觉重量、留白、选中态和语义。原始字体、导出的 SVG、Apple 产品形象和磁盘映像均未收入项目。[官方入口](https://developer.apple.com/sf-symbols/) · [本次读取的官方包](https://devimages-cdn.apple.com/design/resources/download/SF-Symbols-27.dmg?2) · [HIG 符号说明](https://developer.apple.com/design/human-interface-guidelines/sf-symbols)

Apple Design Resources 的许可另对模板、设计资料的使用平台和用途作出规定，SF 字体单列协议。项目在各端调用系统字体，不随包发放 Apple 字体或设计套件。[Apple 设计资源许可](https://developer.apple.com/support/downloads/terms/apple-design-resources/Apple-Design-Resources-License-20230621-English.pdf) · [Apple Fonts](https://developer.apple.com/fonts/)

## 冲突处理

| 上游建议的适用情境 | 项目处理 | 复核 |
| --- | --- | --- |
| Animate 建议 CSS 曲线与 spring，DMP 按产品情境调时长 | 录音停止、拖动与点位连点立即响应；普通控件取项目时长档位。平台只支持预设曲线时使用可用的原生曲线 | 连续触发、取消、离开页面，观察最终业务状态 |
| Animate 减少动态效果可保留柔和淡变，DMP 示例几乎禁用所有过渡 | 先同步文字/可操作状态，再允许经过该端验证的短淡变。缺少偏好桥接时采用静态保底 | 切换系统偏好与项目可用设置，完成同一任务 |
| Web 模板、hover、布局读数、共享元素或联网字体 | 取动作语义与反馈层级，平台回调、真机录屏及静态测量用于验收；开发参考体积由仓库承担 | 检查移动端依赖清单与构建产物 |
| Apple 默认导航、字体和系统符号 | 依据各宿主能力实现同一信息层级；苹果模板、SF 字体文件和 SF 图形未打包，用项目图标并保留可读标签 | 比较五个入口、字体放大、暗色和读屏结果 |
| 两套 HIG 汇编可能版本不同 | 当前 Apple 原文核实可疑条款。涉及数值先注明平台、单位、适用版本，再决定项目阈值 | 升级时对比函数与照片实测，并写入规则更新记录 |

## 验证、变更和余项

1. 上游交付采用完整归档，未执行 `npx skills add`。两份档案共 232,971 字节，54 个条目保持原 Git blob 字节。运行 `python .agents/skills/motion-design/scripts/verify_upstream.py` 可在断网状态下按路径逐项验证。当前校验通过，EM 53 条、DMP 77 条本地关系的端点全部存在。
2. 项目 Skill 与源档案分开验证。先用实际项目 cwd 运行 Codex 的 `skills/list`（启用强制重新扫描），检查每个 Skill 的唯一名称、作用域、完整路径与解析错误，再执行一个只读 Skill 工作流。重开已有会话后的发现结果以真实输出为准。当前环境的项目级验证与其他交付门禁见[发布核对表](../quality/release-checklist.md)。
3. 上游版本升级时先把新旧 commit 分别检出，比对文件树、许可证与入口的引用。对新增、移除和修改分别登记规则 ID、移植决定、验收证据及受影响页面，重新生成两份 TSV、更新源档案摘要并重复离线验证。初始取样和已采用的规则见[来源与规则记录](../references/source-index.md)。
4. 审计证明来源和选取文件完整。动画触感、数字人运行、设备渲染等另由项目构建和设备门禁负责。仅供参考的候选抓取器、源材料生成器与站点部署任务不构成项目发布依赖。

## 导游专项的四个项目 Skill · 2026-11-22

本次新增的是四份项目原创工作流；第三方快照、许可和校验摘要不变。每个目录只有下表所列入口，UTF-8 的 YAML 头含唯一 name 和触发用 description。工作流无脚本、附带图片、包管理器或运行时依赖；各入口用相对于自身目录的路径直连完整知识库。文档和前两类依赖在本仓库离线可读。

| 入口兼清单 | 引用和执行范围 | 独立只读会话实际观察 |
| --- | --- | --- |
| [ai-guide-ui-design/SKILL.md](../../../.agents/skills/ai-guide-ui-design/SKILL.md) | 页面规范、组件、Token、质量清单 | 读取本入口及项目组件规范，将数字人、麦克风、球体分别定位为主体、主要操作和辅助反馈。 |
| [ai-guide-component-development/SKILL.md](../../../.agents/skills/ai-guide-component-development/SKILL.md) | 组件职责、球体接口、平台架构、质量清单 | 打开入口、架构与实际组件，从 level 属性确认有效静音和不可观测值，辨认页面与 WebView 的媒体所有权。 |
| [ai-voice-interaction/SKILL.md](../../../.agents/skills/ai-voice-interaction/SKILL.md) | 会话、八态、能力记录、质量清单 | 读取入口、信号契约和真实源码，定位 Cubism 的时域采样来源，区分无可用读数和实测静音。 |
| [ai-motion-design/SKILL.md](../../../.agents/skills/ai-motion-design/SKILL.md) | 状态球、人物动效、减动实现、质量清单 | 读取入口和减动代码，辨认视觉冻结、舞台声音中断及宿主朗读保留的边界。 |

四项均通过 skill-creator 的 `python -X utf8 quick_validate.py <目录>`。在仓库根执行 `python scripts/check-design-system.py --codex`，真实 app-server 的 `skills/list` 强制重扫，返回九个已启用 repo scope 入口。额外通过桌面版 codex.exe（0.171.0-alpha.13）的两次只读 `exec --ephemeral --sandbox read-only` 分别显式调用上述两组 Skill，执行日志包含四次打开相应 SKILL.md 的工具调用和读取项目源码的结果。本机另装的 npm CLI 0.147.0 能列举 Skill，但本轮只读 exec 通过该旧二进制调用模型遭到服务拒绝，已用桌面版完成调用复核。[来源与规则](../references/source-index.md)
