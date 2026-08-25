const LEADING_SEPARATOR = /^[\s，。！？；：、,.!?;:'"“”‘’（）()\[\]{}…—-]+/u
const IGNORED_CHARACTER = /[\s，。！？；：、,.!?;:'"“”‘’（）()\[\]{}…—-]/u

interface SpeechProjection {
  text: string
  sourceEnds: number[]
}

/**
 * 根据讯飞当前字幕推进已播报位置。
 * 字幕可能省略空格或替换标点，因此直接匹配失败时会使用忽略标点的投影匹配。
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

/** 返回尚未播报的文本；保留完整语义，仅清理切分点前的标点与空白。 */
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
