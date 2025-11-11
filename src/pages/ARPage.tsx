import { useState } from 'react'
import ARVisualizer from '../components/ARVisualizer'
import { ARCaptureData } from '../types/ar'

function ARPage() {
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)

  const handleCapture = (data: ARCaptureData) => {
    console.log('AR capture data:', data)
    // Could save to backend here
  }

  const handleResult = (imageUrl: string) => {
    setResultImage(imageUrl)
    setShowResult(true)
  }

  const handleBack = () => {
    setShowResult(false)
    setResultImage(null)
  }

  const handleDownload = () => {
    if (!resultImage) return
    
    const link = document.createElement('a')
    link.href = resultImage
    link.download = `pool-visualization-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (showResult && resultImage) {
    return (
      <div style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        padding: '20px'
      }}>
        <div style={{
          maxWidth: '800px',
          width: '100%',
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <h1 style={{ marginBottom: '20px', textAlign: 'center' }}>
            Pool Visualization Result
          </h1>
          
          <img 
            src={resultImage} 
            alt="Pool visualization"
            style={{
              width: '100%',
              height: 'auto',
              borderRadius: '8px',
              marginBottom: '20px'
            }}
          />

          <div style={{
            display: 'flex',
            gap: '15px',
            justifyContent: 'center'
          }}>
            <button
              onClick={handleBack}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: '#666',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Back to AR
            </button>
            
            <button
              onClick={handleDownload}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: '#0066cc',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Download Image
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ARVisualizer 
        onCapture={handleCapture}
        onResult={handleResult}
      />
    </div>
  )
}

export default ARPage

