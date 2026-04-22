export type PostStatus = 'draft' | 'published' | 'unpublished' | 'deleted'

export interface BlogPostMeta {
  version: 1
  id: string
  title: string
  excerpt: string
  status: PostStatus
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  deletedAt: string | null
}

export interface BlogIndexEntry {
  id: string
  title: string
  excerpt: string
  publishedAt: string
  updatedAt: string
}

export interface BlogIndex {
  version: 1
  title: string
  updatedAt: string
  posts: BlogIndexEntry[]
}
