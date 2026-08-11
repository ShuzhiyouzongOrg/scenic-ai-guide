# 灵山胜境 AI 导览

[English](./README.md) | 简体中文

本目录为灵山胜境 AI 导览前端，包含 AI 数字人导览、景区地图导览、知识库管理、运营分析、用户管理和角色管理等功能。

## 技术栈

- Vue 3、TypeScript、Vite
- Element Plus、Tailwind CSS
- Leaflet（当前用于承载景区手绘地图）
- Pinia、Vue Router、Vue I18n、ECharts

## 本地开发

```bash
pnpm install
pnpm dev
```

后端默认运行在 `http://127.0.0.1:5178`，本地环境变量文件已由 Git 忽略。

## 生产构建

```bash
pnpm build
```

构建产物位于 `web/dist`，由本地 Node.js 后端统一提供静态服务。

## 相关入口

- [线上网站](https://www.shuzhiyouzong.cn)
- 官方文档：`/#/help/docs`
- 更新日志：`/#/change/log`
