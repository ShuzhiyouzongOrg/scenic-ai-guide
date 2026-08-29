/**
 * @fileoverview 网站链接常量配置。
 * @description 集中维护项目仓库、文档站和站内帮助页面地址，避免业务代码重复声明链接。
 */

/**
 * @description 项目各类外部入口与站内帮助入口的只读链接集合。
 * @type {Readonly<Record<string, string>>}
 * @property {string} GITHUB_HOME 项目 GitHub 主页地址。
 * @property {string} GITHUB 项目 GitHub 仓库地址。
 * @property {string} BLOG 数智游踪主站地址。
 * @property {string} DOCS 项目技术文档站地址。
 * @property {string} LiteVersion 站内使用文档入口。
 * @property {string} OldVersion 站内更新日志入口。
 * @property {string} COMMUNITY 项目社区预留入口。
 * @property {string} INTRODUCE 项目介绍预留入口。
 * @example
 * window.open(WEB_LINKS.DOCS, '_blank')
 */
export const WEB_LINKS = {
  // Github 主页
  GITHUB_HOME: 'https://github.com/babybitter/scenic-ai-guide',

  // 项目 Github 主页
  GITHUB: 'https://github.com/babybitter/scenic-ai-guide',

  // 个人博客
  BLOG: 'https://www.shuzhiyouzong.cn/',

  // 项目文档
  DOCS: 'https://docs.shuzhiyouzong.cn',

  // 精简版本
  LiteVersion: 'https://www.shuzhiyouzong.cn/#/help/docs',

  // v2.6.1版本
  OldVersion: 'https://www.shuzhiyouzong.cn/#/help/changelog',

  // 项目社区
  COMMUNITY: 'https://www.shuzhiyouzong.cn/#/help/docs',

  // 项目介绍
  INTRODUCE: 'https://www.shuzhiyouzong.cn/#/help/docs'
}
