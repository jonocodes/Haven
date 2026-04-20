import { useEffect, useRef, useState } from 'react'
import { getSettings, updateSettings, getSettingsAsync, getStorageUsage } from '../lib/db'
import { initRemoteStorage } from '../lib/remoteStorage'
import { formatBytes } from '../lib/imageProcessing'
import Widget from 'remotestorage-widget'

const BUILD_TIME = import.meta.env.VITE_BUILD_TIME || new Date().toISOString()

export function Settings() {
  const [settings, setSettings] = useState(getSettings())
  const [saving, setSaving] = useState(false)
  const [widgetLoaded, setWidgetLoaded] = useState(false)
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof getStorageUsage>> | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const widgetContainerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<InstanceType<typeof Widget> | null>(null)

  useEffect(() => {
    getSettingsAsync().then(setSettings)
    getStorageUsage().then(setStorage)
  }, [])

  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches)
    
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const handler = (e: MediaQueryListEvent) => setIsStandalone(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    const rs = initRemoteStorage()
    
    const widget = new Widget(rs, { 
      leaveOpen: false,
      autoCloseAfter: 2000 
    })
    
    if (widgetContainerRef.current) {
      widget.attach(widgetContainerRef.current)
      setWidgetLoaded(true)
      widgetRef.current = widget
    }
    
    rs.on('connected', () => {
      updateSettings({ rsConnected: true }).then(() => setSettings(getSettings()))
    })
    
    rs.on('disconnected', () => {
      updateSettings({ rsConnected: false }).then(() => setSettings(getSettings()))
    })
    
    return () => {
      if (widgetRef.current) {
        widgetRef.current.close()
      }
    }
  }, [])

  if (!settings) {
    return <div>Loading...</div>
  }

  async function handleUpdate(key: string, value: number | boolean) {
    setSaving(true)
    try {
      await updateSettings({ [key]: value })
      setSettings(getSettings())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings">
      <h1>Settings</h1>
      
      {storage && (
        <div className="settings-section">
          <h2>Storage</h2>
          <div className="storage-info">
            <div className="storage-stat">
              <span className="storage-stat-value">{storage.photoCount}</span>
              <span className="storage-stat-label">Photos</span>
            </div>
            <div className="storage-stat">
              <span className="storage-stat-value">{storage.videoCount}</span>
              <span className="storage-stat-label">Videos</span>
            </div>
            <div className="storage-stat">
              <span className="storage-stat-value">{formatBytes(storage.totalBytes)}</span>
              <span className="storage-stat-label">Media</span>
            </div>
            <div className="storage-stat">
              <span className="storage-stat-value">{formatBytes(storage.thumbnailBytes)}</span>
              <span className="storage-stat-label">Thumbnails</span>
            </div>
          </div>
        </div>
      )}
      
      <div className="settings-section">
        <h2>Image Quality</h2>
        <label>
          <span>Quality: {Math.round(settings.imageQuality * 100)}%</span>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={settings.imageQuality}
            onChange={(e) => handleUpdate('imageQuality', parseFloat(e.target.value))}
            disabled={saving}
          />
        </label>
      </div>
      
      <div className="settings-section">
        <h2>Max Dimension</h2>
        <label>
          <span>Max width/height: {settings.maxDimension}px</span>
          <select
            value={settings.maxDimension}
            onChange={(e) => handleUpdate('maxDimension', parseInt(e.target.value))}
            disabled={saving}
          >
            <option value="1280">1280px</option>
            <option value="1920">1920px</option>
            <option value="2560">2560px</option>
            <option value="3840">3840px (4K)</option>
          </select>
        </label>
      </div>
      
      <div className="settings-section">
        <h2>Geolocation</h2>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.gpsEnabled}
            onChange={(e) => handleUpdate('gpsEnabled', e.target.checked)}
            disabled={saving}
          />
          <span>Capture GPS location with photos</span>
        </label>
      </div>
      
      <div className="settings-section">
        <h2>Video Recording</h2>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.videoEnabled}
            onChange={(e) => handleUpdate('videoEnabled', e.target.checked)}
            disabled={saving}
          />
          <span>Enable video recording (experimental)</span>
        </label>
      </div>
      
      <div className="settings-section">
        <h2>RemoteStorage</h2>
        <p className={`rs-status ${settings.rsConnected ? 'connected' : 'disconnected'}`}>
          {settings.rsConnected ? '● Connected' : '○ Not connected'}
        </p>
        {!widgetLoaded && <p className="widget-loading">Loading widget...</p>}
        <div ref={widgetContainerRef} className="widget-container"></div>
      </div>

      <div className="settings-section">
        <h2>Debug</h2>
        <dl className="debug-info">
          <dt>Version</dt>
          <dd>{BUILD_TIME}</dd>
          
          <dt>Install Status</dt>
          <dd>{isStandalone ? '✓ Installed as PWA' : '○ Running in browser'}</dd>
        </dl>
      </div>
    </div>
  )
}
