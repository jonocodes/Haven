import { useRef, useState, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { captureAndSaveMedia } from '../lib/mediaRepository'
import { getCurrentLocation } from '../lib/location'

export function Capture() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [permission, setPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt')
  const [capturing, setCapturing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gpsStatus, setGpsStatus] = useState<string | null>(null)

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      })
      streamRef.current = mediaStream
      setPermission('granted')
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
    } catch {
      setPermission('denied')
      setError('Camera access denied')
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => {
      stopCamera()
    }
  }, [startCamera, stopCamera])

  async function takePhoto() {
    if (!videoRef.current || !canvasRef.current || capturing) return
    
    setCapturing(true)
    setError(null)
    
    try {
      setGpsStatus('Getting location...')
      const location = await getCurrentLocation()
      setGpsStatus(location ? `📍 ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : '📍 No GPS')
      
      setSaving(true)
      const mediaItem = await captureAndSaveMedia(videoRef.current, canvasRef.current)
      setSaving(false)
      
      navigate({ to: '/media/$mediaId', params: { mediaId: mediaItem.id } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to capture')
      setSaving(false)
    } finally {
      setCapturing(false)
    }
  }

  if (permission === 'denied') {
    return (
      <div className="capture capture-error">
        <h1>Camera Access Required</h1>
        <p>Please allow camera access in your browser settings to take photos.</p>
        <button onClick={startCamera}>Try Again</button>
      </div>
    )
  }

  return (
    <div className="capture">
      <h1>Capture</h1>
      
      <div className="camera-preview">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
      
      {gpsStatus && <div className="gps-status">{gpsStatus}</div>}
      
      {error && <div className="capture-error-msg">{error}</div>}
      
      <div className="capture-controls">
        <button 
          className="capture-btn" 
          onClick={takePhoto}
          disabled={capturing || saving || permission !== 'granted'}
        >
          {saving ? 'Saving...' : capturing ? 'Capturing...' : '📷 Capture'}
        </button>
      </div>
    </div>
  )
}
