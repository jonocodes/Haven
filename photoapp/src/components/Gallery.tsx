import { useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { listMedia, importPhoto } from '../lib/mediaRepository'
import { getMediaBlob } from '../lib/db'
import { formatBytes } from '../lib/imageProcessing'

async function downloadMedia(item: { id: string; originalFilename: string; kind: 'photo' | 'video'; mimeType: string }) {
  const blob = await getMediaBlob(item.id)
  if (!blob) {
    toast.error('Failed to download - file not found')
    return
  }
  
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = item.originalFilename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.success(`Downloaded ${item.originalFilename}`)
}

export function Gallery() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const mediaItems = useLiveQuery(
    () => listMedia(),
    []
  )

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files) return
    
    let importedCount = 0
    let failedCount = 0
    
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        try {
          await importPhoto(file)
          importedCount++
        } catch (err) {
          failedCount++
          console.error('Failed to import:', file.name, err)
        }
      }
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    
    if (importedCount > 0) {
      toast.success(`Imported ${importedCount} photo${importedCount > 1 ? 's' : ''}`)
    }
    if (failedCount > 0) {
      toast.error(`Failed to import ${failedCount} photo${failedCount > 1 ? 's' : ''}`)
    }
  }

  function handleDownload(e: React.MouseEvent, item: { id: string; originalFilename: string; kind: 'photo' | 'video'; mimeType: string }) {
    e.stopPropagation()
    downloadMedia(item)
  }

  if (!mediaItems) {
    return <div>Loading...</div>
  }

  return (
    <div className="gallery">
      <h1>Gallery</h1>
      
      <div className="gallery-header">
        <button 
          className="upload-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          📤 Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </div>
      
      {mediaItems.length === 0 ? (
        <div className="gallery-empty">
          <p>No photos yet.</p>
          <a href="/capture">Take your first photo</a>
          <span style={{ margin: '0 8px' }}>or</span>
          <button onClick={() => fileInputRef.current?.click()}>Upload a photo</button>
        </div>
      ) : (
        <div className="gallery-grid">
          {mediaItems.map((item) => (
            <div 
              key={item.id} 
              className="gallery-item"
              onClick={() => navigate({ to: '/media/$mediaId', params: { mediaId: item.id } })}
            >
              {item.thumbnailUrl ? (
                <img 
                  className="gallery-thumb" 
                  src={item.thumbnailUrl} 
                  alt={item.name || item.originalFilename}
                />
              ) : (
                <div className="gallery-thumb gallery-thumb-placeholder">📷</div>
              )}
              <button 
                className="gallery-item-download"
                onClick={(e) => handleDownload(e, item)}
                title="Download"
              >
                ⬇
              </button>
              <div className="gallery-item-info">
                <span className="gallery-item-name">
                  {item.name || item.originalFilename}
                </span>
                <span className="gallery-item-meta">
                  {item.width}×{item.height} · {formatBytes(item.fileSizeBytes)}
                </span>
                {item.sync.state !== 'synced' && (
                  <span className={`sync-badge sync-${item.sync.state}`}>
                    {item.sync.state}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
