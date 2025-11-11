import { useState } from 'react'
import ImageUpload from '../components/ImageUpload'
import Visualizer from '../components/Visualizer'
import { UploadedImage, VisualizationModel, isTinyHomeModel, isPoolModel } from '../types'
import { tinyHomeModels } from '../data/tinyHomeModels'
import { poolModels } from '../data/poolModels'

type ModelType = 'tiny-home' | 'pool'

function VisualizerPage() {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null)
  const [currentStep, setCurrentStep] = useState<'upload' | 'select' | 'visualize'>('upload')
  const [modelType, setModelType] = useState<ModelType>('tiny-home')
  const [selectedModel, setSelectedModel] = useState<VisualizationModel>(tinyHomeModels[0])
  const [modelPosition, setModelPosition] = useState<'center' | 'left' | 'right'>('center')

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

  const handleModelTypeChange = (type: ModelType) => {
    setModelType(type)
    if (type === 'tiny-home') {
      setSelectedModel(tinyHomeModels[0])
    } else {
      setSelectedModel(poolModels[0])
    }
  }

  const currentModels = modelType === 'tiny-home' ? tinyHomeModels : poolModels
  const modelTypeLabel = modelType === 'tiny-home' ? 'Tiny Home' : 'Pool'
  const modelTypeLabelPlural = modelType === 'tiny-home' ? 'Tiny Homes' : 'Pools'

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
                <h2>Choose Your {modelTypeLabel}</h2>
                
                {/* Model Type Selector */}
                <div className="model-type-selector" style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button
                    className={`model-type-btn ${modelType === 'tiny-home' ? 'active' : ''}`}
                    onClick={() => handleModelTypeChange('tiny-home')}
                    style={{
                      padding: '0.75rem 1.5rem',
                      borderRadius: '8px',
                      border: `2px solid ${modelType === 'tiny-home' ? '#007bff' : '#ddd'}`,
                      background: modelType === 'tiny-home' ? '#007bff' : 'white',
                      color: modelType === 'tiny-home' ? 'white' : '#333',
                      cursor: 'pointer',
                      fontWeight: modelType === 'tiny-home' ? '600' : '400'
                    }}
                  >
                    Tiny Homes
                  </button>
                  <button
                    className={`model-type-btn ${modelType === 'pool' ? 'active' : ''}`}
                    onClick={() => handleModelTypeChange('pool')}
                    style={{
                      padding: '0.75rem 1.5rem',
                      borderRadius: '8px',
                      border: `2px solid ${modelType === 'pool' ? '#007bff' : '#ddd'}`,
                      background: modelType === 'pool' ? '#007bff' : 'white',
                      color: modelType === 'pool' ? 'white' : '#333',
                      cursor: 'pointer',
                      fontWeight: modelType === 'pool' ? '600' : '400'
                    }}
                  >
                    Pools
                  </button>
                </div>

                <p className="select-instruction">
                  {modelType === 'tiny-home' 
                    ? 'Our AI will automatically place your selected tiny home in a natural position. After generation, you can customize it with Quick Enhancements and natural language editing.'
                    : 'Our AI will convert the pool diagram into a photorealistic swimming pool and place it naturally in your property. After generation, you can customize it with Quick Enhancements and natural language editing.'}
                </p>
                <div className="model-cards-grid">
                  {currentModels.map((model) => (
                    <div
                      key={model.id}
                      className={`model-card-full ${selectedModel.id === model.id ? 'selected' : ''}`}
                      onClick={() => setSelectedModel(model)}
                    >
                      <img src={model.imageUrl} alt={model.name} className="model-preview-full" />
                      <div className="model-info-full">
                        <h4>{model.name}</h4>
                        <p>
                          {isTinyHomeModel(model) 
                            ? `${model.dimensions.length}m × ${model.dimensions.width}m`
                            : `${model.dimensions.length}m × ${model.dimensions.width}m × ${model.dimensions.depth}m deep`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="position-selection">
                  <h3>{modelTypeLabel} Position</h3>
                  <p className="position-instruction">Choose where the {modelTypeLabel.toLowerCase()} should be positioned in the frame</p>
                  <div className="position-buttons">
                    <button
                      className={`position-btn ${modelPosition === 'left' ? 'active' : ''}`}
                      onClick={() => setModelPosition('left')}
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
                      className={`position-btn ${modelPosition === 'center' ? 'active' : ''}`}
                      onClick={() => setModelPosition('center')}
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
                      className={`position-btn ${modelPosition === 'right' ? 'active' : ''}`}
                      onClick={() => setModelPosition('right')}
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
              selectedModel={selectedModel}
              modelPosition={modelPosition}
            />
          </>
        )}
      </main>
    </div>
  )
}

export default VisualizerPage
