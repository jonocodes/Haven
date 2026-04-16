import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from '@tanstack/react-router'
import { listMedia } from '../lib/mediaRepository'
import { formatBytes } from '../lib/imageProcessing'

export function Gallery() {
  const navigate = useNavigate()
  
  const mediaItems = useLiveQuery(
    () => listMedia(),
    []
  )

  if (!mediaItems) {
    return <div>Loading...</div>
  }

  if (mediaItems.length === 0) {
    return (
      <div className="gallery-empty">
        <p>No photos yet.</p>
        <a href="/capture">Take your first photo</a>
      </div>
    )
  }

  return (
    <div className="gallery">
      <h1>Gallery</h1>
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
    </div>
  )
}
