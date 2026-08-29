/**
 * @fileoverview 浏览器开发者控制台欢迎信息。
 * @description 使用 ANSI 转义序列输出项目名称与欢迎语，不对外导出业务能力。
 */

/**
 * @description 包含 ANSI 颜色控制字符的控制台欢迎文本。
 * @type {string}
 */
const asciiArt = `
\x1b[32m欢迎使用 灵山胜境 AI 导览！
\x1b[0m
\x1b[36m禅意灵山 · 智慧同行，祝您使用顺利！
\x1b[0m
`

console.log(asciiArt)
