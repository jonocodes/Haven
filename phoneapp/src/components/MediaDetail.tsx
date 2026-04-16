import { useParams, useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMedia, renameMedia, softDeleteMedia } from '../lib/mediaRepository'
import { formatBytes } from '../lib/imageProcessing'
import { useState } from 'react'

export function MediaDetail() {
  const { mediaId } = useParams({ from: '/media/$mediaId' })
  const navigate = useNavigate()
  
  const mediaItem = useLiveQuery(
    () => getMedia(mediaId),
    [mediaId]
  )
  
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  if (!mediaItem) {
    return <div>Loading...</div>
  }

  const item = mediaItem

  async function handleRename() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await renameMedia(mediaId, name.trim())
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this photo?')) return
    setSaving(true)
    try {
      await softDeleteMedia(mediaId)
      navigate({ to: '/gallery' })
    } finally {
      setSaving(false)
    }
  }

  function startEditing() {
    setName(item.name || item.originalFilename)
    setEditing(true)
  }

  return (
    <div className="media-detail">
      <h1>{item.name || item.originalFilename}</h1>
      
      <div className="media-preview">
        {item.thumbnailUrl ? (
          <img 
            src={item.thumbnailUrl} 
            alt={item.name || item.originalFilename}
            className="media-preview-img"
          />
        ) : (
          <div className="media-preview-placeholder">
            📷 {item.width}×{item.height}
          </div>
        )}
      </div>
      
      {editing ? (
        <div className="rename-form">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter name"
            autoFocus
          />
          <button onClick={handleRename} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)}>Cancel</button>
        </div>
      ) : (
        <div className="detail-actions">
          <button onClick={startEditing}>Rename</button>
        </div>
      )}
      
      <div className="metadata-list">
        <h2>Details</h2>
        <dl>
          <dt>Name</dt>
          <dd>{item.name || '(none)'}</dd>
          
          <dt>Dimensions</dt>
          <dd>{item.width} × {item.height}</dd>
          
          <dt>File Size</dt>
          <dd>{formatBytes(item.fileSizeBytes)}</dd>
          
          <dt>MIME Type</dt>
          <dd>{item.mimeType}</dd>
          
          <dt>Created</dt>
          <dd>{new Date(item.createdAt).toLocaleString()}</dd>
          
          <dt>Updated</dt>
          <dd>{new Date(item.updatedAt).toLocaleString()}</dd>
          
          {item.gps && (
            <>
              <dt>GPS</dt>
              <dd>
                {item.gps.latitude.toFixed(6)}, {item.gps.longitude.toFixed(6)}
                {item.gps.accuracyMeters && ` (±${item.gps.accuracyMeters}m)`}
              </dd>
            </>
          )}
          
          <dt>Sync Status</dt>
          <dd className={`sync-${item.sync.state}`}>
            {item.sync.state}
            {item.sync.error && `: ${item.sync.error}`}
          </dd>
        </dl>
      </div>
      
      <div className="detail-actions detail-actions-danger">
        <button onClick={handleDelete} disabled={saving}>
          {saving ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
