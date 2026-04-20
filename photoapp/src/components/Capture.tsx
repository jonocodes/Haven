import { useRef, useState, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { captureAndSaveMedia, recordAndSaveVideo } from '../lib/mediaRepository'
import { getCurrentLocation } from '../lib/location'
import { getSettingsAsync } from '../lib/db'

export function Capture() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof getSettingsAsync>>>()
  
  const [permission, setPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt')
  const [capturing, setCapturing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gpsStatus, setGpsStatus] = useState<string | null>(null)

  useEffect(() => {
    getSettingsAsync().then(setSettings)
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: settings?.videoEnabled ?? false
        })
        streamRef.current = mediaStream
        setPermission('granted')
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
      } catch {
        setPermission('denied')
        setError('Camera access denied')
        toast.error('Camera access denied')
      }
    }
    
    if (settings) {
      startCamera()
    }
    
    return () => {
      stopCamera()
    }
  }, [settings, stopCamera])

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
      toast.success('Photo saved')
      navigate({ to: '/media/$mediaId', params: { mediaId: mediaItem.id } })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to capture'
      setError(message)
      toast.error(message)
      setSaving(false)
    } finally {
      setCapturing(false)
    }
  }

  function startVideoRecording() {
    if (!streamRef.current || !settings?.videoEnabled) return
    
    recordedChunksRef.current = []
    
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4'
    
    const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType })
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data)
      }
    }
    
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
      
      try {
        setSaving(true)
        const gps = settings?.gpsEnabled ? await getCurrentLocation() : null
        const mediaItem = await recordAndSaveVideo(blob, gps)
        setSaving(false)
        toast.success('Video saved')
        navigate({ to: '/media/$mediaId', params: { mediaId: mediaItem.id } })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save video'
        setError(message)
        toast.error(message)
        setSaving(false)
      }
    }
    
    mediaRecorderRef.current = mediaRecorder
    mediaRecorder.start(1000)
    setRecording(true)
    toast.info('Recording started')
  }

  function stopVideoRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop()
      setRecording(false)
      toast.info('Recording stopped')
    }
  }

  if (permission === 'denied') {
    return (
      <div className="capture capture-error">
        <h1>Camera Access Required</h1>
        <p>Please allow camera access in your browser settings to take photos.</p>
        <button onClick={() => window.location.reload()}>Try Again</button>
      </div>
    )
  }

  if (!settings) {
    return <div>Loading...</div>
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
          disabled={capturing || saving || recording || permission !== 'granted'}
        >
          {saving ? 'Saving...' : capturing ? 'Capturing...' : '📷 Photo'}
        </button>
        
        {settings.videoEnabled && (
          recording ? (
            <button 
              className="capture-btn capture-btn-recording" 
              onClick={stopVideoRecording}
              disabled={saving}
            >
              ⏹ Stop
            </button>
          ) : (
            <button 
              className="capture-btn capture-btn-video" 
              onClick={startVideoRecording}
              disabled={capturing || saving || permission !== 'granted'}
            >
              🔴 Video
            </button>
          )
        )}
      </div>
    </div>
  )
}
