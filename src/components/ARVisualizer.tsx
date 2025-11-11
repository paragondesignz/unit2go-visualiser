import { useState, useCallback } from 'react'
import ARScene from './ARScene'
import { ARPoolDimensions, ARPoolPosition, ARCaptureData } from '../types/ar'
import { generateARVisualization } from '../services/arService'

interface ARVisualizerProps {
  onCapture?: (data: ARCaptureData) => void
  onResult?: (imageUrl: string) => void
}

function ARVisualizer({ onCapture, onResult }: ARVisualizerProps) {
  const [dimensions, setDimensions] = useState<ARPoolDimensions>({
    length: 8,
    width: 4,
    depth: 1.5
  })
  
  const [position, setPosition] = useState<ARPoolPosition>({
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    scale: 1
  })

  const [isCapturing, setIsCapturing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Generate mask image from 3D pool position
  const generateMaskImage = useCallback(async (): Promise<string> => {
    // This will be implemented to render the pool shape as a white mask on black background
    // For now, return a placeholder
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const ctx = canvas.getContext('2d')
    
    if (!ctx) throw new Error('Could not get canvas context')
    
    // Fill with black background
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // Draw white pool shape based on position and dimensions
    // This is a simplified version - in production, you'd project the 3D model to 2D
    const centerX = canvas.width / 2 + (position.x * 50)
    const centerY = canvas.height / 2 + (position.z * 50)
    const poolWidth = dimensions.length * 30 * position.scale
    const poolHeight = dimensions.width * 30 * position.scale
    
    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.rotate((position.rotation * Math.PI) / 180)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(-poolWidth / 2, -poolHeight / 2, poolWidth, poolHeight)
    ctx.restore()
    
    return canvas.toDataURL('image/png')
  }, [dimensions, position])

  // Capture camera image
  const captureCameraImage = useCallback(async (): Promise<string> => {
    // For web-based AR, we'll use a file input or camera API
    // This is a placeholder - in production, you'd access device camera
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.capture = 'environment'
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (file) {
          const reader = new FileReader()
          reader.onload = (event) => {
            resolve(event.target?.result as string)
          }
          reader.readAsDataURL(file)
        }
      }
      input.click()
    })
  }, [])

  const handleCapture = useCallback(async () => {
    setIsCapturing(true)
    setError(null)

    try {
      // Capture base image
      const baseImage = await captureCameraImage()
      
      // Generate mask
      const maskImage = await generateMaskImage()
      
      const captureData: ARCaptureData = {
        baseImage,
        maskImage,
        dimensions,
        position
      }

      if (onCapture) {
        onCapture(captureData)
      }

      // Generate visualization
      setIsGenerating(true)
      const result = await generateARVisualization(captureData)
      
      if (result.success && result.imageUrl) {
        if (onResult) {
          onResult(result.imageUrl)
        }
      } else {
        setError(result.error || 'Failed to generate visualization')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setIsCapturing(false)
      setIsGenerating(false)
    }
  }, [dimensions, position, captureCameraImage, generateMaskImage, onCapture, onResult])

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      {/* AR Scene */}
      <div style={{ width: '100%', height: 'calc(100% - 200px)' }}>
        <ARScene
          dimensions={dimensions}
          position={position}
          onPositionChange={setPosition}
          onDimensionsChange={setDimensions}
        />
      </div>

      {/* Controls */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '20px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        display: 'flex',
        flexDirection: 'column',
        gap: '15px'
      }}>
        {/* Dimension Controls */}
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <label style={{ minWidth: '80px' }}>Length (m):</label>
          <input
            type="range"
            min="4"
            max="15"
            step="0.5"
            value={dimensions.length}
            onChange={(e) => setDimensions({ ...dimensions, length: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span>{dimensions.length}m</span>
        </div>
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <label style={{ minWidth: '80px' }}>Width (m):</label>
          <input
            type="range"
            min="3"
            max="8"
            step="0.5"
            value={dimensions.width}
            onChange={(e) => setDimensions({ ...dimensions, width: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span>{dimensions.width}m</span>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleCapture}
          disabled={isCapturing || isGenerating}
          style={{
            padding: '15px 30px',
            fontSize: '18px',
            fontWeight: 'bold',
            backgroundColor: isCapturing || isGenerating ? '#ccc' : '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: isCapturing || isGenerating ? 'not-allowed' : 'pointer'
          }}
        >
          {isGenerating ? 'Generating...' : isCapturing ? 'Capturing...' : 'Generate Visualization'}
        </button>

        {error && (
          <div style={{ color: 'red', padding: '10px', backgroundColor: '#ffebee', borderRadius: '4px' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

export default ARVisualizer

