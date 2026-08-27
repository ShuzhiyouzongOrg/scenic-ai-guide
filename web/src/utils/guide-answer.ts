const MARKDOWN_LINK = /\[([^\]]+)\]\([^\s)]+(?:\s+[^)]*)?\)/g
const INTERNAL_CITATION = /\s*\[(?:C-[^\]\r\n]+|C\d+)\]/giu

/**
 * Converts legacy model answers containing lightweight Markdown into safe
 * plain text. The chat view deliberately avoids v-html so model output never
 * becomes executable markup.
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
