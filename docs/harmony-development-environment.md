# 鸿蒙开发环境配置指南

本文档适用于仓库中的 `visitor-app`（uni-app x Vapor），用于在 Windows 上完成 HarmonyOS 应用的编译、模拟器运行、真机调试与签名准备。

## 1. 当前项目基线

| 项目 | 当前配置 |
| --- | --- |
| HBuilderX | 5.24.2026081301 |
| 本地路径 | `D:\HBuilderX.5.15.2026070915\HBuilderX`（目录名未随升级变化） |
| DevEco Studio | 6.1.1.300 Release |
| DevEco Studio 路径 | `D:\DevEco Studio` |
| HarmonyOS SDK | 6.1.1.125 / API 24 Release |
| uni-app x | Vue 3 + Vapor |
| HarmonyOS 建议版本 | API 20+ |
| 鸿蒙 Bundle Name | `com.scenic.guide.visitor` |
| 源码目录 | `E:\A5软件杯\项目源代码\visitor-app` |
| 建议调试输出 | `D:\harmony-build\scenic-visitor-dev` |
| 建议发行输出 | `D:\harmony-build\scenic-visitor-release` |

HBuilderX 5.24 已满足 uni-app x 鸿蒙和 Vapor 的版本要求。HBuilderX 依赖 DevEco Studio 所带的鸿蒙工具链，单独安装 HBuilderX 不能完成鸿蒙构建。

## 2. 官方链接

- [DCloud：uni-app x 鸿蒙运行和发行](https://doc.dcloud.net.cn/uni-app-x/tutorial/harmony/runbuild.html)
- [DCloud：uni-app x Vapor 模式](https://doc.dcloud.net.cn/uni-app-x/app-vapor.html)
- [华为开发者联盟](https://developer.huawei.com/consumer/cn/)
- [DevEco Studio 下载](https://developer.huawei.com/consumer/cn/download/deveco-studio)
- [AppGallery Connect](https://developer.huawei.com/consumer/cn/service/josp/agc/index.html)
- [HarmonyOS 6 支持机型](https://consumer.huawei.com/cn/support/harmonyos/models-6/)
- [AGC 内部测试](https://developer.huawei.com/consumer/cn/doc/app/agc-help-internal-test-overview-0000002253054942)

## 3. 必备准备

### 3.1 华为开发者账号

1. 注册华为开发者账号。
2. 完成个人或企业实名认证。
3. 登录 AppGallery Connect。
4. 后续创建与 `com.scenic.guide.visitor` 对应的鸿蒙应用。

账号、证书密码、私钥和 Profile 均不得提交到 Git。

### 3.2 DevEco Studio

从华为官网下载最新 release 版本的 DevEco Studio。DCloud 当前文档列出的最低对应关系为：

- HBuilderX 4.61+：DevEco Studio 5.0.7.210+；
- HBuilderX 4.81+：DevEco Studio 5.1.0.849+；
- HBuilderX 5.14+：不再受 DevEco Studio 6.1.1 热更新兼容问题限制。

本项目使用 HBuilderX 5.24，因此优先选择最新 DevEco Studio release，避免使用 beta SDK 发行应用。

### 3.3 HarmonyOS SDK

在 DevEco Studio 的 SDK Manager 中安装：

- HarmonyOS SDK API 20 或更高；
- Toolchains；
- ArkTS/构建工具；
- HDC 设备连接工具；
- API 20+ Emulator 系统镜像。

DCloud 文档要求模拟器最低 API 19；Vapor 推荐 API 20+。景区地图在鸿蒙端的完整行为仍需真机验证。

## 4. HBuilderX 配置

在 HBuilderX 中依次打开：

```text
工具 → 设置 → 运行配置 → 鸿蒙运行配置
```

将 DevEco Studio 安装目录填入“DevEco Studio 路径”。HBuilderX 会调用该目录内的 SDK、签名和设备工具。

可用 CLI 检查 HBuilderX 版本：

```powershell
& 'D:\HBuilderX.5.15.2026070915\HBuilderX\cli.exe' version
```

可用 CLI 查看鸿蒙设备：

```powershell
& 'D:\HBuilderX.5.15.2026070915\HBuilderX\cli.exe' devices list --platform app-harmony
```

## 5. 中文和长路径处理

当前仓库路径包含中文，鸿蒙工具链不适合直接在项目内生成深层构建目录。本仓库提供可提交的示例：

```text
visitor-app/docs/launch.example.json
```

复制为本机文件：

```text
visitor-app/.hbuilderx/launch.json
```

建议配置：

```json
{
  "version": "1.0",
  "configurations": [
    {
      "type": "uni-app:app-harmony",
      "distPathDev": "D:/harmony-build/scenic-visitor-dev",
      "distPathBuild": "D:/harmony-build/scenic-visitor-release"
    }
  ]
}
```

`.hbuilderx/launch.json` 属于本机配置，已被 Git 忽略。两个输出目录可能被 HBuilderX 删除并重建，不能在其中存放手工文件。

## 6. 模拟器配置

1. 打开 DevEco Studio，进入 Device Manager。
2. 阅读并接受 HarmonyOS Software Service Agreement 与 HarmonyOS SDK Agreement。
3. 登录华为账号。
4. 下载并创建 API 20+ 手机模拟器；本机已完成 Pura 90 / API 24 / x86_64 系统镜像安装。
5. 从 DevEco Studio 启动模拟器。
6. 使用 `hdc list targets` 或 HBuilderX CLI 确认设备不再显示为空。
7. 在 HBuilderX 中打开 `visitor-app`。
8. 选择“运行 → 运行到手机或模拟器 → 运行到鸿蒙”。

也可以使用 CLI 仅编译：

```powershell
& 'D:\HBuilderX.5.15.2026070915\HBuilderX\cli.exe' launch app-harmony `
  --project 'E:\A5软件杯\项目源代码\visitor-app' `
  --compile true `
  --cleanCache true
```

升级 HBuilderX 后首次运行建议清空构建缓存。

HBuilderX 会先生成 DevEco 原生工程，再由 OHPM 和 Hvigor 完成本地依赖解析、ArkTS 编译与 HAP 打包。若 HBuilderX 首次生成工程时出现本地 HAR 依赖尚未链接的情况，可在生成工程中显式使用 DevEco 自带的 Node 与 OHPM 重新安装依赖：

```powershell
$env:NODE_HOME = 'D:\DevEco Studio\tools\node'
$env:PATH = "D:\DevEco Studio\tools\node;D:\DevEco Studio\tools\ohpm\bin;$env:PATH"

Set-Location 'D:\harmony-build\scenic-visitor-dev'
& 'D:\DevEco Studio\tools\ohpm\bin\ohpm.bat' install
```

依赖安装后，可以完全在本地执行未签名调试 HAP 构建：

```powershell
$env:NODE_HOME = 'D:\DevEco Studio\tools\node'
$env:JAVA_HOME = 'D:\DevEco Studio\jbr'
$env:DEVECO_SDK_HOME = 'D:\DevEco Studio\sdk'
$env:PATH = "D:\DevEco Studio\tools\node;D:\DevEco Studio\tools\ohpm\bin;D:\DevEco Studio\jbr\bin;$env:PATH"

Set-Location 'D:\harmony-build\scenic-visitor-dev'
& 'D:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' `
  --mode module `
  -p product=default `
  -p module=entry@default `
  -p buildMode=debug `
  assembleHap `
  --no-daemon
```

`DEVECO_SDK_HOME` 必须指向 DevEco Studio 的 SDK 根目录。该命令只在本机编译，不会安装应用，也不会向 DCloud 上传源码或产物。

## 7. 真机连接

1. 准备可升级 HarmonyOS 5/6 的手机。
2. 在手机设置中开启开发者模式。
3. 开启 USB 调试，或在“开发者选项 → 无线调试”取得 IP 与端口。
4. 连接电脑并在手机端确认调试授权。
5. 执行 `devices list --platform app-harmony` 确认设备可见。
6. 在 HBuilderX 选择目标设备运行。

手绘导览、页面布局和基础业务可在 x86_64 模拟器验收；腾讯原生地图、系统定位、麦克风、音频和公网网络请求仍必须进行 arm64 真机验收。

## 8. 签名与 AGC

本机 Pura 90 debug 模拟器允许安装 `appSignType=none` 的未签名 HAP，因此当前测评不需要生成签名。HarmonyOS 真机与发行仍需要签名材料：

- 应用 Bundle Name；
- 调试/发布证书；
- 调试/发布 Profile；
- 私钥与密码；
- 测试设备 UUID。

HBuilderX 5.24 可以在运行对话框中自动申请调试证书。如果自动申请失败，在 DevEco Studio 或 AGC 中手动创建并配置。证书文件只保存在本机安全目录，不得放进 `visitor-app`、文档或 GitHub Actions 明文变量。

正式本地打包命令（HBuilderX 5.24 CLI 已验证存在，但当前尚未执行）：

```powershell
& 'D:\HBuilderX.5.15.2026070915\HBuilderX\cli.exe' pack app-harmony `
  --project 'E:\A5软件杯\项目源代码\visitor-app'
```

如需只生成本地打包 App 资源，可使用：

```powershell
& 'D:\HBuilderX.5.15.2026070915\HBuilderX\cli.exe' publish app-harmony `
  --project 'E:\A5软件杯\项目源代码\visitor-app' `
  --type appResource
```

在签名、地图 Key 和正式 API 地址未配置前，不应执行发布包验收。

注意：`pack app-harmony` 会在完成本地构建后进入 DCloud 的检查/发布交互，并可能上传生成的应用包；它不是纯离线编译命令。只需要验证本地编译时，应优先使用前述 `launch app-harmony --compile true` 与 Hvigor `assembleHap`，未经项目负责人确认不得执行 `pack` 或发行操作。

## 9. 项目能力配置

`visitor-app/manifest.json` 已预留：

- `uni-location/system`；
- `uni-map/tencent`；
- HarmonyOS phone/arm64-v8a；
- Bundle Name。

测评用 DCloud AppID、Web/Android/iOS/HarmonyOS 腾讯地图 Key、各端包标识和图标均已填写。手绘导览在 App 端使用官方支持的嵌套 `scroll-view` 实现平移和按钮缩放；`movable-view` 只保留在 Web/微信，因为 DCloud 兼容表明确其在 Android、iOS、HarmonyOS 不受支持。仍需后续完成：公网 HTTPS 证书和反向代理、Key 最小权限/白名单策略、arm64 鸿蒙真机地图验证、AGC 应用及签名材料、隐私政策和启动体验定稿。

定位统一使用 GCJ-02。国内地图服务与 GPS/WGS84 数据混用时必须先转换坐标，否则会产生位置偏移。

## 10. 隐私与权限

项目涉及以下敏感能力：

- 精确/模糊位置；
- 麦克风；
- 网络访问；
- 后续可能使用相册或相机。

发布前必须完成：

1. 首次启动用户协议和隐私政策；
2. 权限用途说明；
3. 仅在用户触发功能时请求权限；
4. 拒绝权限后的可用降级路径；
5. AGC 隐私配置与应用内文案保持一致。

## 11. 验收清单

- [x] HBuilderX 显示 5.24.x；
- [x] DevEco Studio 路径已配置；
- [x] API 20+ SDK 已安装；
- [x] 两项 HarmonyOS 协议已接受；
- [x] Pura 90（API 24、x86_64）设备实例已创建；
- [x] Pura 90 系统镜像已完整下载；
- [x] `.hbuilderx/launch.json` 使用短英文输出路径；
- [x] OHPM 本地 HAR 与远程依赖安装成功；
- [x] ArkTS、CMake/Ninja、资源处理和未签名调试 HAP 构建成功；
- [x] HBuilderX/HDC 能发现并连接模拟器；
- [x] 未签名 debug HAP 已在 Pura 90 安装并启动；
- [ ] HBuilderX 能发现鸿蒙真机；
- [ ] 调试签名可安装到指定真机；
- [ ] 地图、定位、麦克风和音频通过真机测试；
- [x] 测评用腾讯地图 Key 已绑定 `com.scenic.guide.visitor`；
- [ ] 正式 HTTPS API 在鸿蒙真机可访问；
- [ ] 隐私政策与权限申请流程通过验收；
- [ ] release 包在 AGC 内部测试渠道完成安装测试。

## 12. 本机实测记录（2026-08-14）

已确认：

- HBuilderX 为 `5.24.2026081301`；
- uni-app x 编译器为 `5.24.2026081216.3203`；
- DevEco Studio 为 `6.1.1.300`，安装于 `D:\DevEco Studio`；
- HarmonyOS SDK 为 `6.1.1.125` / API 24 Release；
- HDC 为 `3.2.0d`，Hvigor 为 `6.24.4`，OHPM 为 `6.1.2.285`，DevEco 内置 Node 为 `18.20.1`；
- HBuilderX 的 `harmony.devTools.path` 已指向 `D:\DevEco Studio`；
- 鸿蒙运行插件已安装，版本为 `5.24.2026080609.5410`；
- 本机 `.hbuilderx/launch.json` 已将调试/发行鸿蒙工程输出到 `D:\harmony-build` 下的短英文路径；
- Android 原生端按 Vapor“蒸汽模式”、字节码目标严格编译成功；
- Web 与微信小程序的 9 个页面编译成功；
- iOS 原生端按 Vapor“蒸汽模式”、字节码目标严格编译成功；
- HBuilderX 已完成 9 个产品页面的鸿蒙 UTS 编译，并生成完整 DevEco 原生工程 `D:\harmony-build\scenic-visitor-dev`；
- 使用 DevEco 内置 Node/OHPM 执行 `ohpm install` 后，`@dcloudio/uni-app-x-runtime`、`@uni_modules/uni-map-tencent` 和 `@uni_modules/uni-location-system` 的链接已恢复；
- DevEco Hvigor 已完成 ArkTS、CMake/Ninja、资源和 HAP 全链路构建，产物为 `D:\harmony-build\scenic-visitor-dev\entry\build\default\outputs\default\entry-default-unsigned.hap`；
- 最新业务代码对应的未签名 HAP 大小为 `87,076,885` 字节，SHA-256 为 `F3E26E30EAA71B4E41A82AA2A96C6C5FC73B32792EC88663C34242563E1A6EE2`；
- 两项 HarmonyOS 协议均已接受，Pura 90 系统镜像已完整安装到本机 SDK；
- Pura 90 模拟器正在运行（HarmonyOS 6.1.1 / API 24 / x86_64），HDC 目标为 `127.0.0.1:5555`；
- 最新未签名 HAP 已通过 `hdc install -r` 安装，`EntryAbility` 启动成功，`com.scenic.guide.visitor` 进程运行正常；模拟器包信息显示 `appProvisionType=debug`、`appSignType=none`；手绘地图、横向平移、数字人和景点卡片均通过 Pura 90 设备截图复核；
- `visitor-app/manifest.json` 已配置真实 DCloud AppID；本地未签名构建不依赖云打包；
- 鸿蒙调试/发行签名材料尚未配置。

因此 DevEco、SDK、Pura 90 和本地未签名 HAP 的编译—安装—启动链已经完成。下一步是用 arm64 HarmonyOS 真机验证地图、定位、麦克风、音频与 HTTPS 接口，并在需要真机/发行时配置华为证书与 Profile。

当前腾讯地图原生 `libmapengine.so` 只有 `arm64-v8a`，而 Pura 90 模拟器是 `x86_64`。因此腾讯“导航地图”必须在 arm64 HarmonyOS 真机最终验收；Pura 90 使用已验证的本地手绘地图作为降级路径。项目已在 `visitor-app/harmony-configs/entry/src/main/module.json5` 配置网络、精确/模糊位置、麦克风权限和测评用 `TENCENT_MAP_KEY`。腾讯控制台的当前 Key 编辑界面已明确显示“地图 SDK（Android/iOS/HarmonyOS NEXT）”并绑定本项目 appIdentifier；正式发布前仍应按生产应用、授权与密钥隔离策略复核。

不要将 DCloud/华为账号密码、证书密码、Secret Key 或私钥写入命令历史和仓库。DCloud AppID 的所有权和项目成员权限应由团队账号长期维护。

本机系统 `JAVA_HOME` 和全局 Node 版本不同于 DevEco 内置运行时。鸿蒙构建应由 HBuilderX/DevEco 发起，或显式使用 DevEco 自带的 JBR、Node、Hvigor 和 OHPM，避免全局环境污染构建结果。

## 13. CI 说明

鸿蒙本地打包依赖 DevEco Studio、HarmonyOS SDK 和签名环境。GitHub 托管 Windows Runner 默认没有这些工具，因此不能把普通 Web CI 当作鸿蒙云构建。

如后期配置 GitHub Actions，建议新增独立文件，例如 `.github/workflows/visitor-app.yml`，并使用安装好 HBuilderX/DevEco 的自托管 Runner。不要修改现有 `desktop-artifacts.yml`。签名材料应放入 GitHub Environments/Secrets，在作业中临时恢复并在结束后清理。
