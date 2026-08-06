# 拈花湾地图导览迁移说明

## 架构与数据边界

拈花湾复用现有 `/guide/map` 页面和 Leaflet 地图实例，不建立第二套地图架构。前端通过 `area=lingshan|nianhuawan` 请求独立的 bootstrap；切换景区时取消旧请求、停止讲解、清空路线/景点/全景状态，并按景区隔离本地缓存。地图实例只在新景区 bootstrap 就绪后重建，避免旧边界与新图层混用。

```text
nianhuawan-miniapp-rebuild
  -> migrate-nianhuawan-map-guide.mjs
     -> server/data/generated/map-guide/nianhuawan
     -> web/public/map-guide/data/nianhuawan/bootstrap.json
     -> web/public/map-guide/areas/nianhuawan/tiles
     -> docs/map-guide/nianhuawan audit reports
```

手绘模式以来源 GCJ-02 坐标作为唯一输入，经统一坐标模块转换一次后供图块、Marker 和路线图层共同使用。普通底图模式再使用 WGS84。景区切换、缩放和拖动均由同一个 Leaflet 实例生命周期管理，不使用绝对定位模拟地图。

## 数据迁移报告

| 项目                        |     结果 |
| --------------------------- | -------: |
| 来源普通点位                |      274 |
| 路线补充真实点位            |        3 |
| 迁移后点位                  |      277 |
| 可见分类                    |       10 |
| 景点 / 设施                 | 31 / 246 |
| 缺失坐标 / 重复 ID          |    0 / 0 |
| 官方音频 / 缺失讲解         | 13 / 264 |
| 官方路线 / 路线节点         |   7 / 40 |
| 来源道路折线顶点            |      185 |
| 路线节点自动匹配 / 人工审核 |   40 / 0 |
| 全景 / 热点                 |  15 / 54 |
| 稳定景点全景关联            |        8 |

完整机器可读结果见 `migration-report.json`、`route-match-report.json`、`coordinate-audit.json`、`panorama-inventory.json` 和 `tile-analysis.json`。迁移没有为凑数创建景点、坐标、路线或讲解。

## 路线融合

7 条路线全部标记为 `official`，路线名称和节点顺序来自来源快照：经典线路、拈花水游、拈花华服游、拈花禅游、鹿鸣谷线路、国风之旅、不慌不忙 好好生活。

- 编号 Marker 使用 277 点规范清单中的景点坐标。
- 折线保留来源 `pathPoints`，共 185 个道路顶点，不使用节点间直线。
- 来源路线锚点保存在 `sourceRouteAnchor` 供审计，不覆盖规范 Marker。
- 40 个节点全部匹配成功；原路线锚点与规范点位的偏差仍保留在来源快照中，不静默修改。
- 当前游客端只显示官方路线；灵山和拈花湾路线数据相互隔离。

## 坐标核验

来源定位、腾讯路线服务和点位快照共同表明坐标系为 `GCJ02`。迁移保留原坐标，未批量转为另一种中国地图坐标，也不会在组件内二次转换。

已建立 5 个锚点审核项：游客中心、景区入口、拈花塔、五灯湖广场、微笑广场。浏览器验收确认它们与手绘建筑和路线节点一致；但尚未使用获授权卫星底图或现场测量完成 20 米误差确认，因此状态仍为 `manual-map-verification-required`，不能宣称人工坐标验收已完成。

## 16 张图块

- 排列：4 行 x 4 列，行优先；北到南、西到东。
- 单张：`1771 x 2048` PNG；拼接：`7084 x 8192`。
- 总大小：`11,208,770` 字节；单张范围约 `14 KB` 到 `1.66 MB`。
- 园区边界：SW `(31.407641, 120.063915)`，NE `(31.431446, 120.088033)`。
- 方向：`rotationDegrees=0`，不翻转、不倾斜。
- 缝隙：图块共享同一经纬边界，DOM 仅使用 1.2px 接缝缓冲，不做 CSS 锐化。
- 视野：手绘模式的最小缩放按“覆盖容器”计算，并启用强边界限制；不会拖出园区后露出普通底图。

| 验收尺寸    | DPR | 允许最大缩放 | 单张物理像素放大约值 |
| ----------- | --: | -----------: | -------------------: |
| 1920 x 1080 |   1 |          z19 |                1.27x |
| 1920 x 1080 |   2 |          z18 |                1.27x |
| 1366 x 768  |   1 |          z19 |                1.27x |
| 768 x 1024  |   2 |          z18 |                1.27x |

高 DPR 设备限制到 z18，避免超过原生像素 1.5 倍。若需要在 DPR2 上开放 z19 或更高，应从原始工程导出 @2x 图块或生成多级 XYZ 金字塔。

## 数字人与全景

拈花湾沿用目标项目现有讯飞 WebRTC 数字人、统一 `NarrationCoordinator` 和白底圆形 idle/compact 入口。13 条官方原声保持 `official-audio`；普通占位简介不会伪装为官方讲稿，缺失内容使用明确的 `fallback-text`，避免调用灵山知识库造成跨景区污染。

15 个 720yun 场景和 54 个热点已迁移，热点目标均可通过 `panoId -> sceneId` 解析。8 个场景可从稳定匹配景点直接进入，其他 7 个保留人工审核。第三方页面报告产品已过期，iframe、CSP、全屏、陀螺仪和长期可用性必须在获得平台授权后联调。

## 响应式与交互验收

- `1920 x 1080`：景区切换器位于地图上沿中央；路线抽屉、详情、控制组和数字人互不遮挡。
- `768 x 1024`：手绘图覆盖容器，切换后仍保持 16 图块和 31 个默认景点 Marker。
- `390 x 844`：景点侧栏默认折叠，无横向滚动；路线抽屉打开时隐藏地图控制和数字人，路线详情打开后数字人移至面板上方安全区。
- 圆形数字人的 engine、host、avatar、stage 计算背景均为 `rgb(255, 255, 255)`。
- 路线详情关闭后路线仍保留；只有“清除路线”会删除折线和路线状态。

## 启动与验证

```powershell
cd server
npm run migrate:map-guide:nianhuawan
npm run check
npm start

cd ..\web
pnpm type-check
pnpm test
pnpm build
pnpm dev
```

开发地址为 `http://127.0.0.1:5173/#/guide/map`，后端默认为 `http://127.0.0.1:5178`。

地图环境变量沿用 `web/.env.example`：`VITE_MAP_TILE_URL`、`VITE_MAP_TILE_ATTRIBUTION`、`VITE_MAP_MEDIA_BASE_URL`、`VITE_MAP_ALLOW_SOURCE_MEDIA` 和 `VITE_MAP_PANORAMA_HOSTS`。讯飞配置沿用现有数字人环境变量；本次没有新增密钥文件。

## 授权与未完成事项

1. 16 张手绘图已本地化，但图片版权和再发布授权仍需景区确认。
2. 景点封面、13 条官方音频和部分分类图标仍是来源 CDN URL；生产环境不能把该 CDN 作为唯一来源，须获授权后镜像到受控存储。
3. 720yun 场景属于第三方平台资产，产品过期状态、iframe 白名单、HTTPS、Cookie、全屏和陀螺仪权限均有可用性风险。
4. 5 个坐标锚点仍需现场或获授权卫星底图人工验收。
5. 官方原声音频没有 viseme 时间轴；讯飞若不能对外部音频提供精确口型，只能进入原声讲解降级模式，不能宣称音素级同步。
6. 45 个无来源分类点位被保留在数据中并标记人工审核，不根据名称猜测后覆盖。

## 逐文件说明

| 文件或目录                                            | 变更原因与内容                                                 | 现有功能影响                         | 验证                             |
| ----------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------ | -------------------------------- |
| `server/scripts/migrate-nianhuawan-map-guide.mjs`     | 将来源点位、分类、路线、图块和全景转换为统一模型并生成审计报告 | 不修改来源仓库                       | 脚本执行、Node syntax check      |
| `server/src/services/mapGuide.mjs`                    | 按 `area` 读取独立数据目录和缓存                               | 灵山默认行为保留                     | API 数量检查、server check       |
| `server/src/app.mjs`                                  | 为 bootstrap/spots/routes/panoramas 增加 `area` 查询参数       | 原接口路径不变                       | API smoke test                   |
| `server/data/generated/map-guide/nianhuawan/`         | 277 点、10 分类、7 路线、15 全景和地图配置                     | 与灵山目录隔离                       | 迁移报告、单测                   |
| `web/public/map-guide/areas/nianhuawan/tiles/`        | 托管 16 张受控本地图块                                         | 不依赖来源图块 CDN                   | 浏览器图块数量与画面检查         |
| `web/public/map-guide/data/nianhuawan/bootstrap.json` | API 失败时的只读快照                                           | 灵山快照不变                         | 前端 fallback 测试               |
| `web/src/api/map-guide.ts`                            | 发送景区参数并按景区读取本地快照                               | API 调用方式向后兼容                 | type-check、test                 |
| `web/src/types/map-guide/map-guide.ts`                | 增加 `ScenicAreaId`、area 元数据和高 DPR 上限                  | 现有类型扩展                         | type-check                       |
| `web/src/utils/map-guide/scenic-area.ts`              | 景区 ID 规范化、缓存键和切换清理状态                           | 防止跨景区状态污染                   | `scenic-area.test.ts`            |
| `web/src/components/map-guide/ScenicAreaSwitcher.vue` | 增加居中的双景区选择器和 reduced-motion 支持                   | 不替换原页面控件                     | 桌面/平板/手机截图检查           |
| `web/src/components/map-guide/ScenicMap.vue`          | 覆盖式最小缩放、高 DPR 限制、缓存视野夹取                      | 保留 Leaflet 与灵山投影              | 浏览器缩放、边界和切换检查       |
| `web/src/components/map-guide/ScenicMarkerLayer.vue`  | 多分类筛选、设施颜色和标签碰撞控制                             | 灵山 Marker 行为保留                 | 设施色测试、视觉检查             |
| `web/src/views/guide/map/index.vue`                   | 加载/切换景区、隔离状态、拈花湾讲解降级和响应式安全区          | 不修改 AI 数字人导览 experience 页面 | type-check、37 tests、浏览器验收 |
| `web/tests/map-guide/scenic-area.test.ts`             | 覆盖缓存隔离、数据不串区、路线、图块、设施色和全景             | 仅测试代码                           | Node test runner                 |
| `docs/map-guide/nianhuawan/`                          | 保存迁移、路线、坐标、图块和全景审计结果                       | 无运行时影响                         | JSON 可解析、人工复核            |
