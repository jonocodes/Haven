export interface TextRange {
  from: number
  to: number
}

function splitWordRanges(text: string, baseOffset: number): TextRange[] {
  const ranges: TextRange[] = []
  const re = /\b[\p{L}\p{N}_'-]+\b/gu
  let match: RegExpExecArray | null = re.exec(text)
  while (match) {
    const start = baseOffset + match.index
    const end = start + match[0].length
    ranges.push({ from: start, to: end })
    match = re.exec(text)
  }
  return ranges
}

/**
 * Find inserted word ranges in `nextText` compared to `previousText`.
 * Uses common-prefix/suffix detection to isolate the changed middle span.
 */
export function computeInsertedWordHighlights(previousText: string, nextText: string): TextRange[] {
  if (previousText === nextText) return []
  if (!previousText.trim()) return splitWordRanges(nextText, 0)

  let prefixLen = 0
  const maxPrefix = Math.min(previousText.length, nextText.length)
  while (prefixLen < maxPrefix && previousText[prefixLen] === nextText[prefixLen]) {
    prefixLen++
  }

  let suffixLen = 0
  const prevRemaining = previousText.length - prefixLen
  const nextRemaining = nextText.length - prefixLen
  const maxSuffix = Math.min(prevRemaining, nextRemaining)
  while (
    suffixLen < maxSuffix &&
    previousText[previousText.length - 1 - suffixLen] === nextText[nextText.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  const changedStart = prefixLen
  const changedEnd = nextText.length - suffixLen
  if (changedEnd <= changedStart) return []

  const insertedSegment = nextText.slice(changedStart, changedEnd)
  const ranges = splitWordRanges(insertedSegment, changedStart)
  if (ranges.length > 0) return ranges

  return [{ from: changedStart, to: changedEnd }]
}
