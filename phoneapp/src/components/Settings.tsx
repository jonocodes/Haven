import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings, updateSettings } from '../lib/db'
import { useState } from 'react'

export function Settings() {
  const settings = useLiveQuery(() => getSettings())
  const [saving, setSaving] = useState(false)

  if (!settings) {
    return <div>Loading...</div>
  }

  async function handleUpdate(key: string, value: number | boolean) {
    setSaving(true)
    try {
      await updateSettings({ [key]: value })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings">
      <h1>Settings</h1>
      
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
        <h2>RemoteStorage</h2>
        <p className={`rs-status ${settings.rsConnected ? 'connected' : 'disconnected'}`}>
          {settings.rsConnected ? '● Connected' : '○ Not connected'}
        </p>
      </div>
    </div>
  )
}
