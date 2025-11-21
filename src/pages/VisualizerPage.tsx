import { useState } from 'react'
import ImageUpload from '../components/ImageUpload'
import Visualizer from '../components/Visualizer'
import InpaintingCanvas from '../components/InpaintingCanvas'
import { UploadedImage, VisualizationModel, isTinyHomeModel, ImageResolution } from '../types'
import { tinyHomeModels } from '../data/tinyHomeModels'
import { poolModels } from '../data/poolModels'

type ModelType = 'tiny-home' | 'pool'

function VisualizerPage() {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null)
  const [currentStep, setCurrentStep] = useState<'upload' | 'cleanup' | 'select' | 'visualize'>('upload')
  const [modelType, setModelType] = useState<ModelType>('tiny-home')
  const [selectedModel, setSelectedModel] = useState<VisualizationModel>(tinyHomeModels[0])
  const [maskDataUrl, setMaskDataUrl] = useState<string>('')
  const [isCleaning, setIsCleaning] = useState(false)
  const [selectedResolution, setSelectedResolution] = useState<ImageResolution>('2K')

  const handleImageUpload = async (image: UploadedImage) => {
    setUploadedImage(image)
    setCurrentStep('cleanup')
  }

  const handleCleanupComplete = async () => {
    if (!uploadedImage || !maskDataUrl) {
      setCurrentStep('select')
      return
    }

    setIsCleaning(true)
    try {
      const { removeObjectFromImage } = await import('../services/inpaintingService')
      const cleanedImageUrl = await removeObjectFromImage(uploadedImage.url, maskDataUrl)

      // Update the uploaded image with the cleaned version
      setUploadedImage({
        ...uploadedImage,
        url: cleanedImageUrl,
        preview: cleanedImageUrl,
        file: await (await fetch(cleanedImageUrl)).blob() as File // Convert back to file if needed, or just use URL
      })
      setMaskDataUrl('') // Reset mask
    } catch (error) {
      console.error('Cleanup failed:', error)
      alert('Failed to clean up image. Please try again.')
    } finally {
      setIsCleaning(false)
      setCurrentStep('select')
    }
  }

  const handleSkipCleanup = () => {
    setCurrentStep('select')
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
            <div className={`step ${currentStep === 'cleanup' ? 'active' : ''}`}>
              <span className="step-number">2</span>
              <span className="step-label">Clean Up</span>
            </div>
            <div className={`step ${currentStep === 'select' ? 'active' : ''}`}>
              <span className="step-number">3</span>
              <span className="step-label">Select Model</span>
            </div>
            <div className={`step ${currentStep === 'visualize' ? 'active' : ''}`}>
              <span className="step-number">4</span>
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

        {currentStep === 'cleanup' && uploadedImage && (
          <div className="cleanup-section" style={{ textAlign: 'center', padding: '2rem' }}>
            <h2>Magic Eraser</h2>
            <p>Highlight any objects you want to remove from the scene (e.g., trash cans, old sheds).</p>

            <div style={{ margin: '2rem auto', maxWidth: '800px' }}>
              {/* Dynamic import to avoid circular deps or load issues if component not ready */}
              {/* We will use a simple lazy load or just direct usage if imported at top */}
              <InpaintingCanvas
                imageUrl={uploadedImage.preview}
                onMaskGenerated={setMaskDataUrl}
                isProcessing={isCleaning}
              />
            </div>

            <div className="actions" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
              <button
                className="secondary-button"
                onClick={handleSkipCleanup}
                disabled={isCleaning}
                style={{ padding: '1rem 2rem', fontSize: '1.1rem', cursor: 'pointer' }}
              >
                Skip / Keep Original
              </button>
              <button
                className="primary-button"
                onClick={handleCleanupComplete}
                disabled={isCleaning || !maskDataUrl}
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1.1rem',
                  background: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: (isCleaning || !maskDataUrl) ? 'not-allowed' : 'pointer',
                  opacity: (isCleaning || !maskDataUrl) ? 0.7 : 1
                }}
              >
                {isCleaning ? 'Removing Object...' : 'Erase & Continue'}
              </button>
            </div>
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


                <div className="resolution-selection" style={{ marginTop: '2rem' }}>
                  <h3>Image Quality</h3>
                  <p className="resolution-instruction">Choose the image resolution for your visualization (powered by Nano Banana Pro)</p>
                  <div className="resolution-buttons" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                      className={`resolution-btn ${selectedResolution === '1K' ? 'active' : ''}`}
                      onClick={() => setSelectedResolution('1K')}
                      style={{
                        padding: '0.75rem 1.5rem',
                        borderRadius: '8px',
                        border: `2px solid ${selectedResolution === '1K' ? '#007bff' : '#ddd'}`,
                        background: selectedResolution === '1K' ? '#007bff' : 'white',
                        color: selectedResolution === '1K' ? 'white' : '#333',
                        cursor: 'pointer',
                        fontWeight: selectedResolution === '1K' ? '600' : '400',
                        minWidth: '120px'
                      }}
                    >
                      <div>1K Standard</div>
                      <div style={{ fontSize: '0.8em', opacity: 0.8 }}>Fast & Budget</div>
                    </button>
                    <button
                      className={`resolution-btn ${selectedResolution === '2K' ? 'active' : ''}`}
                      onClick={() => setSelectedResolution('2K')}
                      style={{
                        padding: '0.75rem 1.5rem',
                        borderRadius: '8px',
                        border: `2px solid ${selectedResolution === '2K' ? '#007bff' : '#ddd'}`,
                        background: selectedResolution === '2K' ? '#007bff' : 'white',
                        color: selectedResolution === '2K' ? 'white' : '#333',
                        cursor: 'pointer',
                        fontWeight: selectedResolution === '2K' ? '600' : '400',
                        minWidth: '120px'
                      }}
                    >
                      <div>2K Premium</div>
                      <div style={{ fontSize: '0.8em', opacity: 0.8 }}>Recommended</div>
                    </button>
                    <button
                      className={`resolution-btn ${selectedResolution === '4K' ? 'active' : ''}`}
                      onClick={() => setSelectedResolution('4K')}
                      style={{
                        padding: '0.75rem 1.5rem',
                        borderRadius: '8px',
                        border: `2px solid ${selectedResolution === '4K' ? '#007bff' : '#ddd'}`,
                        background: selectedResolution === '4K' ? '#007bff' : 'white',
                        color: selectedResolution === '4K' ? 'white' : '#333',
                        cursor: 'pointer',
                        fontWeight: selectedResolution === '4K' ? '600' : '400',
                        minWidth: '120px'
                      }}
                    >
                      <div>4K Ultra</div>
                      <div style={{ fontSize: '0.8em', opacity: 0.8 }}>Maximum Quality</div>
                    </button>
                  </div>
                </div>

                <button
                  className="generate-button-large"
                  onClick={() => setCurrentStep('visualize')}
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
              selectedResolution={selectedResolution}
            />
          </>
        )}
      </main>
    </div>
  )
}

export default VisualizerPage
