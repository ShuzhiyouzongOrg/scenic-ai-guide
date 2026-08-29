# 数智游踪桌面端

桌面端使用 Electron 与 electron-builder 封装现有 Vue 前端和 Node.js 服务端。应用启动时会在本机回环地址上分配随机端口，运行数据写入 Electron 的 `userData/runtime` 目录，不修改打包内资源。桌面运行时使用 Electron 内置的 `node:sqlite`，避免 Linux 安装包携带与构建机 glibc 绑定的数据库原生模块。

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

Windows 本地构建缓存和打包输出会自动写入工作区的 `LocalTemp`，其中解包与安装产物位于 `LocalTemp/desktop-dist`。CI 产物仍输出到 `desktop/dist`。当前产物未签名，首次启动可能显示操作系统安全提示。

## GitHub Actions

`.github/workflows/desktop-artifacts.yml` 同时支持自动触发与手动触发。工作流、桌面端、Web 端、桌面运行时服务代码或数据，以及共用 XLSX 依赖发生变更并推送到 `main` 后，会自动构建一次 Web 产物，再分别在 Windows x64、macOS x64、macOS arm64 与 Linux x64 环境生成 `.exe`、`.dmg`、`.AppImage` 和 `.deb`，并上传为 Actions Artifacts。仅修改文档或游客移动端时不会触发桌面构建；需要构建其他分支时仍可使用 `workflow_dispatch` 手动运行。

Electron 43 的官方平台基线包含 Ubuntu 18.04 及以上版本。Linux 打包任务会检查 `.deb`、`.AppImage` 和解包运行时，并在发现 Node 原生模块时失败，防止再次引入依赖构建机 glibc 的文件。正式发布前仍建议在 Ubuntu 18.04、20.04 和 22.04 的干净环境中分别执行安装、启动和数据库读写验收。

该工作流不会创建或发布 GitHub Release，也不会自动更新应用。相同分支出现连续构建时，新任务会取消仍在运行的旧任务，避免重复消耗构建资源。桌面安装产物保留 30 天，可直接下载测试；用于各平台打包的中间 Web 产物保留 1 天。

1. 在仓库 **Settings > Actions > General** 中允许 GitHub Actions 运行。
2. 按下方清单配置构建所需的 Repository secrets。
3. 将工作流提交并推送到默认分支；后续相关改动进入 `main` 时会自动运行。
4. 如需手动构建，打开 **Actions > Build desktop artifacts > Run workflow** 并选择目标分支。
5. 等待四个平台任务完成，在该次运行页面底部下载 Artifacts。

在仓库 **Settings > Secrets and variables > Actions** 中配置以下 Repository secrets：

- `DEEPSEEK_API_KEY`
- `XFYUN_APP_ID`
- `XFYUN_API_KEY`
- `XFYUN_API_SECRET`

工作流在构建前端时注入讯飞交互数字人凭证，在打包时生成被 Git 忽略的桌面服务配置。桌面端也会通过受限的预加载桥接读取本机运行配置，避免前端编译配置意外缺失时直接降级为纯文本。缺少任一必需 Secret、前端未内联讯飞配置、安装包未携带服务配置、数据库代码不是 `node:sqlite` 路径，或产物包含原生 `.node` 文件时，工作流都会明确失败。

Linux 构建固定使用 Ubuntu 22.04 runner，并对 DEB、AppImage 与解包目录中的所有 ELF 文件执行 `GLIBC_2.27` 上限检查，以保持 Electron 43 官方声明的 Ubuntu 18.04 最低兼容基线。Windows 门禁会解包最终 NSIS 安装器并启动其中的应用，真实验证 DeepSeek 问答、讯飞数字人连接、本地服务和 SQLite 初始化。

评审版安装包会明文携带可被解包读取的评审专用凭证，只能在受控的内部评审范围分发；评审结束后必须轮换相关密钥。正式公开发行前应改为远程服务端代理或操作系统凭据存储。

macOS 应用未签名、未公证，Windows 安装程序也未签名，仅适合内部评审测试。
