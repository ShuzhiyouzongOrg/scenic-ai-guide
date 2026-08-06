# 逐文件变更说明

## 修改文件

| 文件                                                      | 为什么修改 / 修改内容                                       | 对现有功能影响                              | 验证                                  |
| --------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------- | ------------------------------------- |
| `server/.env.example`                                     | 增加来源目录和媒体镜像目录示例。                            | 无运行时影响。                              | `npm run check`。                     |
| `server/.gitignore`                                       | 忽略授权后下载的大体积媒体镜像。                            | 不影响现有上传目录。                        | `git status --short` 不显示镜像目录。 |
| `server/package.json`                                     | 增加 `migrate:map-guide` 命令。                             | 不改变现有脚本。                            | 迁移命令成功生成数据。                |
| `server/src/app.mjs`                                      | 注册 bootstrap、spots、routes、panoramas 四个只读接口。     | 未更改既有景点、AI 路线或讲解接口。         | `npm run check`、服务层统计检查。     |
| `web/.env.example`                                        | 增加底图、媒体、全景白名单配置。                            | 默认关闭来源媒体直连。                      | 生产构建读取默认值成功。              |
| `web/package.json`                                        | 增加 Leaflet、类型、test/type-check 命令。                  | 保留原依赖范围；未升级 Vue 基线。           | frozen install、测试、构建通过。      |
| `web/pnpm-lock.yaml`                                      | 只加入 Leaflet、`@types/leaflet`、`@types/geojson` 锁定项。 | 不升级原依赖树。                            | `pnpm install --frozen-lockfile`。    |
| `web/src/router/modules/guide.ts`                         | 新增 `/guide/map` / `GuideMap` 子路由。                     | `GuideExperience` 原样保留。                | 路由注册测试。                        |
| `web/src/locales/app-messages.ts`                         | 增加地图导览中英及既有五语言目录文案。                      | 不改已有 key。                              | 类型检查、构建。                      |
| `web/src/components/digital-human/DigitalHumanAvatar.vue` | 向后兼容增加外部音频、暂停/继续和状态读取转发。             | 原 `speak/enableAudio/interrupt` 行为保留。 | 现有页构建、地图降级测试。            |
| `web/src/components/digital-human/XfAvatar.vue`           | 暴露讯飞外部音频与字幕/状态。                               | 不改变原文本讲解调用。                      | 类型检查、生产构建。                  |
| `web/src/components/digital-human/Live2dAvatar.vue`       | 暴露原声播放、暂停和恢复。                                  | 现有 TTS 路径不变。                         | 类型检查、生产构建。                  |
| `web/src/composables/useXfAvatar.ts`                      | 增加外部音频解码、16 kHz PCM 流写入和 SDK 字幕状态。        | 文本驱动仍用原 `writeText`。                | 类型检查、讲解降级测试。              |
| `web/src/composables/useLive2dAvatar.ts`                  | 增加官方音频入队和音频上下文暂停/恢复。                     | 原 TTS 队列与波形口型保留。                 | 类型检查、构建。                      |
| `web/src/lib/live2d/live2dManager.ts`                     | 增加 AudioContext 暂停方法，并修正一个 const lint。         | 不改渲染和音频队列算法。                    | 定向 ESLint、构建。                   |

## 新增前端代码

| 文件                                                 | 作用                                                                                                   | 影响范围                        | 验证                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------- | ----------------------------- |
| `web/src/views/guide/map/index.vue`                  | 页面编排、状态恢复、路线/讲解/全景双向联动和响应式布局。                                               | 新路由独立页面。                | type-check、build、视觉验收。 |
| `web/src/api/map-guide.ts`                           | API + 本地快照降级，受控媒体和静态路径解析。                                                           | 新 API 命名空间。               | 服务统计、build。             |
| `web/src/components/map-guide/ScenicMap.vue`         | Leaflet 实例、底图、定位、fit/fly/pan、安全区和资源销毁。                                              | 只被地图页使用。                | build、卸载测试。             |
| `HandDrawnTileLayer.vue`                             | 16 个 ImageOverlay 的增量增删和一次坐标转换。                                                          | 手绘层。                        | 图块测试、视觉拼接。          |
| `ScenicMarkerLayer.vue`                              | 景点/设施 Marker 增量更新、选中高亮，并按设施分类使用稳定配色。                                        | Marker 层。                     | 配色测试、交互验收。          |
| `RoutePolylineLayer.vue`                             | 绘制官方道路轨迹；编号节点优先对齐标准景点坐标，未匹配时回退来源道路锚点。                             | 路线路层。                      | 官方轨迹与点位映射测试。      |
| `ScenicSearchPanel.vue`                              | 搜索、单分类筛选、同色设施标识和结果列表，避免多分类标签同时堆叠。                                      | 左侧地图抽屉。                  | 交互验收。                    |
| `ScenicSpotCard.vue`                                 | 景点摘要、数字人/原声、全景和外部导航入口。                                                            | 底部安全区卡片。                | 交互验收。                    |
| `RouteDrawer.vue`                                    | 仅展示景区官方路线，移除 AI、精选、我的路线和优化入口，并重做紧凑卡片布局。                            | 路线入口。                      | 官方路线交互验收。            |
| `RouteDetailPanel.vue`                               | 节点浏览与讲解控制；收起详情和清除路线使用独立事件，并重排操作区防止重叠。                              | 当前路线控制。                  | 路线状态与响应式验收。        |
| `MapControlGroup.vue`                                | 使用统一正方形按钮提供官方路线、定位、复位、图层、全景和清除路线控制。                                  | 地图右侧安全区。                | 交互验收。                    |
| `MapLoadingProgress.vue`                             | 0–100% 图层进度、失败数量和重试。                                                                      | 图块加载状态。                  | 受控并发/失败验收。           |
| `MapDigitalHuman.vue`                                | idle/speaking/compact 单实例数字人容器；待机态复用项目现有 Live2D 角色静态形象，活动态才挂载渲染引擎。 | 地图数字人，不影响 experience。 | 三态视觉验收。                |
| `DigitalHumanNarrationDock.vue`                      | 桌面右侧/移动底部讲解坞。                                                                              | speaking/compact 内容。         | 响应式验收。                  |
| `NarrationSubtitle.vue`                              | 当前分句字幕和状态指示。                                                                               | 讲解坞。                        | 讲解验收。                    |
| `PanoramaViewer.vue`                                 | HTTPS/域名白名单 iframe、全屏、陀螺仪授权、重试和失败页。                                              | 页面内全景覆盖层。              | 全景失败/返回验收。           |
| `web/src/composables/map-guide/useHandDrawnTiles.ts` | 并发 4、重试 2、超时、进度和取消。                                                                     | 手绘预加载。                    | 图块测试、卸载检查。          |
| `useMapSafeArea.ts`                                  | 统一 top/right/bottom/left 安全区。                                                                    | 地图视野算法。                  | 多尺寸视觉验收。              |
| `useGuideRoutes.ts`                                  | 只暴露官方路线及当前选中状态，地图页不再生成或缓存 AI 路线。                                           | 路线业务。                      | 官方路线过滤测试。            |
| `useRoutePlayback.ts`                                | 节点顺序、自动/手动下一站和停顿。                                                                      | 连续路线讲解。                  | 状态测试。                    |
| `narration-coordinator.ts`                           | 单音源状态机、防重复、降级、暂停/继续/停止。                                                           | 所有地图讲解。                  | 3 个协调器测试。              |
| `avatar-narration-adapter.ts`                        | 统一文本、PCM/原声数字人驱动和 SDK 状态；讯飞无原生暂停时明确采用打断后重播。                          | 数字人驱动适配。                | 数字人失败降级测试。          |
| `narration-drivers.ts`                               | 普通 Audio、浏览器语音和文字兜底驱动。                                                                 | 数字人不可用时。                | 降级测试。                    |
| `useNarrationCoordinator.ts`                         | Vue 生命周期封装和自动销毁。                                                                           | 地图页讲解。                    | 卸载/构建。                   |
| `web/src/types/map-guide/*.ts`（6 个）               | 坐标、景点、路线、讲解、全景、图块和持久化严格类型。                                                   | 新模块类型域。                  | type-check。                  |
| `web/src/utils/map-guide/coordinate.ts`              | WGS84/GCJ-02/BD-09 集中转换与距离。                                                                    | 禁止组件散落转换。              | 坐标测试。                    |
| `tile-grid.ts`                                       | 4×4 边界和排序纯函数。                                                                                 | 迁移与测试。                    | 3 个图块测试。                |
| `spot-mapping.ts`                                    | ID、标准名、别名的确定性匹配。                                                                         | AI 节点映射。                   | 映射测试。                    |
| `resource-disposer.ts`                               | 幂等资源清理器。                                                                                       | 生命周期基础设施。              | 清理测试。                    |
| `web/tests/map-guide/*.test.ts`                      | 覆盖坐标、图块、路线、官方道路轨迹、讲解、降级、路由与清理。                                           | 测试环境。                      | `pnpm test`。                 |

## 新增服务端、数据和文档

| 文件                                                          | 作用                                                           | 影响范围                           | 验证                         |
| ------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------- | ---------------------------- |
| `server/scripts/migrate-map-guide.mjs`                        | 解析两个仓库、先盘点后融合、下载图块、可选镜像媒体并生成报告。 | 一次性/可重复迁移。                | 已重复运行；输出计数稳定。   |
| `server/data/source-snapshots/map-guide/official-routes.json` | 来源官方路线响应的本地审计快照，保留道路轨迹点与讲解节点关系。 | 仅迁移时刷新，生产不直连来源接口。 | 6 条路线、364 个轨迹点检查。 |
| `server/src/services/mapGuide.mjs`                            | mtime 缓存读取统一 JSON。                                      | 新只读服务。                       | Node 语法和统计检查。        |
| `server/data/generated/map-guide/categories.json`             | 17 个分类。                                                    | API 数据。                         | 迁移报告。                   |
| `map-config.json`                                             | 中心、缩放、真实边界和 16 个图块。                             | API 数据。                         | 图块分析。                   |
| `spots.json`                                                  | 218 个结构化点位。                                             | API 数据。                         | 计数和映射报告。             |
| `routes.json`                                                 | 6 官方 + 7 精选路线。                                          | API 数据。                         | 路线报告。                   |
| `panoramas.json`                                              | 1 个第三方全景及未知字段审核标记。                             | API 数据。                         | 全景清单。                   |
| `media-manifest.json`                                         | 245 个待授权素材清单。                                         | 迁移审计。                         | 媒体计数。                   |
| `web/public/map-guide/data/bootstrap.json`                    | API 失败时本地快照。                                           | 前端降级。                         | build 后静态资源存在。       |
| `web/public/map-guide/tiles/01.webp`–`16.webp`                | 本地手绘核心图层。                                             | 地图静态资源。                     | 尺寸、哈希/字节、拼接检查。  |
| `docs/map-guide/*.json`（6 个）                               | 路线、映射、坐标、图块、全景和迁移机器报告。                   | 审计材料。                         | 由脚本生成。                 |
| `README.md`                                                   | 架构、命令、环境、降级、限制和优化说明。                       | 交付文档。                         | 人工复核。                   |
| `migration-report.md`                                         | 人类可读迁移统计。                                             | 交付文档。                         | 与 JSON 对照。               |
| `route-matching-report.md`                                    | 路线并存和匹配说明。                                           | 交付文档。                         | 与 routes/inventory 对照。   |
| `coordinate-audit.md`                                         | 5 个锚点及异常说明。                                           | 交付文档。                         | 与 JSON 对照。               |
| `tile-analysis.md`                                            | 16 张图尺寸、边界和 DPR 分析。                                 | 交付文档。                         | 与实际文件对照。             |
| `authorization-risk.md`                                       | 素材、API、地图、全景和数字人授权风险。                        | 上线门禁。                         | 法务/景区确认。              |

注：`docs/map-guide/file-changes.md` 即本文件。
