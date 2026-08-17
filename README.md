<p align="center">
  <img src="docs/readme-banner-en-transparent.png" alt="SZYZ" width="900">
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">简体中文</a>
</p>

<div align="center">
  <p><a href="https://www.shuzhiyouzong.cn">Website</a> | <a href="https://docs.shuzhiyouzong.cn">Documentation</a> | <a href="https://www.shuzhiyouzong.cn/downloads">Downloads</a></p>
</div>

# ShuZhiYouZong - Scenic-AI-Guide

## Overview

SZYZ is a multi-platform intelligent tour guide for scenic-area visitors. It combines a scenic knowledge base, retrieval-augmented generation, text and voice interaction, digital humans, hand-drawn maps, route planning, itinerary management and visitor services into one guide experience.

The project is organized as a web client, an independent visitor application, a desktop client and a shared Node.js service layer. The delivery targets include WeChat Mini Program, Android, HarmonyOS, iOS, Web, Windows, Linux and macOS. The visitor application exposes five primary sections: Home, Map, AI Guide, Trip and Profile.

## Competition Context

The project was developed for the A5 track of the 15th China Software Cup. It addresses common scenic-tourism service problems: fragmented information, limited narration formats, generic route recommendations and inconsistent experiences across devices.

Lingshan and Nianhuawan are the main demonstration scenic areas. Their spot information, opening details, narration material and route data are organized into a reusable knowledge service. All clients consume the same APIs for accounts, questions, maps, routes, voice services and digital-human sessions. Local hand-drawn maps and online map fallback keep essential guide features available when network conditions are unstable.

## Core Capabilities

1. Scenic knowledge Q&A backed by structured data and RAG retrieval.
2. Voice guide workflow with recording upload, iFlytek streaming speech recognition and speech synthesis.
3. Digital-human interaction through a controlled HTTPS WebView on Android, iOS, HarmonyOS and H5; WeChat uses a native Live2D component with iFlytek cloud voice and local fallback animation.
4. Hand-drawn maps for Lingshan and Nianhuawan with spot markers, current location, search, pan, zoom, map switching and multiple route options.
5. Personalized itinerary generation, saving, loading and route synchronization with the map page.
6. Visitor registration, login restoration, logout, avatar upload, favorites, visit history and feedback.
7. Simplified Chinese and Traditional Chinese locale switching.
8. Web administration for scenic content, knowledge data, digital-human configuration, visitor feedback, conversations and operational analysis.

## Public Entry Points

| Resource | Address |
| --- | --- |
| Website | [www.shuzhiyouzong.cn](https://www.shuzhiyouzong.cn) |
| Introduction site | [www.shuzhiyouzong.cn/website-preview](https://www.shuzhiyouzong.cn/website-preview) |
| Documentation | [docs.shuzhiyouzong.cn](https://docs.shuzhiyouzong.cn) |
| Downloads | [www.shuzhiyouzong.cn/downloads](https://www.shuzhiyouzong.cn/downloads) |
| Public API | [api.shuzhiyouzong.cn](https://api.shuzhiyouzong.cn) |

## Technology Stack

| Layer | Main technologies |
| --- | --- |
| Web | Vue 3, TypeScript, Vite, Element Plus, Tailwind CSS, Leaflet and Tencent Location Service JavaScript API |
| Server | Node.js, ES modules, HTTP API, SQLite, better-sqlite3 and RAG services |
| AI and voice | OpenAI-compatible endpoints, iFlytek IAT, iFlytek TTS and iFlytek interactive avatar |
| Visitor application | uni-app x Vapor, UTS, RiceUI, DCloud native components and a WeChat native Live2D component |
| Desktop | Electron, electron-builder and Node.js runtime verification |
| Delivery | HBuilderX, WeChat DevTools, DevEco Studio, GitHub Actions, Nginx and TLS |

## Directory Structure

The following tree lists the major source directories. Dependency caches, build output and large model files are omitted.

```text
project-root/
  .github/workflows/        Desktop CI and packaging workflows
  desktop/                  Electron desktop client
    assets/icons/           Shared application branding assets
    scripts/                Packaging, runtime and artifact checks
  web/                      Vue 3 visitor and administration client
    src/views/              Visitor and administration pages
    src/components/         Map, avatar and business components
    src/lib/live2d/         Live2D runtime integration
    src/vm-sdk/             iFlytek avatar SDK assets
    public/map-guide/       Scenic maps and guide data
    tests/map-guide/        Map, route, locale and avatar tests
  visitor-app/              uni-app x visitor application
    pages/                  Home, map, AI guide, trip and profile
    components/             Mobile business components
    services/               API, voice, map and guide services
    stores/                 Session, locale and preference state
    uni_modules/rice-ui/    Cross-platform mobile UI components
    wxcomponents/           WeChat native Live2D component
    native-assets/          Android, iOS and HarmonyOS assets
    static/                 Map, avatar and tab bar assets
    manifest.json           Application and platform metadata
    pages.json              Page, subpackage and tab bar registration
  server/                   Node.js backend and RAG services
    src/app.mjs             HTTP API entry point
    src/services/            Retrieval, chat, voice, map and avatar services
    src/web/                 Controlled digital-human WebView pages
    data/generated/          Scenic knowledge and map data
    scripts/                 Initialization, migration, test, evaluation and operations scripts
  docs/                     Design, deployment, platform and competition documents
  deploy/                   Nginx, TLS and production release scripts
  data/                     Project data and source materials
  vendor/                   Vendored third-party packages
```

## Installation and Development

### Requirements

- Node.js 20 or later for server development; Node.js 22 or later is recommended for desktop packaging.
- pnpm 9 or later for the web client.
- Git, Python and network access for dependency installation.
- Cloud provider credentials only when real LLM, speech or avatar services are required. Mock mode supports offline demonstrations.

### Start the server

Run from the repository root:

```powershell
Set-Location server
Copy-Item .env.example .env
npm install
npm run db:init
npm start
```

The server listens on `http://127.0.0.1:5178` by default. The health endpoint is `http://127.0.0.1:5178/api/health`.

Keep provider credentials in `server/.env`. `DEMO_MODE=true`, `LLM_PROVIDER=mock`, `ASR_PROVIDER=mock` and `TTS_PROVIDER=mock` provide a deterministic offline demonstration. For cloud services, fill the provider-specific values in the server environment only.

### Start the web client

In a second terminal:

```powershell
Set-Location web
pnpm install
pnpm dev
```

The development server normally uses `http://localhost:3006`. Vite proxies `/api` requests to the server at port 5178. Create a production bundle with:

```powershell
pnpm build
```

The output is written to `web/dist`.

### Start and package the desktop client

```powershell
Set-Location desktop
npm install
npm test
npm start
```

Packaging commands:

```powershell
npm run dist:win
npm run dist:linux
npm run dist:mac:x64
npm run dist:mac:arm64
```

Installers are written to `desktop/dist`; filenames depend on the version and target platform.

### Build the visitor application

Open `visitor-app` with HBuilderX 5.24 and choose the target platform from the Run or Build menu:

- Web/H5: run in a browser or build the website output.
- WeChat Mini Program: build for WeChat DevTools and open `visitor-app/unpackage/dist/build/mp-weixin`.
- Android: run natively or use cloud packaging. A standalone APK requires a DCloud cloud certificate or a private keystore.
- iOS: use macOS and Xcode for simulator builds, signing and distribution.
- HarmonyOS: open the generated HarmonyOS project in DevEco Studio and build the HAP package.

For platform credentials, certificates, map keys and public domains, see:

- `visitor-app/README.md`
- `docs/multi-platform-credentials-and-map-keys.md`
- `docs/harmony-development-environment.md`
- `docs/xfyun-digital-human-integration.md`

## Usage

1. Start the server and web client, then open the web home page.
2. Select a scenic spot from Home. From the spot detail page, open the map, save the spot or ask the AI guide a question.
3. On Map, switch between Lingshan and Nianhuawan, search spots, locate the visitor, zoom the hand-drawn map and select a recommended route.
4. On AI Guide, submit text or a recording and review the knowledge answer, avatar state, voice playback and suggested questions.
5. On Trip, generate, save and restore a personalized visit plan.
6. On Profile, manage the account, avatar, favorites, visit history, language and feedback.


## Testing

Web tests:

```powershell
Set-Location web
pnpm test
```

Server checks and feature tests:

```powershell
Set-Location server
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

Desktop runtime tests:

```powershell
Set-Location desktop
npm test
```

## Production Notes

- Serve the production API over HTTPS. Nginx must proxy `/api`, SSE and WebSocket traffic to the Node.js service.
- Store LLM, iFlytek, database and object-storage credentials in server-side environment variables or a controlled secret manager.
- Disable development settings, change the default administrator password, and generate random `JWT_SECRET` and `XFYUN_AVATAR_SESSION_SECRET` values before deployment.
- Restrict Tencent map keys by domain and platform. WebService keys should remain behind the server proxy.
- Back up the SQLite database, uploaded files and server environment before each release. Use the scripts under `deploy` for preflight checks.

## License

This repository is private and does not grant an open-source license. Source code, models, scenic materials and build artifacts may be used only within the scope authorized by the project team. Copying, redistribution, reverse engineering or commercial use requires written permission.

Third-party dependencies, DCloud components, iFlytek SDKs, map services and model assets remain subject to their original licenses, service terms and authorizations. Check those terms separately before deployment or distribution.

## Security and Privacy

Never commit API keys, API secrets, JWT secrets, database files, uploaded visitor files or logs containing personal information. If a credential is exposed, revoke and rotate it immediately at the provider, then remove it from build artifacts and release packages.

