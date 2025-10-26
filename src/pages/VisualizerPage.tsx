import { useState } from 'react'
import ImageUpload from '../components/ImageUpload'
import TinyHomeDisplay from '../components/TinyHomeDisplay'
import Visualizer from '../components/Visualizer'
import { UploadedImage, TinyHomeModel, PlacementPreferences, HorizontalPosition, DepthPosition } from '../types'
import { tinyHomeModels } from '../data/tinyHomeModels'

function VisualizerPage() {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null)
  const [currentStep, setCurrentStep] = useState<'upload' | 'visualize'>('upload')
  const [selectedTinyHome, setSelectedTinyHome] = useState<TinyHomeModel>(tinyHomeModels[0])
  const [placementPreferences, setPlacementPreferences] = useState<PlacementPreferences>({
    horizontal: 'center',
    depth: 'midground'
  })

  const handleImageUpload = (image: UploadedImage) => {
    setUploadedImage(image)
    setCurrentStep('visualize')
  }

  const handleBack = () => {
    setCurrentStep('upload')
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
              <span className="step-label">Upload Image</span>
            </div>
            <div className={`step ${currentStep === 'visualize' ? 'active' : ''}`}>
              <span className="step-number">2</span>
              <span className="step-label">Visualize</span>
            </div>
          </div>
        </div>
      </header>

      <main className="page-content">
        {currentStep === 'upload' && (
          <div className="upload-section">
            <div className="model-selection-container">
              <h2>Choose Your Tiny Home Model</h2>
              <div className="model-cards">
                {tinyHomeModels.map((model) => (
                  <div
                    key={model.id}
                    className={`model-card ${selectedTinyHome.id === model.id ? 'selected' : ''}`}
                    onClick={() => setSelectedTinyHome(model)}
                  >
                    <img src={model.imageUrl} alt={model.name} className="model-preview" />
                    <h3>{model.name}</h3>
                    <p className="model-dimensions">
                      {model.dimensions.length}m × {model.dimensions.width}m × {model.dimensions.height}m
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="placement-preferences-container">
              <h2>Choose Placement</h2>
              <p className="placement-subtitle">Where would you like the tiny home positioned?</p>

              <div className="preference-group">
                <h3>Horizontal Position</h3>
                <div className="preference-options">
                  <label className={`preference-option ${placementPreferences.horizontal === 'left' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="horizontal"
                      value="left"
                      checked={placementPreferences.horizontal === 'left'}
                      onChange={(e) => setPlacementPreferences({...placementPreferences, horizontal: e.target.value as HorizontalPosition})}
                    />
                    <span className="option-label">Left Side</span>
                    <span className="option-description">Position on the left of the scene</span>
                  </label>

                  <label className={`preference-option ${placementPreferences.horizontal === 'center' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="horizontal"
                      value="center"
                      checked={placementPreferences.horizontal === 'center'}
                      onChange={(e) => setPlacementPreferences({...placementPreferences, horizontal: e.target.value as HorizontalPosition})}
                    />
                    <span className="option-label">Center</span>
                    <span className="option-description">Position in the center of the scene</span>
                  </label>

                  <label className={`preference-option ${placementPreferences.horizontal === 'right' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="horizontal"
                      value="right"
                      checked={placementPreferences.horizontal === 'right'}
                      onChange={(e) => setPlacementPreferences({...placementPreferences, horizontal: e.target.value as HorizontalPosition})}
                    />
                    <span className="option-label">Right Side</span>
                    <span className="option-description">Position on the right of the scene</span>
                  </label>
                </div>
              </div>

              <div className="preference-group">
                <h3>Depth Position</h3>
                <div className="preference-options">
                  <label className={`preference-option ${placementPreferences.depth === 'foreground' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="depth"
                      value="foreground"
                      checked={placementPreferences.depth === 'foreground'}
                      onChange={(e) => setPlacementPreferences({...placementPreferences, depth: e.target.value as DepthPosition})}
                    />
                    <span className="option-label">Foreground</span>
                    <span className="option-description">Close to camera, larger appearance</span>
                  </label>

                  <label className={`preference-option ${placementPreferences.depth === 'midground' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="depth"
                      value="midground"
                      checked={placementPreferences.depth === 'midground'}
                      onChange={(e) => setPlacementPreferences({...placementPreferences, depth: e.target.value as DepthPosition})}
                    />
                    <span className="option-label">Midground</span>
                    <span className="option-description">Medium distance, balanced view</span>
                  </label>

                  <label className={`preference-option ${placementPreferences.depth === 'background' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="depth"
                      value="background"
                      checked={placementPreferences.depth === 'background'}
                      onChange={(e) => setPlacementPreferences({...placementPreferences, depth: e.target.value as DepthPosition})}
                    />
                    <span className="option-label">Background</span>
                    <span className="option-description">Further away, smaller appearance</span>
                  </label>
                </div>
              </div>
            </div>

            <TinyHomeDisplay tinyHome={selectedTinyHome} />
            <ImageUpload onImageUpload={handleImageUpload} />
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
