/**
 * @fileoverview AI 导览回答文本净化工具。
 * @description 将模型返回的轻量 Markdown 与内部引用标记转换为可直接渲染的安全纯文本。
 */

const MARKDOWN_LINK = /\[([^\]]+)\]\([^\s)]+(?:\s+[^)]*)?\)/g
const INTERNAL_CITATION = /\s*\[(?:C-[^\]\r\n]+|C\d+)\]/giu

/**
 * @description 移除代码围栏、标题、强调语法、链接地址和内部引用标记，保留可读文本与列表层次。
 * @param {string} value 模型返回的回答文本。
 * @returns {string} 适合使用文本节点渲染的规范化纯文本。
 * @example
 * formatGuideAnswer('**推荐**：[梵宫](https://example.com) [C-12]')
 */
export function formatGuideAnswer(value: string): string {
  return String(value || '')
    .replace(/```(?:[\w-]+)?\s*([\s\S]*?)```/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(MARKDOWN_LINK, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(INTERNAL_CITATION, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/[ \t]+([，。！？；：,.!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
