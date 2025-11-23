import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { tinyHomeModels } from '../data/tinyHomeModels'
import { TinyHomeModel, CameraPosition, InteriorViewRequest } from '../types'
import { generateInteriorView } from '../services/geminiService'
import InteriorCameraController from '../components/InteriorCameraController'
import FloorPlanViewer from '../components/FloorPlanViewer'

type InteriorStep = 'select-model' | 'position-camera' | 'generate' | 'result'

function InteriorGeneratorPage() {
  const navigate = useNavigate()

  // Only show models that support interior views
  const interiorModels = tinyHomeModels.filter(model => model.supportsInteriorViews)

  const [currentStep, setCurrentStep] = useState<InteriorStep>('select-model')
  const [selectedModel, setSelectedModel] = useState<TinyHomeModel | null>(null)
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>({
    x: 50, // Center of floor plan
    y: 50,
    viewingAngle: 0, // North
    height: 1.6, // Eye level
    fieldOfView: 75 // Standard view
  })
  const [interiorRequest, setInteriorRequest] = useState<InteriorViewRequest>({
    camera: cameraPosition,
    viewType: 'standard'
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleModelSelect = (model: TinyHomeModel) => {
    setSelectedModel(model)
    setCurrentStep('position-camera')
  }

  const handleCameraUpdate = (camera: CameraPosition) => {
    setCameraPosition(camera)
    setInteriorRequest(prev => ({ ...prev, camera }))
  }

  const handleViewTypeChange = (viewType: 'wide' | 'standard' | 'close-up') => {
    setInteriorRequest(prev => ({ ...prev, viewType }))
  }

  const handleRoomFocus = (room?: string, focusArea?: string) => {
    setInteriorRequest(prev => ({ ...prev, room, focusArea }))
  }

  const handleGenerate = async () => {
    if (!selectedModel) return

    setIsGenerating(true)
    setError(null)
    setCurrentStep('generate')

    try {
      const result = await generateInteriorView(selectedModel, interiorRequest, {
        imageSize: '2K',
        accuracyMode: 'maximum',
        useThinkingProcess: true
      })

      setGeneratedImage(result.imageUrl)
      setCurrentStep('result')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate interior view')
      setCurrentStep('position-camera')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleBack = () => {
    switch (currentStep) {
      case 'position-camera':
        setCurrentStep('select-model')
        break
      case 'generate':
      case 'result':
        setCurrentStep('position-camera')
        break
      default:
        navigate('/')
        break
    }
  }

  const handleReset = () => {
    setCurrentStep('select-model')
    setSelectedModel(null)
    setGeneratedImage(null)
    setError(null)
    // Reset camera to center
    const defaultCamera = {
      x: 50,
      y: 50,
      viewingAngle: 0,
      height: 1.6,
      fieldOfView: 75
    }
    setCameraPosition(defaultCamera)
    setInteriorRequest({
      camera: defaultCamera,
      viewType: 'standard'
    })
  }

  return (
    <div className="interior-generator-page">
      <header className="page-header">
        <div className="header-content">
          <div className="header-logo-container">
            <img src="/unit2go-logo.png" alt="Unit2Go" className="header-logo" />
            <h1 className="header-title">Interior AI Generator</h1>
          </div>
          <div className="steps-indicator">
            <div className={`step ${currentStep === 'select-model' ? 'active' : ''}`}>
              <span className="step-number">1</span>
              <span className="step-label">Select Model</span>
            </div>
            <div className={`step ${currentStep === 'position-camera' ? 'active' : ''}`}>
              <span className="step-number">2</span>
              <span className="step-label">Position Camera</span>
            </div>
            <div className={`step ${currentStep === 'generate' || currentStep === 'result' ? 'active' : ''}`}>
              <span className="step-number">3</span>
              <span className="step-label">Generate</span>
            </div>
          </div>
          <div className="header-nav">
            <button
              onClick={() => navigate('/')}
              className="nav-link"
              style={{
                background: 'none',
                border: 'none',
                color: '#666',
                cursor: 'pointer',
                fontSize: '0.9rem',
                textDecoration: 'underline'
              }}
            >
              ← Back to Home
            </button>
            <span style={{ margin: '0 1rem', color: '#ddd' }}>|</span>
            <button
              onClick={() => navigate('/visualizer')}
              className="nav-link"
              style={{
                background: 'none',
                border: 'none',
                color: '#666',
                cursor: 'pointer',
                fontSize: '0.9rem',
                textDecoration: 'underline'
              }}
            >
              Exterior Visualizer
            </button>
          </div>
        </div>
      </header>

      <main className="page-content">
        {/* Model Selection Step */}
        {currentStep === 'select-model' && (
          <div className="select-section">
            <div className="select-content-centered">
              <div className="model-selection-full">
                <h2>Choose Your Tiny Home Model</h2>
                <p className="select-instruction">
                  Select a tiny home model with top-down floor plan view. You'll be able to position a virtual camera
                  anywhere inside and generate photorealistic interior photographs from that perspective.
                </p>

                <div className="model-cards-grid">
                  {interiorModels.map((model) => (
                    <div
                      key={model.id}
                      className="model-card-full interior-model-card"
                      onClick={() => handleModelSelect(model)}
                      style={{ cursor: 'pointer' }}
                    >
                      <img src={model.imageUrl} alt={model.name} className="model-preview-full" />
                      <div className="model-info-full">
                        <h4>{model.name}</h4>
                        <p>{model.dimensions.length}m × {model.dimensions.width}m × {model.dimensions.height}m</p>
                        <div className="model-features">
                          <span className="feature-badge">Interior Views Enabled</span>
                          <span className="feature-badge">Top-Down Layout</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {interiorModels.length === 0 && (
                  <div className="no-models-message">
                    <h3>No Interior Models Available</h3>
                    <p>Interior view generation models will be added soon. Check back later!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Camera Positioning Step */}
        {currentStep === 'position-camera' && selectedModel && (
          <div className="camera-positioning-section">
            <button className="back-button" onClick={handleBack}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to Models
            </button>

            <div className="positioning-content">
              <div className="positioning-header">
                <h2>Position Your Camera</h2>
                <p>Click anywhere on the floor plan to position your virtual camera, then adjust the viewing angle and settings.</p>
              </div>

              <div className="positioning-workspace">
                {/* Floor Plan Viewer */}
                <div className="floor-plan-container">
                  <FloorPlanViewer
                    model={selectedModel}
                    cameraPosition={cameraPosition}
                    onCameraMove={handleCameraUpdate}
                  />
                </div>

                {/* Camera Controls */}
                <div className="camera-controls-container">
                  <InteriorCameraController
                    camera={cameraPosition}
                    onCameraUpdate={handleCameraUpdate}
                    interiorRequest={interiorRequest}
                    onViewTypeChange={handleViewTypeChange}
                    onRoomFocus={handleRoomFocus}
                  />

                  <button
                    className="generate-button-large"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                  >
                    Generate Interior View
                  </button>
                </div>
              </div>

              {error && (
                <div className="error-message" style={{
                  background: '#ffe6e6',
                  border: '1px solid #ff9999',
                  color: '#cc0000',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginTop: '1rem'
                }}>
                  <strong>Error:</strong> {error}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Generation Loading Step */}
        {currentStep === 'generate' && (
          <div className="generate-section">
            <button className="back-button" onClick={handleBack}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to Camera
            </button>

            <div className="generate-content">
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <h2>Generating Interior View...</h2>
                <p>Creating your photorealistic interior photograph from camera position ({cameraPosition.x}%, {cameraPosition.y}%) at {cameraPosition.viewingAngle}° angle</p>
                <div className="loading-details">
                  <div>Camera Height: {cameraPosition.height}m</div>
                  <div>Field of View: {cameraPosition.fieldOfView}°</div>
                  <div>View Type: {interiorRequest.viewType}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Result Step */}
        {currentStep === 'result' && generatedImage && selectedModel && (
          <div className="result-section">
            <button className="back-button" onClick={handleBack}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to Camera
            </button>

            <div className="result-content">
              <div className="result-header">
                <h2>Your Interior View</h2>
                <div className="camera-info">
                  <span>Position: ({cameraPosition.x}%, {cameraPosition.y}%)</span>
                  <span>Angle: {cameraPosition.viewingAngle}°</span>
                  <span>Height: {cameraPosition.height}m</span>
                  <span>View: {interiorRequest.viewType}</span>
                </div>
              </div>

              <div className="result-image-container">
                <img
                  src={generatedImage}
                  alt="Generated interior view"
                  className="result-image"
                />
              </div>

              <div className="result-actions">
                <button
                  onClick={handleBack}
                  className="secondary-button"
                >
                  Adjust Camera
                </button>
                <button
                  onClick={handleReset}
                  className="secondary-button"
                >
                  New Model
                </button>
                <button
                  onClick={() => {
                    const link = document.createElement('a')
                    link.href = generatedImage
                    link.download = `interior-view-${selectedModel.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.png`
                    link.click()
                  }}
                  className="primary-button"
                >
                  Download Image
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default InteriorGeneratorPage