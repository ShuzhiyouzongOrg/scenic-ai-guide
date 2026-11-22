# 组件契约

根页面与二级页面共享下列规则。每行给出同一类型组件的决策 ID、出现位置、设计理由、本项目的参数和平台实现、能观察到的验收条件。文末出处缩写均指向具体章节。精确颜色、字号、热区及压态由 [Token](../foundation/design-tokens.md) 与[动效参数](../motion/motion-tokens.md)生成。

| ID 与类型 | 何时需要 / 原因 | 结构、适配与限制 | 验收 | 出处 |
| --- | --- | --- | --- | --- |
| CMP-01 Button | 提交、重试、中断需要明确动作 | sg-button 包装 rice-button，primary/secondary/quiet 表达主次，44 最小高度。提交中由调用方给“正在保存”等动词，组件阻止重复点击；减少动态时保持文字和禁用态 | 连点只触发一次；Tab、Enter、Space 和触摸皆可操作；禁用与等待不能再触发 | [Buttons][buttons] |
| CMP-02 Text | 地名、时间和状态需随文字大小仍可读 | 使用原生 text 及语义字号；中文与拉丁字符沿宿主字体回退。标题与说明分层，操作与错误可换行 | 320 逻辑像素、大号字体、最长语言；逐个读出操作与原因 | [Typography][type] |
| CMP-03 Badge | 游客需要迅速辨认类别或状态 | sg-badge 以短文字、实色背景和语义色承载一个状态；选择动作交给 sg-choice | 灰阶下仍看懂类别，徽标不进入操作焦点 | [Color][color] |
| CMP-04 Divider | 列表中相邻任务需要分组 | sg-divider 使用 1px 和 divider 色，仅在同级行间使用；改变主题仍维持分组 | 放大、暗色和读屏跳转时分隔线不冒充内容 | [Layout][layout] |
| CMP-05 Icon | 重复动作需要稳定语义 | sg-icon 复用 Rice 图形，底栏选中图来自同一组原创图源；可点图标由外层提供 44 热区和动作名 | 检查按钮四角、灰阶、禁用及选中；装饰图标不重复朗读 | [Icons][icons] |
| CMP-06 Avatar | Profile 身份与头像编辑需要可辨认入口 | sg-avatar 使用 aspectFill 和默认人物，外层处理编辑；系统相机/相册权限由调用方处理 | 损坏 URL、取消、过大和权限拒绝后身份仍可读，上传只提交一次 | [Images][images] |
| CMP-07 Image | 地名、影像与实地点位必须对应 | 景区摄影和景点缩略图按授权登记和 ID 加载。人物舞台用 aspectFit；卡片 aspectFill 预留几何 | 断网及失图仍有标题/入口，验证换区图片与景名一致 | [Images][images]、[媒体规则](../assets/image-guidelines.md) |
| CMP-08 Skeleton / Loading | 等待已有请求时避免跳版或假进度 | sg-skeleton 的 card/row 静态占位；不确定时长用状态文案，重复提交动作锁定；减少动态时可只保留文字 | 延迟、取消、离页和慢响应均按业务状态结束；无持续无用位移 | [Progress][progress] |
| CMP-09 Header / Back | 游客需知道当前位置并返回原任务 | 根页面使用 sg-page-header 或地图/AI 操作区，app-section 用于分区；边距由其页面控制一次。子页由原生返回栈复位 | 切根页、打开详情、返回，标题不挤占状态栏/微信胶囊，选择可恢复 | [Navigation][nav] |
| CMP-10 Bottom Tab | 游客需要稳定的五个根目的地 | 四个普通根页保留系统栏。已选 AI 页按[导航契约](navigation.md)承载同一排五格，中央操作由当前语音状态决定；根页切换使用 switchTab | 五页往返核对图标、语言、中心线、底部安全区及语音单次触发 | [Tab bars][tabs] |
| CMP-11 Scenic / Destination Card | 推荐景点和目的地需有单一进入路径 | spot-card 保留景点 id、景区参数和缩略图。景区主图与操作说明分区，16–20 内边距；未知图给缺省图形 | 点击图、字、空白区域均进同一景点，切区后名称及服务数据一致 | [Layout][layout]、[首页契约](../pages/home.md) |
| CMP-12 Route / Itinerary Card | 游客要能比较、调整、保存和恢复路线 | 路线描述显示名称、站序与实际停留建议；选择有勾/文字，节点有拖动与逐站按钮。草稿、保存与地图来自同一有序数据 | 使用拖动与按钮各改一次顺序，保存、重新进入地图并比对 | [Drag and drop][drag]、[行程数据契约](../pages/trip.md) |
| CMP-13 AI / Voice Panel | 回答、录音与播报的可中断时机不同 | sg-voice-panel 提供本次操作，digital-human-guide 展示引擎实际状态；窗口内有录音、等待、停止及可用的暂停/继续。按 Reduce Motion 切换静态形象 | 依次开始、取消、重新开始、发问、暂停、继续、停止，慢响应和离页不重播 | [Feedback][feedback]、[语音状态表](../pages/ai-guide.md) |
| CMP-14 Search / Forms | 游客搜点、输入意见和身份信息时需保留上下文 | rice-search / 原生 input、textarea 使用真实 input/search/clear；字段有独立名称，失败保留输入并指明纠正动作；密码由宿主安全键盘处理 | 输入法组合、清空、返回和重新提交均不丢失未提交内容，键盘不盖住操作 | [Text fields][fields] |
| CMP-15 Choice / Service Row | 选择条件和设置要表达当前值及其操作范围 | sg-choice 用勾、文字、选中态及触摸反馈，sg-service-row 的标题与当前值作为一个可聚焦操作 | 鼠标、触摸、键盘各操作一次，两种主题和放大文字可见当前值 | [Selection][selection] |
| CMP-16 Map Marker / Sheet | 地图位置与展开的景点需保持同一对象 | 原生 marker 或 sg-map-marker 保留相同 ID；非模态底卡原位展开，景点筛选/路线变更同步点位和卡片。地图、面板各自处理手势 | 快速点 A、B，点空白、收起，再缩放；只有最终点位高亮/展开且地图可拖 | [Sheets][sheet]、[地图状态](../pages/map.md) |
| CMP-17 Dialog / Action Sheet | 高影响操作与短选项需要明确完成/取消 | 系统 uni.showModal 确认清空或退出；uni.showActionSheet 用于短列表。标题写影响，动作写结果；返回或遮罩按宿主取消语义 | 确认与取消分别验证数据和焦点，返回不意外提交 | [Alerts][alerts]、[Action sheets][actions] |
| CMP-18 Toast / Success | 完成动作后有短时提示并可立即继续 | uni.showToast 只补充持久结果，如已保存、收藏列表或账号状态。重要错误留下可恢复入口 | toast 消失、切页后回来，仍能验证操作结果 | [Feedback][feedback] |
| CMP-19 Empty / Error | 空数据和服务失败对应不同下一步 | empty-state 表达空列表；可恢复错误给说明和重试。刷新旧内容保留上次成功信息，不把失败计为零 | 真实空数组、503、恢复网络三种输入有对应文案与动作 | [Feedback][feedback]、[交互状态](../interaction/interaction-states.md) |

## 组件变更

组件保持单向 props 和业务事件，网络请求由原页面或服务持有。新增组件或变体时先查已有实现，将 ID、触发条件和验收样本写回本表。仅供原生地图命中或图片比例的几何可保留局部常量，记录其数据或构图依据。[工程约定](../engineering/component-architecture.md)

[buttons]: https://developer.apple.com/design/human-interface-guidelines/buttons
[type]: https://developer.apple.com/design/human-interface-guidelines/typography
[color]: https://developer.apple.com/design/human-interface-guidelines/color
[layout]: https://developer.apple.com/design/human-interface-guidelines/layout
[icons]: https://developer.apple.com/design/human-interface-guidelines/icons
[images]: https://developer.apple.com/design/human-interface-guidelines/images
[progress]: https://developer.apple.com/design/human-interface-guidelines/progress-indicators
[nav]: https://developer.apple.com/design/human-interface-guidelines/navigation-and-search
[tabs]: https://developer.apple.com/design/human-interface-guidelines/tab-bars
[drag]: https://developer.apple.com/design/human-interface-guidelines/drag-and-drop
[feedback]: https://developer.apple.com/design/human-interface-guidelines/feedback
[fields]: https://developer.apple.com/design/human-interface-guidelines/text-fields
[selection]: https://developer.apple.com/design/human-interface-guidelines/focus-and-selection
[sheet]: https://developer.apple.com/design/human-interface-guidelines/sheets
[alerts]: https://developer.apple.com/design/human-interface-guidelines/alerts
[actions]: https://developer.apple.com/design/human-interface-guidelines/action-sheets
