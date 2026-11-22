# Home · 发现景区

首页在无网时仍要能进入地图、AI 导游、行程与本地记录。首屏按“发现目的地 → 看景区 → 选择服务”阅读。游客切换景区后，照片、地图入口与景点推荐必须指向同一处。

| ID | 页面规则与理由 | 实现与例外 | 验证 |
| --- | --- | --- | --- |
| HOME-01 | 先给出地名与景区形象，再进入地图。游客可以识别实际目的地。 | 页头使用共享安全区；主视觉就地加载、等比裁切；景名置于实色文字区。旅游照片仅用于已核实拍摄地点的目的地。 | 飞行模式首次打开，仍可读景区名、进入地图。分别选择灵山与拈花湾，核对名称与主视觉。 |
| HOME-02 | 地图、AI、行程与收藏都应单击可达。 | 地图沿用 switchTab，AI 和行程切换原生 Tab，收藏走现有子包。保留系统返回路径。服务行有文字名称与点击反馈。 | 五次快速切换，无页面重复入栈；最窄屏能读完整功能名。 |
| HOME-03 | 推荐区只展示服务返回的当前景区景点。 | onShow 检查偏好，按 area 请求、筛选 scenic 并最多显示八项。切区作废旧请求；图片错误独立于数据错误；空数据与请求失败给不同反馈。 | 慢网先请求灵山再改拈花湾；晚到的旧数据不能覆盖；断网可就地重试，服务恢复后无需重新启动。 |
| HOME-04 | 同一张景点卡只承担一次导航。 | 卡片以名称为主，类别与简介其次。整卡打开带编码 id 与 area 的详情。图片缺失时保留画幅和景名。 | 点击图片、名称或空白处均到同一景点；在详情收藏后回个人页看同一条记录。 |
| HOME-05 | “热门目的地”给出可解释的选择依据。 | 对当前景区的官方路线按景点 ID 或原点位 ID 匹配，每条路线最多计一次。按覆盖次数降序，同次数优先有登记照片的景点，再按目录顺序，最多三项。界面明确写出收录次数。仅使用本次景区的响应，失败可单独重试。来源为 [地图数据契约](../../../visitor-app/domain/types.uts) 与[路线及点位服务](../../../visitor-app/services/guide-api.uts)。 | 比对灵山梵宫四条和拈花塔两条来源路线。切换景区后点卡片，核对详情 ID 及照片。路线接口 503 时景点列表仍可浏览。 |
| HOME-06 | 特色服务须有真实设施可以到达。 | 选取已登记的游客中心、讲解租借或手作及亲子场馆。只有当前接口返回同一设施 ID 才显示。打开原有详情，保留服务名称和地图操作。来源为[当前首页的设施映射](../../../visitor-app/pages/home/index.uvue)与[地图定位规则](map.md)。 | 从灵山“游客中心租借点”或拈花湾“拈花手作体验馆”进入详情，确认切区后不残留另一景区的设施。 |

## 来源与适配

HOME-01/02 把 Apple HIG 的层级、导航与可触控区域映射为原生标签栏、系统返回与同一内容边距。HOME-03/04 源于项目的 `guide-api.uts`、景点详情及通知语义。媒体来源和改动记录随首页资产一起维护。

参考 [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/) 与 [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)。

## 首页摄影来源

| 作品与作者 | 原件 SHA-1 | 分发条件 |
| --- | --- | --- |
| PHAN013，《无锡灵山大佛》，2023-03-19 | `c46e8f6ea8cb0bac7d5e5f84d92dcb785cf5f4b4` | [原始文件记录](https://commons.wikimedia.org/w/index.php?title=File:无锡灵山大佛.jpg&oldid=1113714323)，[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。 |
| 西安兵马俑，《灵山小镇拈花湾20200913 27》，2020-09-13 | `c821d0b61ac4853b3ef5326b6c248952640fff15` | [原始文件记录](https://commons.wikimedia.org/w/index.php?title=File:灵山小镇拈花湾20200913_27.jpg&oldid=904536466)，[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。移动版缩小、裁切并转码为 WebP，拈花湾衍生图同用 CC BY-SA 4.0。 |
| 王波波，《Grand Buddha at Ling Shan》，2013-10-05，实际画面为九龙灌浴 | `9d1367819fc64cd71644cf3a5870d32d839c1113` | [原始文件记录](https://commons.wikimedia.org/wiki/File:Grand_Buddha_at_Ling_Shan.jpg)，[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。移动版压缩转为 WebP，衍生图保持 CC BY-SA 3.0。 |

新增五个景点的来源、作者、许可和缩略图分发位置见[实景图片登记](../assets/asset-management.md)。若接口返回其他景点，不可用上述照片冒充该景点的实景。应用内“我的 → 照片署名”按景区提供离线署名。
