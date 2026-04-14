export interface ImportedMarkdownNote {
  title: string
  body: string
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '')
}

export function parseMarkdownToNote(content: string, filename: string): ImportedMarkdownNote {
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const firstNonEmpty = lines.findIndex((line) => line.trim().length > 0)

  if (firstNonEmpty >= 0) {
    const headingMatch = lines[firstNonEmpty].match(/^#\s+(.+)\s*$/)
    if (headingMatch) {
      const title = headingMatch[1].trim()
      const bodyLines = lines.slice(0, firstNonEmpty).concat(lines.slice(firstNonEmpty + 1))
      const body = bodyLines.join('\n').trim()
      return { title: title || stripExtension(filename), body }
    }
  }

  return {
    title: stripExtension(filename) || 'Imported note',
    body: normalized.trim(),
  }
}
