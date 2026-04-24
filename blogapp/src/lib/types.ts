export type PostStatus = 'draft' | 'published' | 'unpublished' | 'deleted'

export interface GardenPostMeta {
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

export interface GardenIndexEntry {
  id: string
  title: string
  excerpt: string
  publishedAt: string
  updatedAt: string
}

export interface GardenIndex {
  version: 1 | 2
  title: string
  tagline?: string
  urlPrefix?: string
  updatedAt: string
  posts: GardenIndexEntry[]
}
