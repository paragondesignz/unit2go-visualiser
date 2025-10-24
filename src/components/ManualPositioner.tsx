import { useRef, useState, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { UploadedImage, TinyHomeModel } from '../types'

interface ManualPositionerProps {
  uploadedImage: UploadedImage
  tinyHomeModel: TinyHomeModel
  onGenerate: (compositeImageDataUrl: string) => void
  onCancel: () => void
}

interface WireframeBoxProps {
  dimensions: { length: number; width: number; height: number }
  imageWidth: number
  imageHeight: number
  position: { x: number; y: number; z: number }
  rotation: number
  scale: number
}

function WireframeBox({ dimensions, imageWidth, position, rotation, scale }: WireframeBoxProps) {
  // Calculate base dimensions - realistic tiny home size
  const estimatedRealWorldWidth = 20 // meters
  const pixelsPerMeter = imageWidth / estimatedRealWorldWidth

  // Base box dimensions (maintaining exact proportions)
  const baseBoxWidth = dimensions.length * pixelsPerMeter * 0.015
  const baseBoxDepth = dimensions.width * pixelsPerMeter * 0.015
  const baseBoxHeight = dimensions.height * pixelsPerMeter * 0.015

  // Use Z position to simulate depth by affecting scale
  const depthScale = 1 - (position.z * 0.15) // Z from 0-3, scale reduction 0-45%
  const finalScale = scale * depthScale

  // Memoize edges geometry to prevent recreation on every render
  const edges = useMemo(() => {
    const geometry = new THREE.BoxGeometry(baseBoxWidth, baseBoxHeight, baseBoxDepth)
    return new THREE.EdgesGeometry(geometry)
  }, [baseBoxWidth, baseBoxHeight, baseBoxDepth])

  return (
    <group
      position={[position.x, position.y, 0]}
      rotation={[0, rotation, 0]}
      scale={[finalScale, finalScale, finalScale]}
    >
      <mesh>
        <boxGeometry args={[baseBoxWidth, baseBoxHeight, baseBoxDepth]} />
        <meshBasicMaterial
          color={0x00ff00}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments>
        <primitive object={edges} attach="geometry" />
        <lineBasicMaterial color={0x00ff00} linewidth={2} />
      </lineSegments>
    </group>
  )
}

function Scene({
  tinyHomeModel,
  imageWidth,
  imageHeight,
  orbitControlsRef,
  position,
  rotation,
  scale
}: {
  tinyHomeModel: TinyHomeModel
  imageWidth: number
  imageHeight: number
  orbitControlsRef: React.RefObject<any>
  position: { x: number; y: number; z: number }
  rotation: number
  scale: number
}) {
  return (
    <>
      {/* Wireframe box */}
      <WireframeBox
        dimensions={tinyHomeModel.dimensions}
        imageWidth={imageWidth}
        imageHeight={imageHeight}
        position={position}
        rotation={rotation}
        scale={scale}
      />

      {/* Lighting */}
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 10, 5]} intensity={0.5} />

      {/* OrbitControls disabled - camera stays fixed, wireframe moves via sliders */}
      <OrbitControls
        ref={orbitControlsRef}
        enableRotate={false}
        enablePan={false}
        enableZoom={false}
      />
    </>
  )
}

function ManualPositioner({ uploadedImage, tinyHomeModel, onGenerate, onCancel }: ManualPositionerProps) {
  const [imageDimensions, setImageDimensions] = useState({ width: 1920, height: 1080 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const orbitControlsRef = useRef<any>(null)

  // Wireframe transform state - centered in middle of image, realistic size
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 })
  const [rotation, setRotation] = useState(0)
  const [scale, setScale] = useState(0.5) // Start with realistic tiny home size (50%)

  // Load image dimensions
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setImageDimensions({ width: img.width, height: img.height })
    }
    img.src = uploadedImage.url
  }, [uploadedImage.url])

  // Prevent wheel/zoom events on canvas to keep background truly static
  useEffect(() => {
    const container = canvasContainerRef.current
    if (!container) return

    const preventZoom = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    container.addEventListener('wheel', preventZoom, { passive: false })
    return () => container.removeEventListener('wheel', preventZoom)
  }, [])

  const handleCapture = () => {
    if (!canvasRef.current) return

    // Capture the canvas as data URL
    const dataURL = canvasRef.current.toDataURL('image/png')
    onGenerate(dataURL)
  }

  return (
    <div className="manual-positioner">
      <div className="positioner-header">
        <h2>Manual Positioning</h2>
        <p>Use the side panel controls to position, rotate, and scale the tiny home placement guide</p>
      </div>

      <div className="positioner-workspace">
        <div
          ref={canvasContainerRef}
          className="canvas-container"
          style={{
            backgroundImage: `url(${uploadedImage.url})`,
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}
        >
          <Canvas
            ref={canvasRef}
            gl={{
              preserveDrawingBuffer: true,
              alpha: true
            }}
            orthographic
            camera={{ position: [0, 0, 10], zoom: 80, near: 0.1, far: 1000 }}
          >
            <Scene
              tinyHomeModel={tinyHomeModel}
              imageWidth={imageDimensions.width}
              imageHeight={imageDimensions.height}
              orbitControlsRef={orbitControlsRef}
              position={position}
              rotation={rotation}
              scale={scale}
            />
          </Canvas>
        </div>

        <div className="control-panel-side">
          <h3>Position</h3>
          <div className="control-group">
            <label>
              Horizontal (Left ← → Right)
              <input
                type="range"
                min="-5"
                max="5"
                step="0.1"
                value={position.x}
                onChange={(e) => setPosition(prev => ({ ...prev, x: parseFloat(e.target.value) }))}
              />
              <span className="control-value">{position.x.toFixed(1)}</span>
            </label>
          </div>

          <div className="control-group">
            <label>
              Vertical (Up ↑ ↓ Down)
              <input
                type="range"
                min="-5"
                max="5"
                step="0.1"
                value={position.y}
                onChange={(e) => setPosition(prev => ({ ...prev, y: parseFloat(e.target.value) }))}
              />
              <span className="control-value">{position.y.toFixed(1)}</span>
            </label>
          </div>

          <div className="control-group">
            <label>
              Depth (Back ← → Forward)
              <input
                type="range"
                min="0"
                max="3"
                step="0.1"
                value={position.z}
                onChange={(e) => setPosition(prev => ({ ...prev, z: parseFloat(e.target.value) }))}
              />
              <span className="control-value">{position.z === 0 ? 'Front' : position.z === 3 ? 'Back' : position.z.toFixed(1)}</span>
            </label>
          </div>

          <h3>Rotation</h3>
          <div className="control-group">
            <label>
              Angle
              <input
                type="range"
                min="0"
                max={Math.PI * 2}
                step="0.1"
                value={rotation}
                onChange={(e) => setRotation(parseFloat(e.target.value))}
              />
              <span className="control-value">{Math.round((rotation * 180) / Math.PI)}°</span>
            </label>
          </div>

          <h3>Scale (Maintains Proportions)</h3>
          <div className="control-group">
            <label>
              Size
              <input
                type="range"
                min="0.01"
                max="2"
                step="0.01"
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
              />
              <span className="control-value">{Math.round(scale * 100)}%</span>
            </label>
          </div>

          <div className="control-actions">
            <button className="reset-button" onClick={() => {
              setPosition({ x: 0, y: 0, z: 0 })
              setRotation(0)
              setScale(0.5)
            }}>
              Reset to Default
            </button>
          </div>
        </div>
      </div>

      <div className="positioner-actions">
        <button className="cancel-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="generate-button" onClick={handleCapture}>
          Generate with this Position
        </button>
      </div>

      <div className="positioner-help">
        <p><strong>Instructions:</strong> Use the side panel sliders to adjust the position, rotation, and scale of the tiny home placement guide. The background image remains fixed while you position the wireframe.</p>
      </div>
    </div>
  )
}

export default ManualPositioner
