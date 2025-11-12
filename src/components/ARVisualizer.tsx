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
    z: -2, // Start pool closer to camera (negative Z = forward)
    rotation: 0,
    scale: 0.6 // Much smaller initial scale
  })

  const [isCapturing, setIsCapturing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [snapshotImage, setSnapshotImage] = useState<string | null>(null)
  const [arMode, setArMode] = useState<'manual' | 'webxr'>('manual')
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null)

  // Check for WebXR support
  useEffect(() => {
    const checkWebXR = async () => {
      if ('xr' in navigator) {
        try {
          // Check if AR is supported
          const isSupported = await (navigator as any).xr.isSessionSupported('immersive-ar')
          if (isSupported) {
            setArMode('webxr')
            console.log('WebXR AR is supported!')
          } else {
            console.log('WebXR AR not supported, using manual mode')
          }
        } catch (err) {
          console.log('WebXR check failed, using manual mode:', err)
        }
      } else {
        console.log('WebXR not available, using manual mode')
      }
    }
    checkWebXR()
  }, [])


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
      // In standing perspective: horizontal drag = left/right, vertical drag = forward/back
      setPosition(prev => ({
        ...prev,
        x: prev.x + deltaX * 0.015, // Left/right movement
        z: prev.z - deltaY * 0.015  // Forward/back (inverted: drag down = forward)
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

  // Generate mask image from 3D pool position - properly projected to 2D
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
    
    // Fill with black background
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // Camera parameters (matching the 3D scene)
    const cameraHeight = 1.8 // Eye level in meters
    const cameraDistance = 3 // Camera Z position
    const fov = 70 * (Math.PI / 180) // Field of view in radians
    
    // Project 3D pool position to 2D screen coordinates
    // Camera is at [0, 1.8, 3] in world space, looking down negative Z axis
    // Pool is at [position.x, depth/2, position.z] in world space
    // We want to project the ground-level footprint (y=0)
    const poolX3D = position.x
    const poolZ3D = position.z // World Z position
    const poolY3D = 0 // Ground level (pool footprint)
    
    // Camera parameters
    const cameraPitch = -0.3 // Camera rotation downward (looking down)
    
    // Transform pool position relative to camera
    // Camera is at [0, 1.8, 3], pool at [x, 0, z]
    const relativeX = poolX3D - 0 // Camera X is 0
    const relativeY = poolY3D - cameraHeight // Height relative to camera (ground is -1.8m below)
    const relativeZ = cameraDistance - poolZ3D // Distance from camera (camera at z=3, pool at z=position.z, so distance = 3 - position.z)
    
    // Apply camera rotation (pitch of -0.3 radians = looking down)
    const cosPitch = Math.cos(cameraPitch)
    const sinPitch = Math.sin(cameraPitch)
    const rotatedY = relativeY * cosPitch - relativeZ * sinPitch
    const rotatedZ = relativeY * sinPitch + relativeZ * cosPitch
    
    // Perspective projection to screen space
    const focalLength = canvas.height / (2 * Math.tan(fov / 2))
    const screenX = (relativeX / rotatedZ) * focalLength + canvas.width / 2
    const screenY = (-rotatedY / rotatedZ) * focalLength + canvas.height / 2
    
    // Calculate pool size in screen space based on actual dimensions and distance
    // Pool dimensions in meters, scaled by position.scale
    const poolLengthMeters = dimensions.length * position.scale
    const poolWidthMeters = dimensions.width * position.scale
    
    // Project size to screen (size appears smaller with distance)
    const poolWidthPixels = (poolLengthMeters / rotatedZ) * focalLength
    const poolHeightPixels = (poolWidthMeters / rotatedZ) * focalLength
    
    // Draw white pool shape at projected position
    ctx.save()
    ctx.translate(screenX, screenY)
    ctx.rotate((position.rotation * Math.PI) / 180)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(-poolWidthPixels / 2, -poolHeightPixels / 2, poolWidthPixels, poolHeightPixels)
    ctx.restore()
    
    console.log('Mask generated:', {
      pool3D: { x: poolX3D, z: poolZ3D },
      screenPos: { x: screenX, y: screenY },
      poolSize: { width: poolWidthPixels, height: poolHeightPixels },
      dimensions: dimensions,
      scale: position.scale
    })
    
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
          camera={{ position: [0, 1.8, 3], fov: 70 }}
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
          {/* Realistic standing perspective camera - eye level looking down */}
          <PerspectiveCamera 
            makeDefault 
            position={[0, 1.8, 3]} // Eye level (~1.8m) looking forward
            rotation={[-0.3, 0, 0]} // Slight downward angle (looking down at ground)
            fov={70} // Wider FOV for more natural view
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
          {arMode === 'webxr' ? (
            'WebXR AR Mode Active • Drag to move • Pinch to scale'
          ) : (
            <>
              Manual Mode • Drag to move • Pinch to scale • Use sliders below
              <br />
              <span style={{ fontSize: '10px', color: '#999' }}>
                Note: True AR tracking requires WebXR (Chrome/Edge on Android) or native app
              </span>
            </>
          )}
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

        {/* Position Controls - More intuitive for standing perspective */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ minWidth: '70px', fontSize: '13px' }}>Forward/Back:</label>
          <input
            type="range"
            min="-4"
            max="2"
            step="0.1"
            value={position.z}
            onChange={(e) => setPosition({ ...position, z: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: '35px', fontSize: '13px' }}>
            {position.z > 0 ? `${position.z.toFixed(1)}m back` : `${Math.abs(position.z).toFixed(1)}m forward`}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ minWidth: '70px', fontSize: '13px' }}>Left/Right:</label>
          <input
            type="range"
            min="-3"
            max="3"
            step="0.1"
            value={position.x}
            onChange={(e) => setPosition({ ...position, x: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: '35px', fontSize: '13px' }}>
            {position.x === 0 ? 'Center' : position.x > 0 ? `${position.x.toFixed(1)}m right` : `${Math.abs(position.x).toFixed(1)}m left`}
          </span>
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
