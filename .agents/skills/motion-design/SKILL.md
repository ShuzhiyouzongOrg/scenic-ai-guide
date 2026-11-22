---
name: motion-design
description: 为 Scenic AI Guide 设计或审查反馈、语音状态、地图手势、转场和减少动态效果。
---

# motion-design

为 Scenic AI Guide 设计或审查反馈、语音状态、地图手势、转场和减少动态效果。

开始前打开[项目知识索引](references/project.md)，按任务读取其中规范及对应页面源文件。

先写状态触发证据、取消和中断后的终态，再挑选一档时长。让触摸、音频和地图时间线由原宿主管理，不引入 Web 动画运行库。

重放快速切换、晚到回调、离页、减少动态效果四条路径。需要核对外部规则时查[归档索引](references/upstream/README.md)，更新快照后从本目录执行 `python scripts/verify_upstream.py`。

保持项目服务、平台架构与用户资料的原有契约。对于超出宿主能力的规则，在发布核对表标记实际验证范围。

提交变更时在项目规范中定位TIM、FX、VOC、REV规则 ID，核对原始章节、适用面、实际调用点与验收。若涉及按压或减少动态，在本机 H5 跑动效偏好回归，记录宿主、开关、终态与中断结果。

跨端调试同时检查微信新装的轻量模式和显式保存的减动偏好，原生 iOS／Android 回前台刷新系统读取，系统强制减动优先。按[跨端记录](../../../docs/design-system/quality/motion-source-verification.md)区分原生系统实读与编译验证。
