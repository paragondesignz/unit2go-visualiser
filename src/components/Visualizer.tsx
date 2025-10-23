import { useState, useEffect } from 'react'
import { UploadedImage, TinyHomeModel, Position } from '../types'
import { processWithGemini, addWatermarkToImage } from '../services/geminiService'

interface VisualizerProps {
  uploadedImage: UploadedImage
  selectedTinyHome: TinyHomeModel
}

function Visualizer({ uploadedImage, selectedTinyHome }: VisualizerProps) {
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState<Position>({
    x: 50,
    y: 50,
    scale: 1,
    rotation: 0
  })
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [showingOriginal, setShowingOriginal] = useState(false)
  const [timeOfDay, setTimeOfDay] = useState(12)
  const [tipIndex, setTipIndex] = useState(0)

  const tips = [
    "The AI intelligently scales your tiny home based on surrounding objects",
    "Try different times of day to see how lighting affects the appearance",
    "Each generation creates a unique placement - experiment to find your favorite",
    "Use the position controls for fine-tuning the placement",
    "Download your image to share with family, friends, or planning consultants",
    "The visualization helps you make confident decisions about your tiny home placement"
  ]

  const getTimeDescription = (hour: number): string => {
    if (hour >= 7 && hour < 8) return 'sunrise'
    if (hour >= 8 && hour < 11) return 'morning'
    if (hour >= 11 && hour < 15) return 'midday'
    if (hour >= 15 && hour < 18) return 'afternoon'
    if (hour >= 18 && hour < 19) return 'golden hour'
    if (hour >= 19 && hour < 21) return 'sunset'
    if (hour >= 21 && hour <= 22) return 'night'
    return 'daylight'
  }

  const formatTime12Hour = (hour: number): string => {
    if (hour === 0) return '12:00 AM'
    if (hour < 12) return `${hour}:00 AM`
    if (hour === 12) return '12:00 PM'
    return `${hour - 12}:00 PM`
  }

  const getLightingPrompt = (hour: number): string => {
    if (hour >= 7 && hour < 8) return 'NEW ZEALAND SUNRISE LIGHTING: Apply subtle and realistic New Zealand sunrise lighting with gentle warm tones. The sun is low on the horizon creating moderate shadows. The sky shows soft oranges and pinks. Keep lighting natural and understated - avoid oversaturation. Surfaces have warm but realistic illumination'

    if (hour >= 8 && hour < 11) return 'NEW ZEALAND MORNING LIGHTING: Apply clear, natural New Zealand morning sunlight with realistic intensity. Create well-defined but natural shadows and a blue sky. The lighting should feel fresh and natural with good visibility - avoid oversaturation'

    if (hour >= 11 && hour < 15) return 'NEW ZEALAND MIDDAY LIGHTING: Apply natural New Zealand midday sun from overhead with realistic intensity. Create short shadows directly under objects with clear but natural illumination. Keep lighting realistic and natural. The sky should be blue and colors should appear natural'

    if (hour >= 15 && hour < 18) return 'NEW ZEALAND AFTERNOON LIGHTING: Apply warm, natural New Zealand afternoon sunlight with moderately long shadows. Gentle warm tones appear on surfaces with comfortable natural lighting. Keep effects subtle and realistic - avoid oversaturation'

    if (hour >= 18 && hour < 19) return 'NEW ZEALAND GOLDEN HOUR: Apply New Zealand natural golden hour lighting with subtle warm tones. Create gentle side-lighting and longer shadows with soft reflections. Keep the golden effect natural and understated - avoid oversaturation'

    if (hour >= 19 && hour < 21) return 'NEW ZEALAND SUNSET LIGHTING: Apply realistic New Zealand sunset lighting with natural oranges, soft pinks, and gentle purples in the sky. Keep colors natural and avoid oversaturation. The setting sun casts warm tones across surfaces with natural shadows'

    if (hour >= 21 && hour <= 22) return 'NEW ZEALAND NIGHT LIGHTING: Apply realistic New Zealand nighttime conditions with a naturally dark sky (deep blue or black with visible stars where appropriate). No daylight should be visible. Add natural outdoor lighting - warm deck lights, landscape path lights, and house lighting typical of New Zealand homes'

    return 'NEW ZEALAND DAYLIGHT: Apply natural New Zealand daylight with realistic intensity and natural color temperature. Keep lighting effects subtle and natural'
  }

  useEffect(() => {
    processInitialPlacement()
  }, [])

  useEffect(() => {
    let tipInterval: number

    if (processing) {
      tipInterval = setInterval(() => {
        setTipIndex((prevIndex) => (prevIndex + 1) % tips.length)
      }, 5000)
    }

    return () => {
      if (tipInterval) {
        clearInterval(tipInterval)
      }
    }
  }, [processing, tips.length])

  const processInitialPlacement = async () => {
    setProcessing(true)
    setError(null)

    try {
      const result = await processWithGemini(
        uploadedImage,
        selectedTinyHome,
        'initial',
        undefined,
        undefined,
        getLightingPrompt(timeOfDay)
      )
      setPosition(result.position)
      setResultImage(result.imageUrl)
      setShowingOriginal(false)
    } catch (err) {
      setError('Failed to process image. Please try again.')
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }

  const handleTimeChange = async () => {
    setProcessing(true)
    setError(null)

    try {
      const result = await processWithGemini(
        uploadedImage,
        selectedTinyHome,
        'adjust',
        'change lighting only - maintain current position',
        position,
        getLightingPrompt(timeOfDay),
        resultImage || undefined
      )
      setResultImage(result.imageUrl)
      setShowingOriginal(false)
    } catch (err) {
      setError('Failed to update lighting. Please try again.')
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }

  const handleQuickCommand = async (command: string) => {
    setProcessing(true)
    setError(null)

    try {
      const result = await processWithGemini(
        uploadedImage,
        selectedTinyHome,
        'adjust',
        command,
        position,
        getLightingPrompt(timeOfDay)
      )
      setPosition(result.position)
      setResultImage(result.imageUrl)
      setShowingOriginal(false)
    } catch (err) {
      setError('Failed to adjust position. Please try again.')
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }

  const handleRegenerate = async () => {
    setProcessing(true)
    setError(null)

    try {
      const result = await processWithGemini(
        uploadedImage,
        selectedTinyHome,
        'initial',
        undefined,
        undefined,
        getLightingPrompt(timeOfDay)
      )
      setPosition(result.position)
      setResultImage(result.imageUrl)
      setShowingOriginal(false)
    } catch (err) {
      setError('Failed to regenerate image. Please try again.')
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }

  const handleToggleView = () => {
    setShowingOriginal(!showingOriginal)
  }

  const handleDownload = async () => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

    if (isMobile) {
      alert('To save your image: Long-press the image above and select "Save to Photos" or "Download Image"')
      return
    }

    try {
      const imageToDownload = (resultImage && !showingOriginal) ? resultImage : uploadedImage.url

      const watermarkedImage = await addWatermarkToImage(imageToDownload)

      const link = document.createElement('a')
      link.href = watermarkedImage
      const filename = showingOriginal ? `original-space-${Date.now()}.jpg` : `unit2go-visualization-${Date.now()}.jpg`
      link.download = filename
      link.click()
    } catch (error) {
      console.error('Download failed:', error)
      alert('Unable to download image. Please right-click the image and save it manually.')
    }
  }

  return (
    <div className="visualizer">
      <div className="visualization-wrapper">
        <div className="visualization-container">
          {processing && (
            <div className="processing-overlay">
              <div className="spinner"></div>
              <p className="processing-text">Processing your image...</p>
              <p className="processing-tip">{tips[tipIndex]}</p>
            </div>
          )}

          {resultImage ? (
            <img
              src={showingOriginal ? uploadedImage.url : resultImage}
              alt={showingOriginal ? "Original space" : "Tiny home visualization"}
              className="result-image"
            />
          ) : (
            <img
              src={uploadedImage.url}
              alt="Original"
              className="result-image"
            />
          )}

          {error && (
            <div className="error-overlay">
              <p>{error}</p>
              <button onClick={processInitialPlacement}>Retry</button>
            </div>
          )}
        </div>

        {resultImage && (
          <p className="image-disclaimer">
            Generated images are artistic representations and may not be to exact scale
          </p>
        )}
      </div>

      <div className="controls">
        <div className="control-panel">
          <h3>Placement Controls</h3>

          <div className="regenerate-section">
            <button
              className="regenerate-button"
              onClick={handleRegenerate}
              disabled={processing}
            >
              Generate New Placement
            </button>
            <p className="control-info">Try a different AI placement for your tiny home</p>

            <button
              className="toggle-button"
              onClick={handleToggleView}
              disabled={processing || !resultImage}
            >
              {showingOriginal ? 'Show Tiny Home' : 'Show Original'}
            </button>
            <p className="control-info">Toggle between original and visualization</p>
          </div>

          <div className="position-controls">
            <button
              onClick={() => handleQuickCommand('move left')}
              disabled={processing}
              className="position-btn"
            >
              Move Left
            </button>
            <button
              onClick={() => handleQuickCommand('move right')}
              disabled={processing}
              className="position-btn"
            >
              Move Right
            </button>
            <button
              onClick={() => handleQuickCommand('move up')}
              disabled={processing}
              className="position-btn"
            >
              Move Back
            </button>
            <button
              onClick={() => handleQuickCommand('move down')}
              disabled={processing}
              className="position-btn"
            >
              Move Forward
            </button>
          </div>
        </div>

        <div className="control-panel">
          <h3>Lighting & Time of Day</h3>
          <div className="time-control">
            <div className="time-display">
              <span className="time-value">{formatTime12Hour(timeOfDay)}</span>
              <span className="time-description">{getTimeDescription(timeOfDay)}</span>
            </div>
            <input
              type="range"
              min="7"
              max="22"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(parseInt(e.target.value))}
              className="time-slider"
              disabled={processing}
            />
            <button
              className="apply-button"
              onClick={handleTimeChange}
              disabled={processing}
            >
              Apply Lighting
            </button>
          </div>
        </div>

        <div className="control-panel">
          <h3>Your Tiny Home</h3>
          <div className="tiny-home-info">
            <h4>{selectedTinyHome.name}</h4>
            <p className="info-row">
              <span className="info-label">Dimensions:</span>
              <span>{selectedTinyHome.dimensions.length}m × {selectedTinyHome.dimensions.width}m</span>
            </p>
            <p className="info-row">
              <span className="info-label">Height:</span>
              <span>{selectedTinyHome.dimensions.height}m</span>
            </p>
            <p className="info-row">
              <span className="info-label">Price:</span>
              <span className="price">${selectedTinyHome.price.toLocaleString()}</span>
            </p>
            {selectedTinyHome.productUrl && (
              <a
                href={selectedTinyHome.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="product-link-button"
              >
                Learn More
              </a>
            )}
          </div>

          <button
            className="download-button"
            onClick={handleDownload}
            disabled={!resultImage}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Image
          </button>
        </div>
      </div>
    </div>
  )
}

export default Visualizer
