# 微信小程序验证

2026-11-22，Windows。工作区 manifest 指定基础库 3.7.1。正式 AppID 的本地模拟器在微信开发者工具 Stable 1.06.2303220、基础库 3.18.0 上完成七页实际操作，另有早期游客模拟器的首页和行程记录。模拟器使用本机演示 API，最终生产编译使用项目 HTTPS 配置。[七页宿主操作与截图](wechat-followup.md#七页宿主记录)

## 早期开发编译与游客宿主

| 环境 | 所做操作 | 观测结果 |
| --- | --- | --- |
| HBuilderX 5.24 开发模式 | 执行 `cli.exe launch mp-weixin --project <visitor-app> --compile true` | 编译成功。编译器报告 uni-app x VDOM 与样式隔离 2.0，输出 5 个主 Tab 和 4 个子包页面。 |
| 微信游客模拟器 | 打开临时副本，观察首页并点击底部“行程”。模拟器为 iPhone 12/13 Pro 预设、79% 展示比例。 | 实景 Banner、两张原创插画、导航与选中态可见。点按后路由栏由 pages/home/index 变为 pages/trip/index，行程页显示时长与兴趣选择及空状态。[首页](evidence/wechat-home.png) · [行程](evidence/wechat-trip.png) |
| 原 AppID / 自动化 SDK | 首次微信 CLI 尝试返回 code 10。游客 QA 使用基础库 3.17.1，自动化 SDK 能连接本地端口，首次检查仅取得首页和行程截图。 | IDE 当时报告 login expired、no userinfo 和 41001。后续正式 AppID 的人工操作及热编结果按日期另行记录。[七页宿主记录](wechat-followup.md#七页宿主记录) |
| 微信开发者工具控制台 | 游客模式下观察编辑器诊断。 | 控制台出现游客 API 限制和启动错误；未获取全部错误首行。代码依赖分析还提示 Cubism Core 的 fs、path，这些引用位于上游判断 Node 宿主的分支。保留原组件及供应商代码，不能据此认定小程序 Live2D 已可播放。 |

截图仅裁切模拟器屏幕区域，发布前的素材压缩和随后调整的内边距、文字等不回写到既有截图。

## 本地生产模式与体积

HBuilderX 的 `publish mp-weixin --upload false` 返回“此功能需要先登录”。该机器可通过同版本内置 DCloud 编译器生成生产模式代码。以下命令从仓库根目录运行，输出到独立临时路径；没有调用微信上传、签名或预览接口。

```powershell
$plugins = 'D:\HBuilderX.5.15.2026070915\HBuilderX\plugins'
$env:UNI_INPUT_DIR = (Resolve-Path visitor-app).Path
$env:UNI_OUTPUT_DIR = Join-Path $env:TEMP 'scenic-wx-final-20261122-build-r3/mp-release'
$env:UNI_HBUILDERX_PLUGINS = $plugins
$env:UNI_CLI_CONTEXT = Join-Path $plugins 'uniapp-cli-vite'
$env:UNI_APP_X = 'true'
$env:UNI_APP_X_VAPOR = 'true'
$env:UNI_PLATFORM = 'mp-weixin'
Push-Location $env:UNI_CLI_CONTEXT
& "$plugins/node/node.exe" node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p mp-weixin
Pop-Location
python scripts/check-wechat-package.py $env:UNI_OUTPUT_DIR
```

微信公开规范规定每个分包/主包 2M，上限应按单包检查。project.config.json 的 bigPackageSizeSupport 只扩展预览与调试额度。不能将该开关作为发布容量。下列数字累加本地编译文件大小，按 app.json 的 subPackages.root 分组，排除开发者工具工程文件与已核实的 packOptions 文件。微信工具二次编译、归档与线上签名后的最终体积需在正式账号下核对。[微信分包限制](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages.html) · [微信工程配置](https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html)

优化前一次生产输出的原始主包为 2,795,204 B。优化采取以下措施。

- 同路径 Haru 回退立绘从 588×1580 全色透明 PNG（403,264 B）改为 420×1129 的透明 PNG8（49,315 B）。Cubism core、微信原生组件、模型加载逻辑和渲染画布完整保留。
- 灵山与拈花湾地图原尺寸和裁切分别保持 2048×1888、1772×2048。仅调整移动 WebP 编码，由 572,886 B 降为 360,560 B。原图/衍生图 RGB PSNR 分别为 35.77 与 36.86 dB，人工核对建筑轮廓与道路细节。项目原高分辨率手绘底图仍在 web/public/map-guide/areas。
- 两张目的地摄影位于主包。六张地点卡缩略图合计 21,986 B，六张对应的详情摄影置于 spot 子包，合计 310,038 B。校验器检查缩略图和更高分辨率详情图分别存在。见[素材登记](../assets/asset-management.md)。
- 仅对微信打包忽略独立的 30,496 B Rice 字体副本。编译器已将同一 TTF 完整内联在小程序 WXSS。[体积校验器](../../../scripts/check-wechat-package.py)解码并逐字节核对相同字体，还检查所有 JS/WXML/WXSS 不引用被排除路径。其他平台与原字体源文件不受影响。

### 密码修复版与 Live2D 修复版

使用同一体积校验器测量三次独立的 DCloud 5.24 生产输出。修复账号密码掩码后的主包为 **2,078,296 B**，余 18,856 B。首次更新微信原生 Live2D 适配代码后为 **2,082,792 B**，余 14,360 B。宿主复测发现再次进入舞台会重复注册 Cubism 回调。保留暂停时的画布、复用回调后的最终主包为 **2,083,158 B**，较上版增加 366 B，余 **13,994 B**。上述数字属于本地发布前校验，微信上传包的大小仍须以开发者工具实际打包结果为准。[最终体积、路由与适配文件指纹](evidence/wechat-live2d-final.json)

最终生产编译输出 `DONE Build complete`。账号 WXML 含微信原生布尔属性 `password="{{true}}"`，AI 页注册原生 `scenic-live2d`。独立核对产物内适配组件的 JS、WXML、WXSS 与原生 runtime 入口，四个文件均与输入逐字节相符。六张缩略图与六张详情摄影分别通过主包和子包校验。

| 包 | 本地发布前体积 |
| --- | ---: |
| 主包 | **2,083,158 B** |
| pages/spot | 318,811 B |
| pages/auth | 8,339 B |
| pages/favorites | 8,638 B |
| pages/feedback | 7,257 B |

从最终生产目录解析五个主页面及四个分包页面的组件、WXS 与样式依赖。开发者工具自带的 WCC 与 WCSC 对九条路由分别返回 0，并各自产出非空结果。模板与样式编译可复核包内文件的完整性；用户点按、状态变化、密码掩码和数字人画面的实测情况见宿主记录。发布前仍应通过微信真机检查录音权限、微信音频播放、定位和 Live2D 渲染。[九条路由的编译明细](evidence/wechat-live2d-final.json) · [七页宿主操作与截图](wechat-followup.md#七页宿主记录)
