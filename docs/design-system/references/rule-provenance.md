# 规则级来源

每个 ID 的理由、实现范围、例外与验证步骤随权威规范维护。此页为已有页面与基础规则增加逐条定位的原始依据。上游给出设计原理；具体数值、UTS 契约、保存格式及业务语义由本项目确定。

导游专项规则在八个定义表就地记录原始来源，代码检查同时验证唯一 ID。球体使用 [ORB](../components/ai-ambient-orb.md)、[ORB-MOT](../motion/ai-ambient-orb-motion.md)、[ORB-INT](../interaction/ai-ambient-orb-interaction.md)、[ORB-ENG](../engineering/ai-ambient-orb-architecture.md)。舞台和会话使用 [GUIDE-CMP](../components/ai-guide-components.md)、[GUIDE-MOT](../motion/ai-guide-motion.md)、[GUIDE-INT](../interaction/ai-guide-interaction.md)、[GUIDE-ENG](../engineering/ai-guide-architecture.md)。

| ID | 应用面 | 具体原始依据与适配位置 |
| --- | --- | --- |
| FND-01 | 主题与对比 | [Apple Color](https://developer.apple.com/design/human-interface-guidelines/color)、[WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)、[项目色值](../../../visitor-app/design/tokens.json) |
| FND-02 | 字体与放大 | [Apple Typography](https://developer.apple.com/design/human-interface-guidelines/typography)、[字号生成器](../../../scripts/design-tokens.mjs) |
| FND-03 | 间距、安全区、圆角、层级 | [Apple Layout](https://developer.apple.com/design/human-interface-guidelines/layout)、[逻辑像素来源](../../../visitor-app/design/layout.uts) |
| FND-04 | 热区、可操作性 | [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)、[Android 可触控范围](https://developer.android.com/guide/topics/ui/accessibility/apps) |
| IMG-01 | 景区首页与裁切 | [Apple Images](https://developer.apple.com/design/human-interface-guidelines/images)、[实际摄影登记](../assets/asset-management.md) |
| IMG-02 | 按景点 ID 加载缩略图 | [媒体映射及回退](../../../visitor-app/design/scenic-media.uts)、[DCloud image.mode](https://doc.dcloud.net.cn/uni-app-x/component/image.html) |
| IMG-03 | 头像与舞台 | [账号头像服务](../../../server/src/services/profileAvatar.mjs)、[DCloud image.mode](https://doc.dcloud.net.cn/uni-app-x/component/image.html) |
| IMG-04 | 生成插画与状态占位 | [项目生成原始记录](../assets/generated-illustrations.md)、[HIG Progress](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) |
| ASSET-01 | 资产授权与使用场景 | [摄影原始网页、作者与许可](../assets/asset-management.md)、[数字资产核验](../audit/skill-integrity-audit.md) |
| ASSET-02 | 图片故障、预算 | [图片资源映射](../../../visitor-app/design/scenic-media.uts)、[微信实测](../quality/wechat-verification.md) |
| ASSET-03 | 跨包资源生命周期 | [平台包配置](../../../visitor-app/manifest.json)、[授权及清单](../assets/asset-management.md) |
| HOME-01 | 景区名与影像 | [HIG Images](https://developer.apple.com/design/human-interface-guidelines/images)、[项目照片映射](../../../visitor-app/design/scenic-media.uts) |
| HOME-02 | 服务入口与根导航 | [HIG Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)、[项目导航](../../../visitor-app/pages.json) |
| HOME-03 | 景区请求和重试 | [fetchScenicSpots 所在 API](../../../visitor-app/services/guide-api.uts)、[服务数据](../../../server/src/services/mapGuide.mjs) |
| HOME-04 | 推荐详情与收藏 | [卡片导航参数](../../../visitor-app/components/spot-card/spot-card.uvue)、[详情页](../../../visitor-app/pages/spot/detail.uvue) |
| HOME-05 | 热门目的地按官方路线覆盖频次排序 | [官方路线数据](../../../server/src/services/mapGuide.mjs)、[首页排序](../../../visitor-app/pages/home/index.uvue)、[导览服务](../../../visitor-app/services/guide-api.uts)、[具名站点和点位 ID](../../../visitor-app/domain/types.uts)、[排序及重试实测](../quality/home-followup.md) |
| HOME-06 | 当前景区的服务设施 | [景区数据源](../../../server/src/services/mapGuide.mjs)、[首页的设施 ID 映射](../../../visitor-app/pages/home/index.uvue)、[两景区地图选点回归](../quality/guide-locale-verification.md) |
| MAP-01 | 底图及可用区域 | [DCloud map](https://doc.dcloud.net.cn/uni-app-x/component/map.html)、[地图布局](../../../visitor-app/pages/map/index.uvue) |
| MAP-02 | 单一选点 | [DCloud markertap](https://doc.dcloud.net.cn/uni-app-x/component/map.html)、[选点与底卡](../../../visitor-app/pages/map/index.uvue) |
| MAP-03 | 搜索与故障恢复 | [HIG Searching](https://developer.apple.com/design/human-interface-guidelines/searching)、[景区请求契约](../../../visitor-app/services/guide-api.uts) |
| MAP-04 | 路线顺序 | [行程序列化](../../../server/src/services/routePlanner.mjs)、[地图数据](../../../server/src/services/mapGuide.mjs) |
| MAP-05 | 缩放平移与替代输入 | [HIG Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)、[DCloud movable-view](https://doc.dcloud.net.cn/uni-app-x/component/movable-view.html) |
| MAP-06 | 地图图层 | [HIG Color](https://developer.apple.com/design/human-interface-guidelines/color)、[DCloud map](https://doc.dcloud.net.cn/uni-app-x/component/map.html) |
| MAP-07 | 设施深链 | [首页入口及请求参数](../../../visitor-app/pages/home/index.uvue)、[地图落点](../../../visitor-app/pages/map/index.uvue) |
| MAP-08 | 控件多语言 | [项目语言设置](../../../visitor-app/stores/locale.uts)、[地图源资料](../../../server/src/services/mapGuide.mjs) |
| GUI-AI-01 | 问答与形象 | [对话 / 数字人请求契约](../../../visitor-app/services/guide-api.uts)、[舞台实现](../../../server/src/services/digitalHuman.mjs) |
| GUI-AI-02 | 录音与播放 | [语音服务](../../../server/src/services/voice.mjs)、[宿主音频](https://doc.dcloud.net.cn/uni-app-x/api/create-inner-audio-context.html) |
| GUI-AI-03 | 中断、减少动态 | [HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion)、[中断及引擎所有权](../../../visitor-app/pages/ai-guide/index.uvue) |
| GUI-AI-04 | 听写首帧与回答语言 | [讯飞 IAT 语种枚举](https://static.xfyun.cn/doc/asr/voicedictation/API.html)、[路由和首帧实测](../quality/guide-locale-verification.md) |
| TRIP-01 | 条件选择 | [HIG Focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection)、[路线推荐参数](../../../server/src/services/routePlanner.mjs) |
| TRIP-02 | 排序与替代操作 | [HIG Drag and drop](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop)、[行程操作](../../../visitor-app/pages/trip/index.uvue) |
| TRIP-03 | 保存反馈 | [后端快照契约](../../../server/src/services/routePlanner.mjs)、[HIG Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) |
| TRIP-04 | 恢复及地图联动 | [会话存储](../../../visitor-app/stores/session.uts)、[路线快照](../../../server/src/services/routePlanner.mjs) |
| PROFILE-01 | 身份与头像 | [账号存储](../../../visitor-app/stores/auth.uts)、[上传约束](../../../server/src/services/profileAvatar.mjs) |
| PROFILE-02 | 计数与记录 | [会话存储](../../../visitor-app/stores/session.uts)、[个人页数据绑定](../../../visitor-app/pages/profile/index.uvue) |
| PROFILE-03 | 游览与本机偏好 | [景区和舞台选择](../../../visitor-app/stores/guide-preferences.uts)、[语言持久化](../../../visitor-app/stores/locale.uts) |
| PROFILE-04 | 设置分组与说明 | [HIG Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)、[个人菜单](../../../visitor-app/pages/profile/index.uvue) |
| PROFILE-05 | 主动标记的到访与浏览历史分别计数 | [个人中心入口](../../../visitor-app/pages/profile/index.uvue)、[本机 ID 记录](../../../visitor-app/stores/visitor-activity.uts)、[标记、撤销和恢复实测](../quality/home-followup.md) |
| PLAT-01 | 安全区与键盘 | [DCloud WindowInfo](https://doc.dcloud.net.cn/uni-app-x/api/get-window-info.html)、[窗口测量](../../../visitor-app/design/layout.uts) |
| PLAT-02 | 宿主主题 | [DCloud theme.json](https://doc.dcloud.net.cn/uni-app-x/collocation/themejson.html)、[项目主题监听](../../../visitor-app/design/theme.uts) |
| PLAT-03 | 可读性、替代输入 | [HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)、[键盘分发](../../../visitor-app/design/keyboard.uts) |
| PLAT-04 | 动效偏好 | [CSS Media Queries 5](https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion)、[宿主能力实测](../quality/motion-source-verification.md) |
| PLAT-05 | 地图与数字人层级 | [DCloud map](https://doc.dcloud.net.cn/uni-app-x/component/map.html)、[DCloud web-view](https://doc.dcloud.net.cn/uni-app-x/component/web-view.html) |
| PLAT-06 | 条件编译与原生边界 | [DCloud UTS 渲染差异](https://doc.dcloud.net.cn/uni-app-x/uts/)、[UTS 原生插件](https://doc.dcloud.net.cn/uni-app-x/plugin/uts-plugin.html) |

组件 CMP 规则、参数 TIM、场景 FX、语音 VOC、审查 REV、交互 INT 与工程 ENG 均在各自规范内逐条标识来源。它们的输入、适用范围与验收由同一条规则维护。新增 ID 前在设计规范中查重。已删除 ID 在更新记录标为停用；重命名时保留旧 ID，并记录由哪个规则替代。升级上游 SHA 时先按源文件路径及 blob 比对变化，再对涉及的 ID 逐项记录“新增、修改、停用、无影响”及对应复测结果。[组件](../components/component-guidelines.md) · [动效参数](../motion/motion-tokens.md) · [场景与审查](../motion/motion-principles.md) · [交互](../interaction/interaction-states.md) · [工程](../engineering/component-architecture.md)
