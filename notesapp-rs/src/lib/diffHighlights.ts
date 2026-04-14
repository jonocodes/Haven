export interface TextRange {
  from: number
  to: number
}

/**
 * Find the contiguous inserted range in `nextText` compared to `previousText`.
 * Uses common-prefix/suffix detection to isolate the changed middle span.
 */
export function computeInsertedWordHighlights(previousText: string, nextText: string): TextRange[] {
  if (previousText === nextText) return []
  if (!previousText.trim()) {
    return nextText.trim() ? [{ from: 0, to: nextText.length }] : []
  }

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

  return [{ from: changedStart, to: changedEnd }]
}
