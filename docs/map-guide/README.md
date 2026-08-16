# 景区地图导览迁移说明

拈花湾多景区迁移、数据统计与逐文件说明见 [`nianhuawan/README.md`](nianhuawan/README.md)。

## 架构

景区地图导览作为 `/guide/map` 子路由加入现有游客导览模块，与 `/guide/experience` 同级。现有 AI 数字人导览页面、接口和布局未被替换。

```text
来源小程序配置/快照 ── migration script ──> server/data/generated/map-guide
                                      ├──> docs/map-guide 审计报告
                                      └──> web/public/map-guide 静态快照与单张完整手绘图

Vue 页面 ──> /api/map-guide/bootstrap ──失败──> public/bootstrap.json
    ├── Leaflet：底图、ImageOverlay、Marker、Polyline、定位和视野控制
    ├── 多来源路线：official / curated / ai / hybrid / user
    ├── NarrationCoordinator：数字人、原声、浏览器语音、文字单音源调度
    └── PanoramaViewer：第三方全景、权限、全屏、重试和返回状态恢复
```

前端只保存交互状态，不长期硬编码点位。`server/data/generated/map-guide` 是生产 API 的统一数据目录；`web/public/map-guide/data/bootstrap.json` 是接口失败时的只读快照。

## 数据结果

- 来源地图快照 214 条，另有 4 个仅存在于官方路线的点位；统一迁移后共 218 条。
- 47 个景点类点位、171 个设施类点位、17 个分类。
- 迁移数据保留 6 条来源官方路线和 7 条目标项目历史精选路线；游客地图当前仅展示 6 条官方路线。
- 6 条官方路线保留 364 个来源道路轨迹点；70 个节点保留道路锚点供审计，编号 Marker 优先对齐已匹配的标准景点坐标。
- 31 条官方原声音频记录；来源没有可确认的官方逐句文稿。
- 245 个图片/音频素材 URL 已进入媒体清单。来源 16 张地图图块已合成为单张完整手绘图，其他媒体待授权后镜像。
- 16 个来源景点与目标知识库高置信自动匹配，31 个景点进入人工审核；没有为了凑数量生成虚假匹配。

详细机器可读数据见：

- `migration-report.json`
- `existing-route-inventory.json`
- `spot-mapping.json`
- `coordinate-audit.json`
- `tile-analysis.json`
- `panorama-inventory.json`

## 启动

```bash
cd server
npm install
npm run migrate:map-guide
npm run dev
```

```bash
cd web
pnpm install --frozen-lockfile
pnpm dev
```

默认开发端口按项目既有 `.env` 配置。访问 `/guide/map`，或从“游客导览 / 景区地图导览”菜单进入。

## 测试与构建

```bash
cd web
pnpm test
pnpm type-check
pnpm build
pnpm exec eslint src/api/map-guide.ts src/components/map-guide src/composables/map-guide src/types/map-guide src/utils/map-guide src/views/guide/map/index.vue tests/map-guide
pnpm exec stylelint "src/components/map-guide/*.vue" "src/views/guide/map/*.vue"
```

```bash
cd server
npm run check
node --check scripts/migrate-map-guide.mjs
node --check src/services/mapGuide.mjs
```

## 环境变量

| 变量                          | 必需   | 说明                                                    |
| ----------------------------- | ------ | ------------------------------------------------------- |
| `VITE_MAP_TILE_URL`           | 否     | 基础地图模板；生产必须换为自建或获许可服务。            |
| `VITE_MAP_TILE_ATTRIBUTION`   | 否     | 底图版权标注。                                          |
| `VITE_MAP_MEDIA_BASE_URL`     | 否     | 受控对象存储根地址；需保持来源 `/navigation/...` 路径。 |
| `VITE_MAP_ALLOW_SOURCE_MEDIA` | 否     | 仅开发排查使用；默认 `false`。                          |
| `VITE_MAP_PANORAMA_HOSTS`     | 否     | iframe HTTPS 域名后缀白名单。                           |
| `MAP_GUIDE_SOURCE_DIR`        | 迁移时 | 来源仓库路径。                                          |
| `MAP_GUIDE_MEDIA_OUTPUT_DIR`  | 迁移时 | `--download-media` 的本地镜像目录。                     |

讯飞和后端 TTS 的环境变量沿用目标项目现有配置。

## 异常与降级

- API 失败：读取随构建发布的 `bootstrap.json`。
- 完整手绘图加载失败：最多重试两次，失败后关闭手绘层并保留普通底图。
- 定位拒绝：返回园区默认中心。
- 数字人失败：按普通音频、浏览器语音、文字字幕顺序降级。
- 全景失败：显示说明、重试和外部打开；地图实例不销毁，退出后恢复中心、缩放、路线节点和讲解状态。
- 未知坐标：拒绝转换并进入审核，不静默修正。

## 数字人三状态

- `idle`：地图右下安全区内的 104px 白底圆形入口，数字人居中显示；点击后进入讲解坞。
- `speaking`：桌面端成为独立右侧 grid 列，最大约页面 29%；地图容器重新计算尺寸，不覆盖中心。移动端为不超过 38vh 的底部坞。
- `compact`：路线浏览和全景模式继续使用白底圆形入口；与 speaking 共享同一数字人实例，避免 WebRTC 重连。

景点和路线节点由用户主动选择时才调整地图视野；用户自由拖动或缩放后不会被讲解流程强制拉回。

## 技术限制与未完成事项

1. 来源全景只有一个 720 云 URL，没有热点、点位关联、初始视角或陀螺仪元数据；这些字段保留为未知/人工审核，不能伪造。当前供应商 URL 在 2026-08-04 检查时返回 520。
2. 来源 31 条官方音频没有 viseme 和逐句时间轴。实现已接入讯飞外部 16 kHz PCM 写入和 Live2D 真实音频幅度驱动，但讯飞外部音频驱动仍需在有授权账号、可跨域媒体和目标 SDK 版本上联调确认；两者都不能表述为已有逐音素 viseme 精度。SDK 实时字幕可用时页面优先按其分句，否则只能按文本长度估算字幕进度。
3. 目标项目 7 条精选路线原本没有坐标。能可靠匹配的节点已补来源坐标，其余仍标记人工审核。
4. 来源 6 条官方路线已恢复官方编辑的园区道路轨迹，但它们不是实时导航结果。如需逐段可达性、无障碍和实时绕行，仍需接入景区道路图或获许可的步行路线服务。
5. 封面和音频尚未进入受控对象存储。部署前需确认授权并运行媒体镜像流程。
6. 当前讯飞封装没有真正的流式暂停接口：暂停会打断播报，继续时从当前讲解内容重新开始；Live2D/普通音频可以原位暂停。接入 SDK 原生 pause/resume 或分段时间戳前，不能宣称讯飞讲解已支持无损断点续播。

## 后续优化

- 景区人员审核 31 个未匹配景点和 2 个偏差较大的坐标锚点。
- 从原始手绘工程导出 zoom 20+ 所需真 @2x 或 XYZ 金字塔。
- 获取 720 云项目配置或迁移到自建 Pannellum/Photo Sphere Viewer 内容后，再补真实热点、初始视角和可验证陀螺仪能力。
- 建立园区可步行道路图，计算真实距离与可达性。
- 经授权将 245 个素材镜像到对象存储，设置内容哈希、长期缓存和 CSP。
