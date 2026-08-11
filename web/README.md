# Lingshan Scenic AI Guide

English | [简体中文](./README.zh-CN.md)

The web client for the Lingshan Scenic AI Guide combines an AI digital-human guide, scenic-map navigation, knowledge management, operations analytics, user management, and role management.

## Technology

- Vue 3, TypeScript, Vite
- Element Plus and Tailwind CSS
- Leaflet for the current hand-drawn scenic-map layer
- Pinia, Vue Router, Vue I18n, and ECharts

## Local development

```bash
pnpm install
pnpm dev
```

The backend defaults to `http://127.0.0.1:5178`. Local environment files are ignored by Git.

## Production build

```bash
pnpm build
```

The output is written to `web/dist` and is served by the local Node.js backend.

## Links

- [Live site](https://www.shuzhiyouzong.cn)
- Official documentation: `/#/help/docs`
- Changelog: `/#/change/log`
