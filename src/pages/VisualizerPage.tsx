import { useState } from 'react'
import ImageUpload from '../components/ImageUpload'
import TinyHomeDisplay from '../components/TinyHomeDisplay'
import Visualizer from '../components/Visualizer'
import { UploadedImage, TinyHomeModel } from '../types'
import { tinyHomeModels } from '../data/tinyHomeModels'

function VisualizerPage() {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null)
  const [currentStep, setCurrentStep] = useState<'upload' | 'visualize'>('upload')
  const [selectedTinyHome, setSelectedTinyHome] = useState<TinyHomeModel>(tinyHomeModels[0])

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
            />
          </>
        )}
      </main>
    </div>
  )
}

export default VisualizerPage
