export interface ParsedMarkdownPost {
  title: string | null
  body: string
  excerpt: string
}

function normalizeLines(content: string): string[] {
  return content.replace(/\r\n/g, '\n').split('\n')
}

function firstNonEmptyLineIndex(lines: string[]): number {
  return lines.findIndex((line) => line.trim().length > 0)
}

function deriveExcerpt(body: string): string {
  const firstTextLine = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstTextLine) return ''
  return firstTextLine.length > 160 ? `${firstTextLine.slice(0, 157)}...` : firstTextLine
}

export function parseMarkdownToPost(content: string): ParsedMarkdownPost {
  const lines = normalizeLines(content)
  const firstIndex = firstNonEmptyLineIndex(lines)

  if (firstIndex >= 0) {
    const headingMatch = lines[firstIndex].match(/^#\s+(.+)\s*$/)
    if (headingMatch) {
      const title = headingMatch[1].trim() || null
      const body = lines.slice(0, firstIndex).concat(lines.slice(firstIndex + 1)).join('\n').trim()
      return {
        title,
        body,
        excerpt: deriveExcerpt(body),
      }
    }
  }

  const body = content.replace(/\r\n/g, '\n').trim()
  return {
    title: null,
    body,
    excerpt: deriveExcerpt(body),
  }
}
