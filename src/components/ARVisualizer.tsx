import { useState, useCallback, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { ARPoolDimensions, ARPoolPosition, ARCaptureData } from '../types/ar'
import { generateARVisualization } from '../services/arService'
import * as THREE from 'three'

interface ARVisualizerProps {
  onCapture?: (data: ARCaptureData) => void
  onResult?: (imageUrl: string) => void
}

// Procedural pool box component - fixed to properly respond to position changes
function PoolBox({ dimensions, position }: { 
  dimensions: ARPoolDimensions
  position: ARPoolPosition
}) {
  const groupRef = useRef<THREE.Group>(null)

  // Update position when props change - use useFrame for immediate updates
  useEffect(() => {
    if (groupRef.current) {
      // Position pool at ground level (y = depth/2 means bottom is at y=0)
      groupRef.current.position.set(position.x, dimensions.depth / 2, position.z)
      groupRef.current.rotation.y = (position.rotation * Math.PI) / 180
      groupRef.current.scale.setScalar(position.scale)
    }
  }, [position.x, position.z, position.rotation, position.scale, dimensions.depth])

  return (
    <group ref={groupRef}>
      {/* Pool walls - concrete/tile appearance */}
      <mesh>
        <boxGeometry args={[dimensions.length, dimensions.depth, dimensions.width]} />
        <meshStandardMaterial 
          color="#e0e0e0" 
          transparent 
          opacity={0.9}
          side={THREE.DoubleSide}
          metalness={0.1}
          roughness={0.8}
        />
      </mesh>
      
      {/* Water surface - top of pool */}
      <mesh position={[0, dimensions.depth / 2, 0]}>
        <planeGeometry args={[dimensions.length, dimensions.width]} />
        <meshStandardMaterial 
          color="#00b4d8" 
          transparent 
          opacity={0.7}
          side={THREE.DoubleSide}
          metalness={0.5}
          roughness={0.1}
        />
      </mesh>
      
      {/* Water fill - inside the pool */}
      <mesh position={[0, dimensions.depth / 4, 0]}>
        <boxGeometry args={[dimensions.length * 0.98, dimensions.depth / 2, dimensions.width * 0.98]} />
        <meshStandardMaterial 
          color="#0077b6" 
          transparent 
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Outline for visibility */}
      <mesh>
        <boxGeometry args={[dimensions.length, dimensions.depth, dimensions.width]} />
        <meshStandardMaterial 
          color="#0066cc" 
          transparent 
          opacity={0.5}
          wireframe={true}
        />
      </mesh>
    </group>
  )
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
    scale: 1.5
  })

  const [isCapturing, setIsCapturing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [snapshotImage, setSnapshotImage] = useState<string | null>(null)
  const [cameraAngle, setCameraAngle] = useState({ x: 0, y: 0, z: 0 })
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null)
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null)

  // Device orientation handler for perspective detection
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta !== null && event.gamma !== null) {
        // beta: front-to-back tilt (-180 to 180)
        // gamma: left-to-right tilt (-90 to 90)
        // Convert to camera angles
        const tiltX = (event.beta || 0) * (Math.PI / 180) // Convert to radians
        const tiltY = (event.gamma || 0) * (Math.PI / 180)
        
        // Normalize angles for camera positioning
        // When phone is held normally (beta ~ 0), camera should look down at angle
        // When phone tilts forward (beta > 0), camera should look more straight ahead
        setCameraAngle({
          x: tiltX,
          y: tiltY,
          z: 0
        })
      }
    }

    // Request permission for device orientation (iOS 13+)
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission()
        .then((response: string) => {
          if (response === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation as EventListener)
          }
        })
        .catch(() => {
          console.warn('Device orientation permission denied')
        })
    } else {
      // Android and older iOS
      window.addEventListener('deviceorientation', handleOrientation as EventListener)
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation as EventListener)
    }
  }, [])

  // Analyze video for horizon/ground plane detection
  useEffect(() => {
    if (!videoRef.current || !cameraReady) return

    const analyzeFrame = () => {
      if (!videoRef.current || !analysisCanvasRef.current) return

      const video = videoRef.current
      const canvas = analysisCanvasRef.current
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      
      if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) return

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)

      // Simple edge detection to find horizon line
      // Look for horizontal edges in the middle third of the image
      const imageData = ctx.getImageData(0, canvas.height / 3, canvas.width, canvas.height / 3)
      const data = imageData.data
      
      let maxHorizontalEdge = 0
      let horizonY = canvas.height / 2

      // Sample horizontal lines and detect edges
      for (let y = 0; y < imageData.height; y += 5) {
        let edgeStrength = 0
        for (let x = 1; x < imageData.width - 1; x++) {
          const idx = (y * imageData.width + x) * 4
          const prevIdx = (y * imageData.width + (x - 1)) * 4
          
          // Calculate horizontal gradient
          const gradient = Math.abs(
            (data[idx] + data[idx + 1] + data[idx + 2]) / 3 -
            (data[prevIdx] + data[prevIdx + 1] + data[prevIdx + 2]) / 3
          )
          edgeStrength += gradient
        }
        
        if (edgeStrength > maxHorizontalEdge) {
          maxHorizontalEdge = edgeStrength
          horizonY = canvas.height / 3 + y
        }
      }

      // Convert horizon position to camera tilt
      // Horizon at top = looking down, horizon at bottom = looking up
      const normalizedHorizon = (horizonY / canvas.height) - 0.5 // -0.5 to 0.5
      const tiltFromHorizon = normalizedHorizon * Math.PI / 3 // Max 30 degrees

      // Combine with device orientation if available
      setCameraAngle(prev => ({
        x: prev.x !== 0 ? prev.x : tiltFromHorizon,
        y: prev.y,
        z: prev.z
      }))
    }

    const interval = setInterval(analyzeFrame, 500) // Analyze every 500ms

    return () => clearInterval(interval)
  }, [cameraReady])

  // Initialize camera
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        })
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
          streamRef.current = stream
          setCameraReady(true)
        }
      } catch (err) {
        console.error('Error accessing camera:', err)
        setError('Could not access camera. Please ensure camera permissions are granted.')
      }
    }

    initCamera()

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // Touch gesture handlers for positioning
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true
      const touch = e.touches[0]
      dragStartRef.current = { x: touch.clientX, y: touch.clientY }
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY }
      e.preventDefault()
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isDraggingRef.current && e.touches.length === 1 && lastTouchRef.current) {
      const touch = e.touches[0]
      const deltaX = touch.clientX - lastTouchRef.current.x
      const deltaY = touch.clientY - lastTouchRef.current.y
      
      // Convert screen movement to 3D position movement
      setPosition(prev => ({
        ...prev,
        x: prev.x + deltaX * 0.02, // Increased sensitivity
        z: prev.z + deltaY * 0.02
      }))
      
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY }
      e.preventDefault()
    } else if (e.touches.length === 2) {
      // Pinch to zoom/scale
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      
      if (!lastTouchRef.current) {
        lastTouchRef.current = { x: distance, y: 0 }
        return
      }
      
      const scaleDelta = (distance - lastTouchRef.current.x) * 0.01
      setPosition(prev => ({
        ...prev,
        scale: Math.max(0.5, Math.min(3, prev.scale + scaleDelta))
      }))
      
      lastTouchRef.current = { x: distance, y: 0 }
      e.preventDefault()
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    isDraggingRef.current = false
    lastTouchRef.current = null
  }, [])

  // Generate mask image from 3D pool position
  const generateMaskImage = useCallback(async (): Promise<string> => {
    if (!videoRef.current || !canvasRef.current) {
      throw new Error('Video or canvas not available')
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    if (!ctx) throw new Error('Could not get canvas context')
    
    canvas.width = video.videoWidth || 1920
    canvas.height = video.videoHeight || 1080
    
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // Calculate pool position in screen space
    const centerX = canvas.width / 2 + (position.x * (canvas.width / 20))
    const centerY = canvas.height / 2 + (position.z * (canvas.height / 20))
    
    const poolWidth = (dimensions.length / 10) * canvas.width * position.scale * 0.3
    const poolHeight = (dimensions.width / 10) * canvas.width * position.scale * 0.3
    
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
    if (!videoRef.current) {
      throw new Error('Video not ready')
    }

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    if (!ctx) throw new Error('Could not get canvas context')
    
    canvas.width = video.videoWidth || 1920
    canvas.height = video.videoHeight || 1080
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    return canvas.toDataURL('image/jpeg', 0.9)
  }, [])

  const handleCapture = useCallback(async () => {
    if (!cameraReady || !videoRef.current) {
      setError('Camera not ready. Please wait for camera to initialize.')
      return
    }

    setIsCapturing(true)
    setError(null)

    try {
      // Capture base image from video
      const baseImage = await captureCameraImage()
      
      // Show snapshot immediately
      setSnapshotImage(baseImage)
      
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
      setIsCapturing(false) // Switch to generating state
      
      const result = await generateARVisualization(captureData)
      
      if (result.success && result.imageUrl) {
        if (onResult) {
          onResult(result.imageUrl)
        }
        setSnapshotImage(null) // Clear snapshot when result arrives
      } else {
        setError(result.error || 'Failed to generate visualization')
        setIsGenerating(false)
        setSnapshotImage(null)
      }
    } catch (err) {
      console.error('Capture error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setIsCapturing(false)
      setIsGenerating(false)
      setSnapshotImage(null)
    }
  }, [cameraReady, dimensions, position, captureCameraImage, generateMaskImage, onCapture, onResult])

  // Show snapshot and loading overlay if capturing or generating
  if (snapshotImage || isGenerating) {
    return (
      <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
        {/* Snapshot Image */}
        {snapshotImage && (
          <img
            src={snapshotImage}
            alt="Captured scene"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 1
            }}
          />
        )}

        {/* Loading Overlay */}
        {isGenerating && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
            color: 'white'
          }}>
            <div style={{
              width: '50px',
              height: '50px',
              border: '4px solid rgba(255, 255, 255, 0.3)',
              borderTop: '4px solid white',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '20px'
            }} />
            <h2 style={{ fontSize: '24px', marginBottom: '10px' }}>Generating Visualization</h2>
            <p style={{ fontSize: '16px', opacity: 0.9 }}>This may take 30-60 seconds...</p>
          </div>
        )}

        {/* Add CSS animation for spinner */}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Camera Video Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: 1
        }}
      />

      {/* Hidden canvas for mask generation */}
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
      />

      {/* Hidden canvas for perspective analysis */}
      <canvas
        ref={analysisCanvasRef}
        style={{ display: 'none' }}
      />

      {/* 3D Pool Overlay - with touch handlers */}
      <div 
        ref={overlayRef}
        id="ar-overlay"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: 'calc(100% - 220px)',
          zIndex: 2,
          pointerEvents: 'auto',
          backgroundColor: 'transparent',
          overflow: 'hidden',
          touchAction: 'none'
        }}
      >
        <Canvas
          camera={{ position: [0, 8, 8], fov: 60 }}
          style={{ 
            background: 'transparent', 
            width: '100%', 
            height: '100%',
            display: 'block'
          }}
          gl={{ 
            alpha: true, 
            antialias: true,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance',
            premultipliedAlpha: false
          }}
          dpr={[1, 2]}
          frameloop="always"
        >
          <ambientLight intensity={1.0} />
          <directionalLight position={[5, 10, 5]} intensity={1.5} />
          {/* Auto-detected perspective camera */}
          <PerspectiveCamera 
            makeDefault 
            position={[
              0 + cameraAngle.y * 2, // Slight horizontal offset based on tilt
              8 + Math.cos(cameraAngle.x) * 4, // Height adjusts based on tilt
              8 + Math.sin(cameraAngle.x) * 4  // Distance adjusts based on tilt
            ]} 
            rotation={[
              -Math.PI / 4 - cameraAngle.x * 0.5, // Pitch based on device tilt
              cameraAngle.y * 0.3, // Yaw based on device tilt
              0
            ]}
            fov={60} 
          />
          <PoolBox 
            dimensions={dimensions} 
            position={position}
          />
        </Canvas>
      </div>

      {/* Controls */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '15px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        zIndex: 3,
        maxHeight: '220px',
        overflowY: 'auto'
      }}>
        {!cameraReady && (
          <div style={{ color: '#666', textAlign: 'center', padding: '10px' }}>
            Initializing camera...
          </div>
        )}

        <div style={{ fontSize: '11px', color: '#666', textAlign: 'center', marginBottom: '5px' }}>
          Drag to move • Pinch to scale • Use sliders below
        </div>

        {/* Dimension Controls */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ minWidth: '70px', fontSize: '13px' }}>Length:</label>
          <input
            type="range"
            min="4"
            max="15"
            step="0.5"
            value={dimensions.length}
            onChange={(e) => setDimensions({ ...dimensions, length: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: '35px', fontSize: '13px' }}>{dimensions.length}m</span>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ minWidth: '70px', fontSize: '13px' }}>Width:</label>
          <input
            type="range"
            min="3"
            max="8"
            step="0.5"
            value={dimensions.width}
            onChange={(e) => setDimensions({ ...dimensions, width: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: '35px', fontSize: '13px' }}>{dimensions.width}m</span>
        </div>

        {/* Forward/Back Control (Z position) */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ minWidth: '70px', fontSize: '13px' }}>Forward/Back:</label>
          <input
            type="range"
            min="-5"
            max="5"
            step="0.1"
            value={position.z}
            onChange={(e) => setPosition({ ...position, z: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: '35px', fontSize: '13px' }}>{position.z.toFixed(1)}</span>
        </div>

        {/* Left/Right Control (X position) */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ minWidth: '70px', fontSize: '13px' }}>Left/Right:</label>
          <input
            type="range"
            min="-5"
            max="5"
            step="0.1"
            value={position.x}
            onChange={(e) => setPosition({ ...position, x: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: '35px', fontSize: '13px' }}>{position.x.toFixed(1)}</span>
        </div>

        {/* Rotation Control */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ minWidth: '70px', fontSize: '13px' }}>Rotation:</label>
          <input
            type="range"
            min="0"
            max="360"
            step="5"
            value={position.rotation}
            onChange={(e) => setPosition({ ...position, rotation: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: '35px', fontSize: '13px' }}>{position.rotation}°</span>
        </div>

        {/* Scale Control */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ minWidth: '70px', fontSize: '13px' }}>Scale:</label>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={position.scale}
            onChange={(e) => setPosition({ ...position, scale: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: '35px', fontSize: '13px' }}>{position.scale.toFixed(1)}x</span>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleCapture}
          disabled={isCapturing || isGenerating || !cameraReady}
          style={{
            padding: '15px 30px',
            fontSize: '18px',
            fontWeight: 'bold',
            backgroundColor: (isCapturing || isGenerating || !cameraReady) ? '#ccc' : '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: (isCapturing || isGenerating || !cameraReady) ? 'not-allowed' : 'pointer',
            marginTop: '5px'
          }}
        >
          {isGenerating ? 'Generating...' : isCapturing ? 'Capturing...' : 'Capture & Generate'}
        </button>

        {error && (
          <div style={{ color: 'red', padding: '10px', backgroundColor: '#ffebee', borderRadius: '4px', fontSize: '13px' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

export default ARVisualizer
