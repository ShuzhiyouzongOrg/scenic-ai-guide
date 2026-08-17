<p align="center">
  <img src="docs/readme-banner-cn-transparent.png" alt="数智游踪" width="900">
</p>
<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">简体中文</a>
</p>

<div align="center">
  <p><a href="https://www.shuzhiyouzong.cn">介绍站</a> | <a href="https://docs.shuzhiyouzong.cn">文档站</a> | <a href="https://www.shuzhiyouzong.cn/downloads">下载站</a></p>
</div>

# 数智游踪 - AI数字人景区导览

## 项目简介

数智游踪是一套面向景区游客的多端智能导游平台。项目以景区知识库和检索增强生成技术为基础，将文字问答、语音交互、AI 导游、数字人、手绘地图、路线规划和游客服务整合为完整的导览闭环。

项目由网页端、独立游客移动端、桌面端和统一服务端组成，已形成微信小程序、Android、HarmonyOS、iOS、Web、Windows、Linux 和 macOS 的多端交付形态。游客可以通过首页、地图、AI 导游、行程和我的五个主入口完成景区探索、智能问答和游览记录管理。

## 项目背景与赛题说明

本项目面向第十五届中国软件杯 A5 赛题，聚焦景区数字化导览场景中信息分散、讲解方式单一、路线规划不够个性化以及多端服务体验不一致等问题。

项目以灵山胜境和拈花湾为主要示范景区，使用景点、开放信息、导览内容和路线资料构建景区知识服务。通过统一 API 服务，网页端、游客移动端和桌面端共享同一套账号、问答、地图、路线、语音和数字人业务能力；通过本地手绘地图与在线地图兜底方案，满足网络不稳定场景下的基本导览需求。

## 核心功能

1. 景区知识问答。基于结构化景区知识库和 RAG 检索，支持景点介绍、开放信息、游览建议和上下文连续问答。
2. 语音导览。支持录音上传、讯飞流式语音听写、文本回答和讯飞语音合成；云服务不可用时可以切换到演示模式。
3. 数字人交互。Android、iOS、HarmonyOS 和 H5 支持受控 HTTPS WebView 中的讯飞动态数字人；微信小程序使用原生 Live2D 组件与讯飞云音色组合，提供本地形象降级能力。
4. 手绘地图与路线。支持灵山胜境和拈花湾切换，展示手绘地图、景点点位、当前位置、搜索结果和多条推荐路线，并支持平移、缩放和地图底图切换。
5. 行程管理。支持根据游客偏好生成景区行程，保存、读取和恢复行程，并将推荐路线同步到地图页面。
6. 游客账户。支持注册、登录、登录态恢复、退出、头像上传、景点收藏、游览足迹和意见反馈。
7. 多语言界面。游客端提供简体中文、繁体中文等语言切换能力，语言偏好保存在本地状态中。
8. 管理与运营。网页端提供景区内容、知识库、数字人配置、游客反馈、会话和运营数据等管理能力。

## 在线入口

| 资源 | 地址 |
| --- | --- |
| 官方网站 | [www.shuzhiyouzong.cn](https://www.shuzhiyouzong.cn) |
| 介绍站 | [www.shuzhiyouzong.cn/website-preview](https://www.shuzhiyouzong.cn/website-preview) |
| 文档站 | [docs.shuzhiyouzong.cn](https://docs.shuzhiyouzong.cn) |
| 下载站 | [www.shuzhiyouzong.cn/downloads](https://www.shuzhiyouzong.cn/downloads) |
| 公网 API | [api.shuzhiyouzong.cn](https://api.shuzhiyouzong.cn) |

## 技术栈

| 层级 | 主要技术 |
| --- | --- |
| 网页端 | Vue 3、TypeScript、Vite、Element Plus、Tailwind CSS、Leaflet、腾讯位置服务 JavaScript API |
| 服务端 | Node.js、ES Modules、HTTP API、SQLite、better-sqlite3、RAG 检索服务 |
| 大模型与语音 | OpenAI 兼容接口、讯飞 IAT、讯飞 TTS、讯飞交互式数字人 |
| 游客移动端 | uni-app x Vapor、UTS、RiceUI、DCloud 原生组件、微信原生 Live2D 组件 |
| 桌面端 | Electron、electron-builder、Node.js 原生运行时校验 |
| 工程与交付 | HBuilderX、微信开发者工具、DevEco Studio、GitHub Actions、Nginx、TLS |

## 目录结构

以下为项目主要目录，依赖缓存、构建产物和大体积模型文件未列出。

```text
project-root/
  .github/workflows/        桌面端持续集成与构建工作流
  desktop/                  Electron 桌面客户端
    assets/icons/           桌面端与移动端共用品牌图标
    scripts/                打包、运行时检查和产物校验脚本
  web/                      Vue 3 网页端与管理后台
    src/views/              游客页面与管理页面
    src/components/         地图、数字人和业务组件
    src/lib/live2d/         Live2D 运行时与模型适配
    src/vm-sdk/             讯飞数字人 SDK 资源
    public/map-guide/       景区地图与导览资源
    tests/map-guide/        地图、路线、国际化和数字人测试
  visitor-app/              uni-app x 游客移动端
    pages/                  首页、地图、AI 导游、行程和我的
    components/             移动端业务组件
    services/               API、语音、地图和导览服务
    stores/                 会话、语言和偏好状态
    uni_modules/rice-ui/    跨平台移动 UI 组件
    wxcomponents/           微信原生 Live2D 组件
    native-assets/          Android、iOS 和 HarmonyOS 原生资源
    static/                 地图、头像、数字人和底部导航资源
    manifest.json           应用与平台配置
    pages.json              页面、分包和底部导航注册
  server/                   Node.js 后端与 RAG 服务
    src/app.mjs             HTTP API 入口
    src/services/            检索、问答、语音、地图和数字人服务
    src/web/                 受控数字人 WebView 页面
    data/generated/          景区知识库和地图数据
    scripts/                 初始化、迁移、测试、评测和运维脚本
  docs/                     设计、部署、平台环境和比赛材料
  deploy/                   Nginx、TLS 和生产发布脚本
  data/                     项目数据与源材料
  vendor/                   内置第三方依赖包
```

## 安装与运行

### 环境要求

- Node.js 20 或更高版本，用于服务端开发；桌面端打包建议使用 Node.js 22 或更高版本。
- pnpm 9 或更高版本，用于网页端依赖管理。
- Git、Python 和可用的网络环境。
- 使用真实云端大模型、语音或数字人时，需要配置相应服务账号；离线演示可以使用 Mock 模式。

### 启动服务端

在仓库根目录执行：

```powershell
Set-Location server
Copy-Item .env.example .env
npm install
npm run db:init
npm start
```

服务端默认监听 `http://127.0.0.1:5178`，健康检查地址为 `http://127.0.0.1:5178/api/health`。

`server/.env` 中的关键配置包括：

- `DEMO_MODE=true`：启用离线演示降级能力。
- `LLM_PROVIDER=mock`：使用本地确定性回答；接入云模型时改为 `openai` 并填写兼容接口参数。
- `ASR_PROVIDER` 和 `TTS_PROVIDER`：选择 Mock 或讯飞语音服务。
- `XFYUN_APP_ID`、`XFYUN_API_KEY`、`XFYUN_API_SECRET`：只保存在服务端环境变量中，不要写入前端或提交到 Git。

### 启动网页端

另开终端执行：

```powershell
Set-Location web
pnpm install
pnpm dev
```

网页端默认使用 `http://localhost:3006`，开发环境中的 `/api` 请求由 Vite 代理到服务端 `5178` 端口。网页端生产构建命令为：

```powershell
pnpm build
```

构建产物输出到 `web/dist`。

### 启动桌面端

桌面端需要先完成网页端构建并准备服务端运行时：

```powershell
Set-Location desktop
npm install
npm test
npm start
```

常用打包命令如下：

```powershell
npm run dist:win
npm run dist:linux
npm run dist:mac:x64
npm run dist:mac:arm64
```

桌面端安装包输出到 `desktop/dist`，具体文件名随版本和构建平台变化。

### 编译游客移动端

使用 HBuilderX 5.24 打开 `visitor-app` 目录，根据目标平台选择运行或发行：

- Web/H5：运行到浏览器或发行到网站目录。
- 微信小程序：发行到微信开发者工具，打开 `visitor-app/unpackage/dist/build/mp-weixin`。
- Android：选择 Android 原生运行或云打包；独立 APK 需要配置 DCloud 云证书或自有 keystore。
- iOS：使用 macOS 与 Xcode 完成模拟器运行、签名和发行。
- HarmonyOS：使用 DevEco Studio 打开 HBuilderX 生成的 HarmonyOS 工程，再构建 HAP。

移动端的详细平台配置、证书、地图 Key 和公网域名说明见：

- `visitor-app/README.md`
- `docs/multi-platform-credentials-and-map-keys.md`
- `docs/harmony-development-environment.md`
- `docs/xfyun-digital-human-integration.md`

## 使用说明

1. 启动服务端和网页端，打开网页首页。
2. 从首页选择景点，进入景点详情后可查看介绍、收藏景点、定位地图或向 AI 导游提问。
3. 在地图页面切换灵山胜境或拈花湾，使用景点点位、搜索、定位、地图缩放和路线切换功能。
4. 在 AI 导游页面输入文字或录音提问，查看知识库回答、数字人状态、语音播报和推荐问题。
5. 在行程页面生成、保存和恢复个性化游览计划。
6. 在我的页面管理游客账号、头像、收藏、足迹、语言和意见反馈。

## 测试与质量保障

网页端测试：

```powershell
Set-Location web
pnpm test
```

服务端测试脚本按功能拆分，可在 `server` 目录运行：

```powershell
npm run check
npm run test:db
npm run test:retrieval
npm run test:chat
npm run test:routes
npm run test:digital-human
npm run test:voice
npm run test:xfyun-asr
npm run test:xfyun-tts
```

桌面端运行时测试：

```powershell
Set-Location desktop
npm test
```

持续集成工作流 `.github/workflows/desktop-artifacts.yml` 会执行网页测试与构建、数字人资源校验、桌面端运行时测试、安装包冒烟测试和 SHA-256 产物校验。

## 生产部署注意事项

- 生产 API 应通过 HTTPS 提供，并由 Nginx 将 `/api`、SSE 和 WebSocket 请求反向代理到 Node.js 服务端。
- 所有大模型、讯飞、数据库和对象存储凭据只放在服务端环境变量或受控密钥管理系统中。
- 生产环境应关闭调试配置，修改默认管理员密码，设置随机 `JWT_SECRET` 和 `XFYUN_AVATAR_SESSION_SECRET`。
- 腾讯地图 Key 应设置域名和平台限制；服务端代理的 WebService Key 不应写入客户端构建产物。
- 发布前请备份 SQLite 数据库、游客上传文件和服务端环境配置，并使用 `deploy` 目录中的脚本进行检查。


## 许可证

本仓库当前为私有项目，未授予任何开源许可证，源码、模型、景区资料和构建产物仅限项目组授权范围内使用。未经项目组书面许可，不得复制、再发布、反向工程或用于商业用途。

仓库中的第三方依赖、DCloud 组件、讯飞 SDK、地图服务及模型资源分别受其原始许可证、服务协议和授权范围约束。使用者应在部署和发布前逐项核对相应条款。

## 安全与隐私

请勿提交 API Key、API Secret、JWT 密钥、数据库文件、游客上传文件或包含个人信息的日志。发现凭据泄露时，应立即在对应服务平台吊销并轮换，同时清理构建产物和发布包中的敏感数据。

