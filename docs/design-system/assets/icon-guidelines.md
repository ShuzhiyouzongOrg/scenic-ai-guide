# 图标与状态插画

[HIG-03、SRC-01](../references/source-index.md)。项目采用统一边界、轮廓和含义。Apple SF Symbols 仅用于研究语义和字重关系；可分发图形来自本项目原创导航和已集成的 Rice 字体。权利核对见[来源审计](../audit/skill-integrity-audit.md)。

| 导航资源名 | 语义 | 图形 |
| --- | --- | --- |
| home | 首页 | 取自江南游览建筑的翘檐与门 |
| map | 地图 | 三折地图 |
| ai | AI 导游 | 对话框和星形 |
| trip | 行程 | 游步路线与起终点 |
| profile | 我的 | 人物轮廓 |

**ICO-01**　五个 SVG 母版位于 visitor-app/design/icons。24×24 视口，居中、圆帽、圆角，线宽 1.65，选中 2.45。生成浅/暗各两态的 72×72 透明 PNG 供原生 tabBar 使用。文件名遵循 name、name-active、name-dark、name-active-dark。改变母版或调色板后运行 `node scripts/design-icons.mjs`（开发机 ImageMagick 7）。渲染时检视实际 24px 左右的尺寸、边缘是否截断和暗色对比。不要把主题色烘焙进 SVG 母版。 [Icons](https://developer.apple.com/design/human-interface-guidelines/icons)

**ICO-02**　操作图标由 sg-icon 读取 Rice 已存在的 name、size 与 tone；动态名也须核对 font.uts。给“定位”“停止”等动作配文字或可访问名称。禁用要同时停掉事件；纯装饰小图标不承担独立触区。空、错误使用[包内状态插画](generated-illustrations.md)，失图恢复为语义图标，加载使用静态骨架。文字交代原因和恢复路径。 [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)

**ICO-03**　原生地图使用原创 map-point.svg 母版，与手绘地图点位共用圆形轮廓和角色色。上述生成命令还会更新 static/map/map-point*.png 四个 72×72 变体。普通标记用 primary；选中标记改用 ai、加内点、加大尺寸并显示名称与站序。中心锚点对齐经纬度，浅/暗分别使用 surface 描边。在原生地图有授权密钥的设备复核点击、主题切换、选中取消，再核对两套底图是否指向同一景点。 [DCloud map](https://doc.dcloud.net.cn/uni-app-x/component/map.html)

ICO-01 依据 [Apple Icons](https://developer.apple.com/design/human-interface-guidelines/icons)及[项目母版和生成器](../../../scripts/design-icons.mjs)决定跨端可分发的线重。ICO-02 依据 [HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)及[组件选择](../components/component-guidelines.md)。ICO-03 的锚点来自 [DCloud map](https://doc.dcloud.net.cn/uni-app-x/component/map.html)，状态图源见[原创 marker](../../../visitor-app/design/icons/map-point.svg)。
