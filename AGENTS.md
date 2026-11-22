# Scenic AI Guide 项目约定

修改 visitor-app 界面前先读 [Design System](docs/design-system/README.md)，然后读对应的 [页面规范](docs/design-system/pages/) 和实际 .uvue 入口。Home、Map、AI Guide、Trip、Profile 共同使用这套规范。

详情、收藏、账号、反馈与数字人宿主也使用同一主题。修改这些子页时读[子页验收](docs/design-system/quality/subpage-verification.md)，对照表单真实输入、系统返回和失败恢复。涉及 UI 文案时复核简体、繁体、英文，以及用户当前选择的接口语言。[多语言验收](docs/design-system/quality/guide-locale-verification.md)

- 组件改动先查 [组件契约](docs/design-system/components/component-guidelines.md)。优先复用现有 easycom、RiceUI 或 DCloud 原生实现。新组件从统一 Token 取色、字号、间距和圆角。地图坐标、模型视口、命中几何等业务常数保留依据。
- 视觉 Token 的源文件为 visitor-app/design/tokens.json。修改后运行 `node scripts/design-tokens.mjs` 和 `node scripts/design-tokens.mjs --check`。页面不另设视觉主题。
- 动效先读 [Motion](docs/design-system/motion/motion-tokens.md) 和 [状态配方](docs/design-system/motion/motion-principles.md)。先确定业务回调、取消与减少动态效果的静态反馈。
- 图标遵守[图标规范](docs/design-system/assets/icon-guidelines.md)，摄影与插画遵守[资产规范](docs/design-system/assets/asset-management.md)。新增内容需有可核对的来源与授权。
- 新增 UI 或依赖须验证 [跨端能力](docs/design-system/engineering/cross-platform-compatibility.md)，说明许可证、所用端、体积和现有实现为何不足。保留 API、数字人/语音、定位、行程、账号和本地历史数据兼容性。
- 完成后按[发布核对表](docs/design-system/quality/release-checklist.md)运行相关构建、交互和视觉复核，记录未验证的端和原因。截图须来自实际页面。
- 更新规范时同时更新 [来源与变更记录](docs/design-system/references/source-index.md) 和 [.agents/skills](.agents/skills/) 对应工作流，核对路径；修改上游快照后运行 `python .agents/skills/motion-design/scripts/verify_upstream.py`。

AI 导游及语音状态球改动还须按任务读取以下本地工作流。保持数字人为主要内容、球为辅助反馈。用真实业务事件和当前 owner 的可验证幅度驱动画面，缺少测幅走状态反馈。保留原语音、地图上下文及数字人 SDK 的接口和权限。完成后运行[专项核对](docs/design-system/quality/ai-ambient-orb-checklist.md)，分别记录模拟、编译与宿主实测。

- 页面布局、模式和字幕层级使用 [ai-guide-ui-design](.agents/skills/ai-guide-ui-design/SKILL.md)。
- 修改导游底栏或五个根目的地先读[导航契约](docs/design-system/components/navigation.md)，分别实测从其他四页进入、离开导游及失败回退。
- 收音、识别、播放、打断或字幕事件使用 [ai-voice-interaction](.agents/skills/ai-voice-interaction/SKILL.md)。
- 球、人物、减少动态效果与生命周期使用 [ai-motion-design](.agents/skills/ai-motion-design/SKILL.md)。
- 新增或修改导游/球体 UTS 组件、接口与条件编译使用 [ai-guide-component-development](.agents/skills/ai-guide-component-development/SKILL.md)。
