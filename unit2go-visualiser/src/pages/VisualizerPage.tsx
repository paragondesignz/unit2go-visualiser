import { useState } from 'react'
import ImageUpload from '../components/ImageUpload'
import TinyHomeDisplay from '../components/TinyHomeDisplay'
import Visualizer from '../components/Visualizer'
import ManualPositioner from '../components/ManualPositioner'
import { UploadedImage, TinyHomeModel } from '../types'
import { tinyHomeModels } from '../data/tinyHomeModels'

function VisualizerPage() {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null)
  const [currentStep, setCurrentStep] = useState<'upload' | 'choose-mode' | 'manual-position' | 'visualize'>('upload')
  const [wireframeImage, setWireframeImage] = useState<string | null>(null)

  // Since we only have one model, automatically select it
  const selectedTinyHome: TinyHomeModel = tinyHomeModels[0]

  const handleImageUpload = (image: UploadedImage) => {
    setUploadedImage(image)
    setCurrentStep('choose-mode')
  }

  const handleAutoPlace = () => {
    setWireframeImage(null)
    setCurrentStep('visualize')
  }

  const handleManualPosition = () => {
    setCurrentStep('manual-position')
  }

  const handleWireframeGenerate = (compositeImageDataUrl: string) => {
    setWireframeImage(compositeImageDataUrl)
    setCurrentStep('visualize')
  }

  const handleCancelManualPosition = () => {
    setCurrentStep('choose-mode')
  }

  const handleBack = () => {
    setWireframeImage(null)
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
            <TinyHomeDisplay tinyHome={selectedTinyHome} />
            <ImageUpload onImageUpload={handleImageUpload} />
          </div>
        )}

        {currentStep === 'choose-mode' && uploadedImage && (
          <div className="mode-selection">
            <button className="back-button" onClick={handleBack}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to Upload
            </button>
            <div className="mode-selection-content">
              <h2>Choose Placement Method</h2>
              <p>How would you like to position the tiny home in your space?</p>
              <div className="mode-options">
                <div className="mode-option">
                  <h3>Auto Place</h3>
                  <p>Let AI automatically position and align the tiny home based on your property features</p>
                  <button className="mode-select-button" onClick={handleAutoPlace}>
                    Auto Place (Recommended)
                  </button>
                </div>
                <div className="mode-option">
                  <h3>Manual Position</h3>
                  <p>Use 3D controls to manually position, rotate, and scale the tiny home exactly where you want it</p>
                  <button className="mode-select-button" onClick={handleManualPosition}>
                    Manual Position
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 'manual-position' && uploadedImage && (
          <ManualPositioner
            uploadedImage={uploadedImage}
            tinyHomeModel={selectedTinyHome}
            onGenerate={handleWireframeGenerate}
            onCancel={handleCancelManualPosition}
          />
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
              wireframeGuideImage={wireframeImage}
            />
          </>
        )}
      </main>
    </div>
  )
}

export default VisualizerPage
