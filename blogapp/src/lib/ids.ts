export function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return base || 'post'
}

export function buildDatedSlugId(title: string, date = new Date()): string {
  const yyyy = String(date.getUTCFullYear())
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}-${slugifyTitle(title)}`
}

export function ensureUniqueSlugId(baseId: string, existingIds: Iterable<string>): string {
  const existing = new Set(existingIds)
  if (!existing.has(baseId)) {
    return baseId
  }

  let suffix = 2
  while (existing.has(`${baseId}-${suffix}`)) {
    suffix += 1
  }

  return `${baseId}-${suffix}`
}
