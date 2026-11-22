# 视觉资产登记与发布

新增图片前按用途分配路径。地图底图归 static/map、角色归 static/digital-human、导航位图归 static/tabbar、摄影归 static/destinations、原创功能插画归 static/editorial。上传头像通过原账号服务管理。可离线的包内素材保持稳定的绝对资源路径，页面不拼接未知外链。

语音球体五张原创纹理位于 static/guide-stage，包括主体、高光、光晕、思考态材质与实测信号环。运行 `python scripts/build-guide-art.py` 从项目 Token 与数学图形生成 WebP；脚本同时对既有角色母版重编码。角色母版与模型继续适用原权利说明。透明边缘和文件字节记录在[球体组件规范](../components/ai-ambient-orb.md)。[生成器源码](../../../scripts/build-guide-art.py) · [角色使用范围](../../../server/src/web/live2d/THIRD_PARTY_NOTICES.md)

本轮从 Git 中原始手机地图直接重编码两张景区手绘底图，保留像素尺寸、裁切与标定坐标。两图合计由 360,560 B 降为 304,852 B（节省 55,708 B），其中灵山 168,458 B、拈花湾 136,394 B。相对上一发布图的 PSNR 分别为 35.54 dB、36.85 dB；以 1:1 目检道路和建筑，地图点位及命中仍由其工程坐标决定。此项度量描述本次图像编码；生产主包还须包含脚本、UI 与其他资源一并量取。[灵山底图](../../../visitor-app/static/map/lingshan-artwork.webp) · [拈花湾底图](../../../visitor-app/static/map/nianhuawan-artwork.webp)

| 资产 | 来源与权利 | 加工与分发 |
| --- | --- | --- |
| destinations/lingshan.webp | PHAN013 2023 实拍，《无锡灵山大佛》，CC0 1.0 | 780×440，22,694 B；裁切、去元数据、WebP 转码。景区首页、匹配的 LS-011 详情可用。 |
| destinations/nianhuawan.webp | 西安兵马俑 2020 实拍，《灵山小镇拈花湾20200913 27》，CC BY-SA 4.0 | 780×440，52,716 B；裁切、去元数据、WebP 转码。改编图按 CC BY-SA 4.0 分发。 |
| jiulong.webp | 王波波，《Grand Buddha at Ling Shan》，画面为九龙灌浴，CC BY-SA 3.0 | LS-006，详情 704×490，32,930 B，列表 3,992 B。 |
| xiangfu.webp | 王波波，《Wuxi Xiangfu Temple》，CC BY-SA 3.0；原件 SHA-1 `083d3e727efcd1f9a0357f4faa336dd138285aba`。[作者与原件](https://commons.wikimedia.org/wiki/File:Wuxi_Xiangfu_Temple.jpg) | LS-010，祥符禅寺，详情 760×528，75,558 B，列表 4,628 B。 |
| brahma.webp | Joaquín Salido Bello，《Holy Altar in Brahma Palace》，CC BY-SA 4.0；原件 SHA-1 `8b5e2e3a0e1fb37db76047de08fadbd2de29b14e`。[作者与原件](https://commons.wikimedia.org/wiki/File:Holy_Altar_in_Brahma_Palace.jpg) | LS-013，灵山梵宫内景，详情 760×507，101,058 B，列表 5,752 B。 |
| mandala.webp | Synyan，《Lingshan “Five-signets” Palace》，CC BY 3.0；原件 SHA-1 `1f29cba1e11fd19d6a5f8bae821b1f16269c900b`。[作者与原件](https://commons.wikimedia.org/wiki/File:Lingshan_%22Five-signets%22_Palace.jpg) | LS-014，五印坛城，详情 500×324，18,322 B，列表 2,344 B。 |
| tower.webp | 西安兵马俑，《灵山小镇拈花湾20200912 05》，CC BY-SA 4.0；原件 SHA-1 `bb16cdc599af9877ae67b22da110e7fc232fbb31`。[作者与原件](https://commons.wikimedia.org/wiki/File:灵山小镇拈花湾20200912_05.jpg) | nianhuawan-169，拈花塔，详情 450×600，29,320 B，列表 2,786 B。 |
| wudeng.webp | 西安兵马俑，《灵山小镇拈花湾20200913 30》，CC BY-SA 4.0；原件 SHA-1 `f0d0cc80786709f95af03fbd68bbdc0da2d2fc94`。[作者与原件](https://commons.wikimedia.org/wiki/File:灵山小镇拈花湾20200913_30.jpg) | nianhuawan-175，五灯湖广场临湖观景。按拍摄位置和湖中的莲花舞台核对，详情 760×570，52,850 B，列表 2,484 B。 |
| editorial/guide.webp、trip.webp | 项目新生成的功能插画 | 原创生成过程、输出尺寸、验收照片及使用限制见[插画登记](generated-illustrations.md)。 |
| map、digital-human、logo、旧业务素材 | 基线工程及供应商的既有使用场景 | 沿用原目录和接口。基础地图、角色文件与品牌资源不可作为通用摄影分发。新增用途需核实授权范围。 |

摄影原始页面、文件校验与许可链接见[摄影来源](../pages/home.md)。在安装包中通过“我的 → 照片署名”查看作者、许可及加工说明。按图片单独适用许可。更新照片需同时更新该入口和本表。

**ASSET-01**　进入资源库前确认创作者、权利人、原始 URL、版本或文件哈希、用途、修改及许可。服务器 `data/generated/map-guide/media-manifest.json` 中的 `migrationStatus: pending-license` 表示外部来源尚待核实，不能自动作为上线图片。已知景点和已批准本地图由 `design/scenic-media.uts` 显式对应，未知图片采用点位图标。

**ASSET-02**　照片替换后打开真实业务页，检查主体、缓存、失败与暗色字体。列表使用 static/destinations 中的 160×124 裁切图，详情保留原构图并从 pages/spot/static 加载；灵山大佛复用首页摄影。六张详情图合计 310,038 B，六张缩略图合计 21,986 B。新增五幅图经过裁切、缩放、转 WebP，沿用各自许可。原件的 SHA-1 来自 Wikimedia 文件记录，应用内“我的 → 照片署名”按景区显示作者、变更、原件和许可链接。

**ASSET-03**　删除旧资源前用版本控制检索所有模板、运行时映射、原生 manifest、服务器字段和微信插件依赖。授权不明的图片可暂时移出展示，保留业务文案、详情、地图和收藏。更新后的许可证与术语是否适用，由维护者按原始条款核实。
