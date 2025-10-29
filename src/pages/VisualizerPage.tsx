import { useState } from 'react'
import ImageUpload from '../components/ImageUpload'
import Visualizer from '../components/Visualizer'
import { UploadedImage, TinyHomeModel } from '../types'
import { tinyHomeModels } from '../data/tinyHomeModels'

function VisualizerPage() {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null)
  const [currentStep, setCurrentStep] = useState<'upload' | 'select' | 'visualize'>('upload')
  const [selectedTinyHome, setSelectedTinyHome] = useState<TinyHomeModel>(tinyHomeModels[0])

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

            <div className="select-content">
              <div className="select-left">
                <h2>Your Property Photo</h2>
                <p className="select-instruction">AI will automatically place the tiny home in the best natural position on your property.</p>
                <div className="select-image-container">
                  <img src={uploadedImage.url} alt="Your property" className="select-image" />
                </div>
              </div>

              <div className="select-right">
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
            />
          </>
        )}
      </main>
    </div>
  )
}

export default VisualizerPage
