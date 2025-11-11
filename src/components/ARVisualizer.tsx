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

  // Update position when props change - this is the single source of truth
  useEffect(() => {
    if (groupRef.current) {
      // Position pool at ground level (y = depth/2 means bottom is at y=0)
      groupRef.current.position.set(position.x, dimensions.depth / 2, position.z)
      groupRef.current.rotation.y = (position.rotation * Math.PI) / 180
      groupRef.current.scale.setScalar(position.scale)
    }
  }, [position, dimensions.depth])

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
    scale: 1.5  // Better initial scale
  })

  const [isCapturing, setIsCapturing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null)

  // Initialize camera
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment', // Use back camera
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

    // Cleanup
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
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isDraggingRef.current && e.touches.length === 1 && lastTouchRef.current) {
      const touch = e.touches[0]
      const deltaX = touch.clientX - lastTouchRef.current.x
      const deltaY = touch.clientY - lastTouchRef.current.y
      
      // Convert screen movement to 3D position movement
      // Scale factor: 0.01 means 100px movement = 1 unit in 3D space
      setPosition(prev => ({
        ...prev,
        x: prev.x + deltaX * 0.01,
        z: prev.z + deltaY * 0.01
      }))
      
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY }
    } else if (e.touches.length === 2) {
      // Pinch to zoom/scale
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      
      // Store initial distance on first two-finger touch
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
    
    // Set canvas size to match video
    canvas.width = video.videoWidth || 1920
    canvas.height = video.videoHeight || 1080
    
    // Fill with black background
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // Calculate pool position in screen space
    const centerX = canvas.width / 2 + (position.x * (canvas.width / 20))
    const centerY = canvas.height / 2 + (position.z * (canvas.height / 20))
    
    // Scale pool size based on dimensions and canvas size
    const poolWidth = (dimensions.length / 10) * canvas.width * position.scale * 0.3
    const poolHeight = (dimensions.width / 10) * canvas.width * position.scale * 0.3
    
    // Draw white pool shape
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
    
    // Set canvas size to match video
    canvas.width = video.videoWidth || 1920
    canvas.height = video.videoHeight || 1080
    
    // Draw video frame to canvas
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
        setIsCapturing(false)
        setIsGenerating(false)
      }
    } catch (err) {
      console.error('Capture error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setIsCapturing(false)
      setIsGenerating(false)
    }
  }, [cameraReady, dimensions, position, captureCameraImage, generateMaskImage, onCapture, onResult])

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
          height: 'calc(100% - 200px)',
          zIndex: 2,
          pointerEvents: 'auto', // Enable touch events
          backgroundColor: 'transparent',
          overflow: 'hidden',
          touchAction: 'none' // Prevent default touch behaviors
        }}
      >
        <Canvas
          camera={{ position: [0, 4, 8], fov: 60 }}
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
          <PerspectiveCamera makeDefault position={[0, 4, 8]} fov={60} />
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
        padding: '20px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        display: 'flex',
        flexDirection: 'column',
        gap: '15px',
        zIndex: 3
      }}>
        {!cameraReady && (
          <div style={{ color: '#666', textAlign: 'center', padding: '10px' }}>
            Initializing camera...
          </div>
        )}

        <div style={{ fontSize: '12px', color: '#666', textAlign: 'center', marginBottom: '5px' }}>
          Drag to move • Pinch to scale • Use sliders below
        </div>

        {/* Dimension Controls */}
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <label style={{ minWidth: '80px', fontSize: '14px' }}>Length (m):</label>
          <input
            type="range"
            min="4"
            max="15"
            step="0.5"
            value={dimensions.length}
            onChange={(e) => setDimensions({ ...dimensions, length: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: '40px', fontSize: '14px' }}>{dimensions.length}m</span>
        </div>
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <label style={{ minWidth: '80px', fontSize: '14px' }}>Width (m):</label>
          <input
            type="range"
            min="3"
            max="8"
            step="0.5"
            value={dimensions.width}
            onChange={(e) => setDimensions({ ...dimensions, width: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: '40px', fontSize: '14px' }}>{dimensions.width}m</span>
        </div>

        {/* Rotation Control */}
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <label style={{ minWidth: '80px', fontSize: '14px' }}>Rotation:</label>
          <input
            type="range"
            min="0"
            max="360"
            step="5"
            value={position.rotation}
            onChange={(e) => setPosition({ ...position, rotation: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: '40px', fontSize: '14px' }}>{position.rotation}°</span>
        </div>

        {/* Scale Control */}
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <label style={{ minWidth: '80px', fontSize: '14px' }}>Scale:</label>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={position.scale}
            onChange={(e) => setPosition({ ...position, scale: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: '40px', fontSize: '14px' }}>{position.scale.toFixed(1)}x</span>
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
            cursor: (isCapturing || isGenerating || !cameraReady) ? 'not-allowed' : 'pointer'
          }}
        >
          {isGenerating ? 'Generating...' : isCapturing ? 'Capturing...' : 'Capture & Generate'}
        </button>

        {error && (
          <div style={{ color: 'red', padding: '10px', backgroundColor: '#ffebee', borderRadius: '4px', fontSize: '14px' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

export default ARVisualizer
