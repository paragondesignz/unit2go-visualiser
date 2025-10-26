import { useState } from 'react'
import ImageUpload from '../components/ImageUpload'
import Visualizer from '../components/Visualizer'
import { UploadedImage, TinyHomeModel, PlacementPreferences } from '../types'
import { tinyHomeModels } from '../data/tinyHomeModels'

function VisualizerPage() {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null)
  const [currentStep, setCurrentStep] = useState<'upload' | 'position' | 'visualize'>('upload')
  const [selectedTinyHome, setSelectedTinyHome] = useState<TinyHomeModel>(tinyHomeModels[0])
  const [placementPreferences, setPlacementPreferences] = useState<PlacementPreferences>({
    horizontal: 'center',
    depth: 'midground'
  })
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null)

  const handleImageUpload = (image: UploadedImage) => {
    setUploadedImage(image)
    setCurrentStep('position')
  }

  const handleGenerate = () => {
    setCurrentStep('visualize')
  }

  const handleBack = () => {
    if (currentStep === 'position') {
      setUploadedImage(null)
      setClickPosition(null)
      setCurrentStep('upload')
    } else {
      setCurrentStep('position')
    }
  }

  return (
    <div className="visualizer-page">
      <header className="page-header">
        <div className="header-content">
          <div className="header-logo-container">
            <img src="/unit2go-logo.png" alt="Unit2Go" className="header-logo" />
            <h1 className="header-title">AI Visualiser</h1>
          </div>
          <div className="steps-indicator">
            <div className={`step ${currentStep === 'upload' ? 'active' : ''}`}>
              <span className="step-number">1</span>
              <span className="step-label">Upload Photo</span>
            </div>
            <div className={`step ${currentStep === 'position' ? 'active' : ''}`}>
              <span className="step-number">2</span>
              <span className="step-label">Position</span>
            </div>
            <div className={`step ${currentStep === 'visualize' ? 'active' : ''}`}>
              <span className="step-number">3</span>
              <span className="step-label">Visualize</span>
            </div>
          </div>
        </div>
      </header>

      <main className="page-content">
        {currentStep === 'upload' && (
          <div className="upload-section">
            <ImageUpload onImageUpload={handleImageUpload} />
          </div>
        )}

        {currentStep === 'position' && uploadedImage && (
          <div className="position-section">
            <button className="back-button" onClick={handleBack}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to Upload
            </button>

            <div className="position-content">
              <div className="position-left">
                <h2>Click where you want the tiny home</h2>
                <p className="position-instruction">Click on the image to position your tiny home. The placement indicator shows where it will be placed.</p>

                <div
                  className="position-image-container"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const x = ((e.clientX - rect.left) / rect.width) * 100
                    const y = ((e.clientY - rect.top) / rect.height) * 100
                    setClickPosition({ x, y })

                    // Update horizontal based on click position
                    if (x < 33.33) {
                      setPlacementPreferences({...placementPreferences, horizontal: 'left'})
                    } else if (x > 66.66) {
                      setPlacementPreferences({...placementPreferences, horizontal: 'right'})
                    } else {
                      setPlacementPreferences({...placementPreferences, horizontal: 'center'})
                    }
                  }}
                >
                  <img src={uploadedImage.url} alt="Your property" className="position-image" />
                  {clickPosition && (
                    <div
                      className="position-indicator"
                      style={{
                        left: `${clickPosition.x}%`,
                        top: `${clickPosition.y}%`
                      }}
                    >
                      <div className="position-crosshair"></div>
                      <div className="position-circle"></div>
                    </div>
                  )}
                </div>
              </div>

              <div className="position-right">
                <div className="model-selection-compact">
                  <h3>Choose Model</h3>
                  <div className="model-cards-compact">
                    {tinyHomeModels.map((model) => (
                      <div
                        key={model.id}
                        className={`model-card-compact ${selectedTinyHome.id === model.id ? 'selected' : ''}`}
                        onClick={() => setSelectedTinyHome(model)}
                      >
                        <img src={model.imageUrl} alt={model.name} className="model-preview-compact" />
                        <div className="model-info-compact">
                          <h4>{model.name}</h4>
                          <p>{model.dimensions.length}m × {model.dimensions.width}m</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="depth-selection">
                  <h3>Depth</h3>
                  <p className="depth-subtitle">How far away should the tiny home appear?</p>
                  <div className="depth-options">
                    <button
                      className={`depth-btn ${placementPreferences.depth === 'foreground' ? 'selected' : ''}`}
                      onClick={() => setPlacementPreferences({...placementPreferences, depth: 'foreground'})}
                    >
                      <span className="depth-label">Foreground</span>
                      <span className="depth-description">Close, larger</span>
                    </button>
                    <button
                      className={`depth-btn ${placementPreferences.depth === 'midground' ? 'selected' : ''}`}
                      onClick={() => setPlacementPreferences({...placementPreferences, depth: 'midground'})}
                    >
                      <span className="depth-label">Midground</span>
                      <span className="depth-description">Balanced</span>
                    </button>
                    <button
                      className={`depth-btn ${placementPreferences.depth === 'background' ? 'selected' : ''}`}
                      onClick={() => setPlacementPreferences({...placementPreferences, depth: 'background'})}
                    >
                      <span className="depth-label">Background</span>
                      <span className="depth-description">Far, smaller</span>
                    </button>
                  </div>
                </div>

                <button
                  className="generate-button-large"
                  onClick={handleGenerate}
                  disabled={!clickPosition}
                >
                  Generate Visualization
                </button>
              </div>
            </div>
          </div>
        )}

        {currentStep === 'visualize' && uploadedImage && (
          <>
            <button className="back-button" onClick={handleBack}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to Upload
            </button>
            <Visualizer
              uploadedImage={uploadedImage}
              selectedTinyHome={selectedTinyHome}
              placementPreferences={placementPreferences}
            />
          </>
        )}
      </main>
    </div>
  )
}

export default VisualizerPage
