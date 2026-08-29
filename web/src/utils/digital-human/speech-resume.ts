/**
 * @fileoverview 数字人语音续播位置计算工具。
 * @description 根据讯飞字幕片段推算原文已播报偏移，并提取暂停后需要继续播报的剩余文本。
 */

const LEADING_SEPARATOR = /^[\s，。！？；：、,.!?;:'"“”‘’（）()\[\]{}…—-]+/u
const IGNORED_CHARACTER = /[\s，。！？；：、,.!?;:'"“”‘’（）()\[\]{}…—-]/u

/**
 * @typedef SpeechProjection
 * @description 忽略标点与空白后的匹配文本及其字符在原文中的结束位置映射。
 * @property {string} text 用于字幕匹配的规范化文本。
 * @property {number[]} sourceEnds 每个规范化字符对应的原文结束偏移。
 */
interface SpeechProjection {
  text: string
  sourceEnds: number[]
}

/**
 * @description 根据当前字幕推进原文已播报位置；直接匹配失败时忽略标点与空白进行投影匹配。
 * @param {string} fullText 本轮数字人播报的完整原文。
 * @param {string} subtitleSegment 讯飞回传的当前字幕片段。
 * @param {number} [currentOffset=0] 已确认播报到的原文字符偏移。
 * @returns {number} 不小于当前偏移且不超过原文长度的新偏移。
 * @example
 * advanceSpeechOffset('欢迎来到灵山胜境。', '灵山胜境', 0)
 */
export function advanceSpeechOffset(
  fullText: string,
  subtitleSegment: string,
  currentOffset = 0
): number {
  const source = String(fullText || '')
  const segment = String(subtitleSegment || '').trim()
  const safeOffset = Math.max(0, Math.min(currentOffset, source.length))
  if (!source || !segment) return safeOffset

  const directForwardIndex = source.indexOf(segment, safeOffset)
  if (directForwardIndex >= 0) return directForwardIndex + segment.length

  const overlapStart = Math.max(0, safeOffset - segment.length + 1)
  const directOverlapIndex = source.indexOf(segment, overlapStart)
  if (directOverlapIndex >= 0 && directOverlapIndex + segment.length > safeOffset) {
    return directOverlapIndex + segment.length
  }

  const projectedForwardEnd = findProjectedEnd(source, segment, safeOffset, safeOffset)
  if (projectedForwardEnd > safeOffset) return projectedForwardEnd

  const projectedOverlapEnd = findProjectedEnd(source, segment, overlapStart, safeOffset)
  return projectedOverlapEnd > safeOffset ? projectedOverlapEnd : safeOffset
}

/**
 * @description 截取尚未播报的原文，并清理切分点开头的标点与空白。
 * @param {string} fullText 本轮数字人播报的完整原文。
 * @param {number} spokenOffset 已播报结束位置对应的原文字符偏移。
 * @returns {string} 可用于恢复播报的剩余文本；没有剩余内容时返回空字符串。
 * @example
 * getRemainingSpeech('欢迎来到灵山胜境。', 2)
 */
export function getRemainingSpeech(fullText: string, spokenOffset: number): string {
  const source = String(fullText || '')
  const safeOffset = Math.max(0, Math.min(spokenOffset, source.length))
  return source.slice(safeOffset).replace(LEADING_SEPARATOR, '').trim()
}

function projectSpeech(source: string): SpeechProjection {
  let text = ''
  let sourceOffset = 0
  const sourceEnds: number[] = []
  for (const character of source) {
    sourceOffset += character.length
    if (IGNORED_CHARACTER.test(character)) continue
    text += character.toLocaleLowerCase()
    sourceEnds.push(sourceOffset)
  }
  return { text, sourceEnds }
}

function findProjectedEnd(
  source: string,
  segment: string,
  searchStart: number,
  minimumEnd: number
): number {
  const sourceProjection = projectSpeech(source.slice(searchStart))
  const segmentProjection = projectSpeech(segment)
  if (!sourceProjection.text || !segmentProjection.text) return -1

  let projectedIndex = sourceProjection.text.indexOf(segmentProjection.text)
  while (projectedIndex >= 0) {
    const projectedEnd = projectedIndex + segmentProjection.text.length - 1
    const sourceEnd = searchStart + sourceProjection.sourceEnds[projectedEnd]
    if (sourceEnd > minimumEnd) return sourceEnd
    projectedIndex = sourceProjection.text.indexOf(segmentProjection.text, projectedIndex + 1)
  }
  return -1
}
