export async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    
    img.src = url
  })
}

export async function resizeImageBlob(
  blob: Blob,
  options: {
    maxDimension: number
    quality: number
    mimeType?: string
  }
): Promise<Blob> {
  const { maxDimension, quality, mimeType = 'image/jpeg' } = options
  
  const img = new Image()
  const url = URL.createObjectURL(blob)
  
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
  
  URL.revokeObjectURL(url)
  
  let { width, height } = img
  const aspectRatio = width / height
  
  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      width = maxDimension
      height = Math.round(maxDimension / aspectRatio)
    } else {
      height = maxDimension
      width = Math.round(maxDimension * aspectRatio)
    }
  }
  
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }
  
  ctx.drawImage(img, 0, 0, width, height)
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (resizedBlob) => {
        if (resizedBlob) {
          resolve(resizedBlob)
        } else {
          reject(new Error('Failed to create resized blob'))
        }
      },
      mimeType,
      quality
    )
  })
}

export async function generateThumbnail(
  blob: Blob,
  size: number = 200
): Promise<Blob> {
  const img = new Image()
  const url = URL.createObjectURL(blob)
  
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
  
  URL.revokeObjectURL(url)
  
  const { width, height } = img
  const aspectRatio = width / height
  
  let thumbWidth: number
  let thumbHeight: number
  
  if (width > height) {
    thumbWidth = size
    thumbHeight = Math.round(size / aspectRatio)
  } else {
    thumbHeight = size
    thumbWidth = Math.round(size * aspectRatio)
  }
  
  const canvas = document.createElement('canvas')
  canvas.width = thumbWidth
  canvas.height = thumbHeight
  
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }
  
  ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight)
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (thumbBlob) => {
        if (thumbBlob) {
          resolve(thumbBlob)
        } else {
          reject(new Error('Failed to create thumbnail'))
        }
      },
      'image/jpeg',
      0.7
    )
  })
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export async function capturePhotoBlob(
  videoElement: HTMLVideoElement,
  canvas: HTMLCanvasElement
): Promise<Blob> {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }
  
  canvas.width = videoElement.videoWidth
  canvas.height = videoElement.videoHeight
  
  ctx.drawImage(videoElement, 0, 0)
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to capture photo'))
        }
      },
      'image/jpeg',
      1.0
    )
  })
}
