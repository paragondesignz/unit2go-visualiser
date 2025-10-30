import { useState } from 'react'
import ImageUpload from '../components/ImageUpload'
import Visualizer from '../components/Visualizer'
import { UploadedImage, TinyHomeModel } from '../types'
import { tinyHomeModels } from '../data/tinyHomeModels'

function VisualizerPage() {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null)
  const [currentStep, setCurrentStep] = useState<'upload' | 'select' | 'visualize'>('upload')
  const [selectedTinyHome, setSelectedTinyHome] = useState<TinyHomeModel>(tinyHomeModels[0])
  const [tinyHomePosition, setTinyHomePosition] = useState<'center' | 'left' | 'right'>('center')

  const handleImageUpload = (image: UploadedImage) => {
    setUploadedImage(image)
    setCurrentStep('select')
  }

  const handleGenerate = () => {
    setCurrentStep('visualize')
  }

  const handleBack = () => {
    if (currentStep === 'select') {
      setUploadedImage(null)
      setCurrentStep('upload')
    } else {
      setCurrentStep('select')
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
            <div className={`step ${currentStep === 'select' ? 'active' : ''}`}>
              <span className="step-number">2</span>
              <span className="step-label">Select Model</span>
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

        {currentStep === 'select' && uploadedImage && (
          <div className="select-section">
            <button className="back-button" onClick={handleBack}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to Upload
            </button>

            <div className="select-content-centered">
              <div className="model-selection-full">
                <h2>Choose Your Tiny Home</h2>
                <p className="select-instruction">Our AI will automatically place your selected tiny home in a natural position. After generation, you can customize it with Quick Enhancements and natural language editing.</p>
                <div className="model-cards-grid">
                  {tinyHomeModels.map((model) => (
                    <div
                      key={model.id}
                      className={`model-card-full ${selectedTinyHome.id === model.id ? 'selected' : ''}`}
                      onClick={() => setSelectedTinyHome(model)}
                    >
                      <img src={model.imageUrl} alt={model.name} className="model-preview-full" />
                      <div className="model-info-full">
                        <h4>{model.name}</h4>
                        <p>{model.dimensions.length}m × {model.dimensions.width}m</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="position-selection">
                  <h3>Tiny Home Position</h3>
                  <p className="position-instruction">Choose where the tiny home should be positioned in the frame</p>
                  <div className="position-buttons">
                    <button
                      className={`position-btn ${tinyHomePosition === 'left' ? 'active' : ''}`}
                      onClick={() => setTinyHomePosition('left')}
                    >
                      <svg width="40" height="30" viewBox="0 0 40 30" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="5" width="14" height="20" rx="2" />
                        <line x1="20" y1="8" x2="38" y2="8" strokeDasharray="2 2" opacity="0.4" />
                        <line x1="20" y1="15" x2="38" y2="15" strokeDasharray="2 2" opacity="0.4" />
                        <line x1="20" y1="22" x2="38" y2="22" strokeDasharray="2 2" opacity="0.4" />
                      </svg>
                      <span>Left</span>
                    </button>
                    <button
                      className={`position-btn ${tinyHomePosition === 'center' ? 'active' : ''}`}
                      onClick={() => setTinyHomePosition('center')}
                    >
                      <svg width="40" height="30" viewBox="0 0 40 30" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="13" y="5" width="14" height="20" rx="2" />
                        <line x1="2" y1="8" x2="10" y2="8" strokeDasharray="2 2" opacity="0.4" />
                        <line x1="30" y1="8" x2="38" y2="8" strokeDasharray="2 2" opacity="0.4" />
                        <line x1="2" y1="15" x2="10" y2="15" strokeDasharray="2 2" opacity="0.4" />
                        <line x1="30" y1="15" x2="38" y2="15" strokeDasharray="2 2" opacity="0.4" />
                      </svg>
                      <span>Center</span>
                    </button>
                    <button
                      className={`position-btn ${tinyHomePosition === 'right' ? 'active' : ''}`}
                      onClick={() => setTinyHomePosition('right')}
                    >
                      <svg width="40" height="30" viewBox="0 0 40 30" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="24" y="5" width="14" height="20" rx="2" />
                        <line x1="2" y1="8" x2="20" y2="8" strokeDasharray="2 2" opacity="0.4" />
                        <line x1="2" y1="15" x2="20" y2="15" strokeDasharray="2 2" opacity="0.4" />
                        <line x1="2" y1="22" x2="20" y2="22" strokeDasharray="2 2" opacity="0.4" />
                      </svg>
                      <span>Right</span>
                    </button>
                  </div>
                </div>

                <button
                  className="generate-button-large"
                  onClick={handleGenerate}
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
              tinyHomePosition={tinyHomePosition}
            />
          </>
        )}
      </main>
    </div>
  )
}

export default VisualizerPage
