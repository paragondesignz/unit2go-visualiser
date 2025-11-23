import { CameraPosition, InteriorViewRequest } from '../types'

interface InteriorCameraControllerProps {
  camera: CameraPosition
  onCameraUpdate: (camera: CameraPosition) => void
  interiorRequest: InteriorViewRequest
  onViewTypeChange: (viewType: 'wide' | 'standard' | 'close-up') => void
  onRoomFocus: (room?: string, focusArea?: string) => void
}

function InteriorCameraController({
  camera,
  onCameraUpdate,
  interiorRequest,
  onViewTypeChange,
  onRoomFocus
}: InteriorCameraControllerProps) {

  const handleCameraChange = (field: keyof CameraPosition, value: number) => {
    onCameraUpdate({
      ...camera,
      [field]: value
    })
  }

  const presetAngles = [
    { name: 'North', angle: 0 },
    { name: 'East', angle: 90 },
    { name: 'South', angle: 180 },
    { name: 'West', angle: 270 }
  ]

  const roomPresets = [
    { name: 'Living Area', room: 'living area', focusArea: 'seating and entertainment space' },
    { name: 'Kitchen', room: 'kitchen', focusArea: 'appliances and counter space' },
    { name: 'Bedroom', room: 'bedroom', focusArea: 'bed and storage solutions' },
    { name: 'Bathroom', room: 'bathroom', focusArea: 'fixtures and layout' },
    { name: 'Entrance', room: 'entrance', focusArea: 'entry way and storage' }
  ]

  return (
    <div className="camera-controller">
      <div className="controller-section">
        <h3>Camera Position</h3>

        <div className="control-group">
          <label>X Position: {camera.x.toFixed(1)}%</label>
          <input
            type="range"
            min="5"
            max="95"
            value={camera.x}
            onChange={(e) => handleCameraChange('x', parseFloat(e.target.value))}
            className="slider"
          />
        </div>

        <div className="control-group">
          <label>Y Position: {camera.y.toFixed(1)}%</label>
          <input
            type="range"
            min="5"
            max="95"
            value={camera.y}
            onChange={(e) => handleCameraChange('y', parseFloat(e.target.value))}
            className="slider"
          />
        </div>
      </div>

      <div className="controller-section">
        <h3>Camera Orientation</h3>

        <div className="control-group">
          <label>Viewing Angle: {camera.viewingAngle}°</label>
          <input
            type="range"
            min="0"
            max="359"
            value={camera.viewingAngle}
            onChange={(e) => handleCameraChange('viewingAngle', parseFloat(e.target.value))}
            className="slider"
          />

          <div className="preset-buttons">
            {presetAngles.map(preset => (
              <button
                key={preset.angle}
                onClick={() => handleCameraChange('viewingAngle', preset.angle)}
                className={`preset-btn ${camera.viewingAngle === preset.angle ? 'active' : ''}`}
                style={{
                  padding: '0.25rem 0.5rem',
                  margin: '0.125rem',
                  fontSize: '0.8rem',
                  border: `1px solid ${camera.viewingAngle === preset.angle ? '#007bff' : '#ddd'}`,
                  backgroundColor: camera.viewingAngle === preset.angle ? '#007bff' : 'white',
                  color: camera.viewingAngle === preset.angle ? 'white' : '#333',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="controller-section">
        <h3>Camera Settings</h3>

        <div className="control-group">
          <label>Height: {camera.height}m</label>
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.1"
            value={camera.height}
            onChange={(e) => handleCameraChange('height', parseFloat(e.target.value))}
            className="slider"
          />
          <div className="preset-buttons">
            <button
              onClick={() => handleCameraChange('height', 1.2)}
              className={`preset-btn ${camera.height === 1.2 ? 'active' : ''}`}
              style={{
                padding: '0.25rem 0.5rem',
                margin: '0.125rem',
                fontSize: '0.8rem',
                border: `1px solid ${camera.height === 1.2 ? '#007bff' : '#ddd'}`,
                backgroundColor: camera.height === 1.2 ? '#007bff' : 'white',
                color: camera.height === 1.2 ? 'white' : '#333',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Seated
            </button>
            <button
              onClick={() => handleCameraChange('height', 1.6)}
              className={`preset-btn ${camera.height === 1.6 ? 'active' : ''}`}
              style={{
                padding: '0.25rem 0.5rem',
                margin: '0.125rem',
                fontSize: '0.8rem',
                border: `1px solid ${camera.height === 1.6 ? '#007bff' : '#ddd'}`,
                backgroundColor: camera.height === 1.6 ? '#007bff' : 'white',
                color: camera.height === 1.6 ? 'white' : '#333',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Standing
            </button>
          </div>
        </div>

        <div className="control-group">
          <label>Field of View: {camera.fieldOfView}°</label>
          <input
            type="range"
            min="30"
            max="120"
            step="5"
            value={camera.fieldOfView}
            onChange={(e) => handleCameraChange('fieldOfView', parseFloat(e.target.value))}
            className="slider"
          />
          <div className="fov-presets">
            <span style={{ fontSize: '0.8rem', color: '#666' }}>
              {camera.fieldOfView <= 50 ? 'Narrow (Telephoto)' :
               camera.fieldOfView <= 85 ? 'Standard' : 'Wide Angle'}
            </span>
          </div>
        </div>
      </div>

      <div className="controller-section">
        <h3>View Type</h3>
        <div className="view-type-selector">
          {(['wide', 'standard', 'close-up'] as const).map(type => (
            <button
              key={type}
              onClick={() => onViewTypeChange(type)}
              className={`view-type-btn ${interiorRequest.viewType === type ? 'active' : ''}`}
              style={{
                padding: '0.75rem 1rem',
                margin: '0.25rem',
                border: `2px solid ${interiorRequest.viewType === type ? '#007bff' : '#ddd'}`,
                backgroundColor: interiorRequest.viewType === type ? '#007bff' : 'white',
                color: interiorRequest.viewType === type ? 'white' : '#333',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: interiorRequest.viewType === type ? '600' : '400',
                textTransform: 'capitalize'
              }}
            >
              {type}
            </button>
          ))}
        </div>
        <div className="view-type-description" style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
          {interiorRequest.viewType === 'wide' && 'Wide angle showing room context and layout'}
          {interiorRequest.viewType === 'standard' && 'Normal perspective view with balanced composition'}
          {interiorRequest.viewType === 'close-up' && 'Close-up detail view focusing on specific areas'}
        </div>
      </div>

      <div className="controller-section">
        <h3>Room Focus</h3>
        <div className="room-presets">
          <button
            onClick={() => onRoomFocus(undefined, undefined)}
            className={`room-btn ${!interiorRequest.room ? 'active' : ''}`}
            style={{
              padding: '0.5rem 0.75rem',
              margin: '0.25rem',
              border: `1px solid ${!interiorRequest.room ? '#007bff' : '#ddd'}`,
              backgroundColor: !interiorRequest.room ? '#007bff' : 'white',
              color: !interiorRequest.room ? 'white' : '#333',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            General View
          </button>

          {roomPresets.map(preset => (
            <button
              key={preset.name}
              onClick={() => onRoomFocus(preset.room, preset.focusArea)}
              className={`room-btn ${interiorRequest.room === preset.room ? 'active' : ''}`}
              style={{
                padding: '0.5rem 0.75rem',
                margin: '0.25rem',
                border: `1px solid ${interiorRequest.room === preset.room ? '#007bff' : '#ddd'}`,
                backgroundColor: interiorRequest.room === preset.room ? '#007bff' : 'white',
                color: interiorRequest.room === preset.room ? 'white' : '#333',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {interiorRequest.room && (
          <div className="room-description" style={{
            fontSize: '0.85rem',
            color: '#666',
            marginTop: '0.5rem',
            fontStyle: 'italic'
          }}>
            Focus: {interiorRequest.focusArea}
          </div>
        )}
      </div>

      <div className="camera-summary">
        <h4>Current Settings</h4>
        <div className="summary-grid" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.5rem',
          fontSize: '0.85rem',
          color: '#555'
        }}>
          <div><strong>Position:</strong> ({camera.x.toFixed(1)}%, {camera.y.toFixed(1)}%)</div>
          <div><strong>Height:</strong> {camera.height}m</div>
          <div><strong>Angle:</strong> {camera.viewingAngle}°</div>
          <div><strong>FOV:</strong> {camera.fieldOfView}°</div>
          <div><strong>View:</strong> {interiorRequest.viewType}</div>
          <div><strong>Focus:</strong> {interiorRequest.room || 'General'}</div>
        </div>
      </div>
    </div>
  )
}

export default InteriorCameraController