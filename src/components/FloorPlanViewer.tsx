import { useState, useRef, MouseEvent } from 'react'
import { TinyHomeModel, CameraPosition } from '../types'

interface FloorPlanViewerProps {
  model: TinyHomeModel
  cameraPosition: CameraPosition
  onCameraMove: (camera: CameraPosition) => void
}

function FloorPlanViewer({ model, cameraPosition, onCameraMove }: FloorPlanViewerProps) {
  const [isDragging, setIsDragging] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null)

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    setIsDragging(true)
    handleMouseMove(e)
  }

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return

    const rect = imageRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    // Clamp to image boundaries
    const clampedX = Math.max(5, Math.min(95, x))
    const clampedY = Math.max(5, Math.min(95, y))

    onCameraMove({
      ...cameraPosition,
      x: clampedX,
      y: clampedY
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Calculate direction indicator rotation
  const getDirectionStyle = () => {
    return {
      transform: `translate(-50%, -50%) rotate(${cameraPosition.viewingAngle}deg)`
    }
  }

  // Get field of view indicator style
  const getFOVStyle = () => {
    const fovWidth = (cameraPosition.fieldOfView / 120) * 100 // Scale FOV to visual size
    return {
      width: `${Math.max(20, Math.min(80, fovWidth))}px`,
      height: `${Math.max(20, Math.min(80, fovWidth))}px`
    }
  }

  return (
    <div className="floor-plan-viewer">
      <div className="floor-plan-header">
        <h3>{model.name}</h3>
        <div className="floor-plan-info">
          <span>{model.dimensions.length}m × {model.dimensions.width}m</span>
          <span>Camera: ({cameraPosition.x.toFixed(1)}%, {cameraPosition.y.toFixed(1)}%)</span>
        </div>
      </div>

      <div
        className="floor-plan-container"
        onMouseDown={handleMouseDown}
        onMouseMove={isDragging ? handleMouseMove : undefined}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          position: 'relative',
          cursor: isDragging ? 'grabbing' : 'crosshair',
          border: '2px solid #ddd',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: '#f9f9f9',
          userSelect: 'none'
        }}
      >
        <img
          ref={imageRef}
          src={model.imageUrl}
          alt={`${model.name} floor plan`}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            maxWidth: '600px',
            maxHeight: '500px'
          }}
          draggable={false}
        />

        {/* Camera Position Indicator */}
        <div
          className="camera-indicator"
          style={{
            position: 'absolute',
            left: `${cameraPosition.x}%`,
            top: `${cameraPosition.y}%`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 10
          }}
        >
          {/* Camera dot */}
          <div
            style={{
              width: '12px',
              height: '12px',
              backgroundColor: '#ff4444',
              borderRadius: '50%',
              border: '2px solid white',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)'
            }}
          />

          {/* Direction arrow */}
          <div
            className="direction-indicator"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              ...getDirectionStyle()
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ff4444"
              strokeWidth="3"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
            >
              <path d="M12 2l0 20M2 12l10-10 10 10" />
            </svg>
          </div>

          {/* Field of view indicator */}
          <div
            className="fov-indicator"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              border: '1px dashed rgba(255, 68, 68, 0.6)',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 68, 68, 0.1)',
              pointerEvents: 'none',
              ...getFOVStyle()
            }}
          />
        </div>

        {/* Grid overlay for reference */}
        <div
          className="grid-overlay"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            opacity: 0.2
          }}
        >
          {/* Vertical grid lines */}
          {[25, 50, 75].map(x => (
            <div
              key={`v-${x}`}
              style={{
                position: 'absolute',
                left: `${x}%`,
                top: 0,
                bottom: 0,
                width: '1px',
                backgroundColor: '#666',
                opacity: 0.3
              }}
            />
          ))}
          {/* Horizontal grid lines */}
          {[25, 50, 75].map(y => (
            <div
              key={`h-${y}`}
              style={{
                position: 'absolute',
                top: `${y}%`,
                left: 0,
                right: 0,
                height: '1px',
                backgroundColor: '#666',
                opacity: 0.3
              }}
            />
          ))}
        </div>
      </div>

      <div className="floor-plan-legend">
        <div className="legend-item">
          <div className="legend-icon">
            <div style={{
              width: '8px',
              height: '8px',
              backgroundColor: '#ff4444',
              borderRadius: '50%',
              border: '1px solid white'
            }} />
          </div>
          <span>Camera Position</span>
        </div>
        <div className="legend-item">
          <div className="legend-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="2">
              <path d="M12 2l0 20M2 12l10-10 10 10" />
            </svg>
          </div>
          <span>Viewing Direction</span>
        </div>
        <div className="legend-item">
          <div className="legend-icon">
            <div style={{
              width: '12px',
              height: '12px',
              border: '1px dashed #ff4444',
              borderRadius: '50%',
              opacity: 0.6
            }} />
          </div>
          <span>Field of View</span>
        </div>
      </div>

      <div className="floor-plan-instructions">
        <p><strong>Instructions:</strong></p>
        <ul>
          <li>Click anywhere on the floor plan to position your camera</li>
          <li>Use the controls on the right to adjust viewing angle and settings</li>
          <li>The red arrow shows your viewing direction</li>
          <li>The dashed circle represents your field of view</li>
        </ul>
      </div>
    </div>
  )
}

export default FloorPlanViewer