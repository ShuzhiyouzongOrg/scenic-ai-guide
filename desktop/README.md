# 数智游踪桌面端

桌面端使用 Electron 与 electron-builder 封装现有 Vue 前端和 Node.js 服务端。应用启动时会在本机回环地址上分配随机端口，运行数据写入 Electron 的 `userData/runtime` 目录，不修改打包内资源。

## 本地运行

先构建前端，再安装桌面端依赖并启动：

```powershell
cd web
pnpm install --frozen-lockfile
pnpm build

cd ..\desktop
npm ci
npm start
```

开发态会读取 `server/.env`，并将运行数据放在工作区的 `LocalTemp/desktop-user-data`。本地打包时只会提取大模型、语音和默认数字人所需的白名单配置，写入被 Git 忽略的 `desktop/generated/server.env`；账号、JWT 等服务端管理配置不会打入安装包。安装后，该文件会复制到应用的 `userData/server.env`。用户手工维护的、没有托管标记的 `server.env` 不会被覆盖。

## 本地打包

```powershell
cd desktop
npm run dist:win
```

Windows 本地构建缓存会自动写入工作区的 `LocalTemp`，安装包输出到 `desktop/dist`。当前产物未签名，首次启动可能显示操作系统安全提示。

## GitHub Actions

`.github/workflows/desktop-artifacts.yml` 仅支持手动触发。它分别在 Windows x64、macOS x64、macOS arm64 与 Linux x64 环境生成 `.exe`、`.dmg`、`.AppImage` 和 `.deb`，并上传为 Actions Artifacts。

该工作流不会创建或发布 GitHub Release，也不会自动更新应用。待审核后将工作流提交到默认分支，才会在仓库的 **Actions** 页面出现手动运行入口。构建产物保留 30 天，可直接下载测试。

1. 在仓库 **Settings > Actions > General** 中允许 GitHub Actions 运行。
2. 将工作流提交并推送到默认分支。
3. 打开 **Actions > Build desktop artifacts > Run workflow**，选择默认分支并运行。
4. 等待四个平台任务完成，在该次运行页面底部下载 Artifacts。

在仓库 **Settings > Secrets and variables > Actions** 中配置以下 Repository secrets：

- `DEEPSEEK_API_KEY`
- `XFYUN_APP_ID`
- `XFYUN_API_KEY`
- `XFYUN_API_SECRET`

工作流在构建前端时注入讯飞交互数字人凭证，在打包时生成被 Git 忽略的桌面服务配置。缺少任一必需 Secret 时打包会明确失败，不再生成自动降级到 Mock/纯文本模式的安装包。当前产物会携带评审环境凭证，只适合内部评审；正式公开发行前应改为远程服务端代理并轮换密钥。

macOS 应用未签名、未公证，Windows 安装程序也未签名，仅适合内部评审测试。
