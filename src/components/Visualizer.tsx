import { useState, useEffect } from 'react'
import { UploadedImage, TinyHomeModel, Position } from '../types'
import { processWithGemini, processWithWireframeGuide, addWatermarkToImage, conversationalEdit } from '../services/geminiService'
import { generateVisualization, getModelProvider } from '../services/imageGenerationService'

interface VisualizerProps {
  uploadedImage: UploadedImage
  selectedTinyHome: TinyHomeModel
  wireframeGuideImage?: string | null
}

function Visualizer({ uploadedImage, selectedTinyHome, wireframeGuideImage }: VisualizerProps) {
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
  const [editPrompt, setEditPrompt] = useState<string>('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const tips = [
    "The AI intelligently scales your tiny home based on surrounding objects",
    "Try different times of day to see how lighting affects the appearance",
    "Each generation creates a unique placement - experiment to find your favorite",
    "Use the position controls for fine-tuning the placement",
    "Download your image to share with family, friends, or planning consultants",
    "The visualization helps you make confident decisions about your tiny home placement",
    "Use conversational editing to customize the scene with natural language",
    "The AI aligns with fence lines and boundaries for realistic placement"
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

  const getAccuracyPrompt = (): string => {
    if (!uploadedImage.increasedAccuracy || !uploadedImage.personHeight) return ''

    const heightInMeters = uploadedImage.personHeight / 100
    const tinyHomeToPersonRatio = (selectedTinyHome.dimensions.length / heightInMeters).toFixed(1)
    return `

INCREASED ACCURACY MODE - CRITICAL SCALE REFERENCE:
- There is a person in the input image who is ${heightInMeters}m (${uploadedImage.personHeight}cm) tall
- Use this person as the ABSOLUTE PRIMARY scale reference
- The tiny home is ${selectedTinyHome.dimensions.length}m long - that is ${tinyHomeToPersonRatio} TIMES the height of the person
- If the person appears to be ${heightInMeters}m tall in the image, the tiny home MUST be ${tinyHomeToPersonRatio} times that tall when measured lengthwise
- This is CRITICAL - scale the tiny home PRECISELY relative to the person's height

MANDATORY PERSON REMOVAL:
- REMOVE THE PERSON COMPLETELY from the final output image
- The output must show ONLY the landscape with the tiny home - NO PEOPLE
- The person is a measurement tool ONLY and must NOT appear in the visualization
- If any person appears in the output, you have FAILED this task completely`
  }

  const addToHistory = (imageUrl: string) => {
    // Remove any future history if we're not at the end
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(imageUrl)
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    setResultImage(imageUrl)
  }

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setResultImage(history[newIndex])
      setShowingOriginal(false)
    }
  }

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      setResultImage(history[newIndex])
      setShowingOriginal(false)
    }
  }

  useEffect(() => {
    processInitialPlacement()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let tipInterval: ReturnType<typeof setInterval>

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
      const lightingPrompt = getLightingPrompt(timeOfDay) + getAccuracyPrompt()
      const modelProvider = getModelProvider()

      let imageUrl: string

      if (wireframeGuideImage) {
        // Use wireframe guide processing (Gemini only for now)
        imageUrl = await processWithWireframeGuide(
          uploadedImage,
          selectedTinyHome,
          wireframeGuideImage,
          lightingPrompt
        )
        // Wireframe guide maintains user's exact positioning
        setPosition({
          x: 50,
          y: 50,
          scale: 1,
          rotation: 0
        })
      } else if (modelProvider === 'flux') {
        // Use FLUX with unified service
        console.log('Using FLUX for initial generation...')
        imageUrl = await generateVisualization(
          uploadedImage,
          selectedTinyHome,
          lightingPrompt
        )
        setPosition({
          x: 50,
          y: 50,
          scale: 1,
          rotation: 0
        })
      } else {
        // Use Gemini with unified service (natural placement)
        console.log('Using Gemini for initial generation...')
        imageUrl = await generateVisualization(
          uploadedImage,
          selectedTinyHome,
          lightingPrompt
        )
        setPosition({
          x: 50,
          y: 50,
          scale: 1,
          rotation: 0
        })
      }

      addToHistory(imageUrl)
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
      const combinedPrompt = getLightingPrompt(timeOfDay) + getAccuracyPrompt()
      const result = await processWithGemini(
        uploadedImage,
        selectedTinyHome,
        'adjust',
        'change lighting only - maintain current position',
        position,
        combinedPrompt,
        resultImage || undefined
      )
      addToHistory(result.imageUrl)
      setShowingOriginal(false)
    } catch (err) {
      setError('Failed to update lighting. Please try again.')
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }

  const handleDifferentPOV = async () => {
    if (!resultImage) return

    setProcessing(true)
    setError(null)

    try {
      // Randomize camera perspectives to ensure variety on each click
      const perspectives = [
        'from a lower camera angle looking slightly upward',
        'from a higher elevated viewpoint',
        'from a side angle showing more of the property width',
        'from further back to show more context',
        'from closer to emphasize architectural details',
        'from the opposite side of the property',
        'from a diagonal angle',
        'from ground level perspective'
      ]
      const randomPerspective = perspectives[Math.floor(Math.random() * perspectives.length)]

      const povPrompt = `Photograph this exact scene ${randomPerspective}. Keep the tiny home in the same position within the property. Only change the camera viewpoint - keep everything else unchanged.`
      const editedImage = await conversationalEdit(resultImage, povPrompt)
      addToHistory(editedImage)
      setShowingOriginal(false)
    } catch (err) {
      setError('Failed to generate different POV. Please try again.')
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }

  const handleToggleView = () => {
    setShowingOriginal(!showingOriginal)
  }

  const handleConversationalEdit = async () => {
    if (!editPrompt.trim() || !resultImage) return

    setProcessing(true)
    setError(null)

    try {
      const editedImage = await conversationalEdit(resultImage, editPrompt.trim())
      addToHistory(editedImage)
      setEditPrompt('')
      setShowingOriginal(false)
    } catch (err) {
      setError('Failed to apply edit. Please try again.')
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }

  const handleEditKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !processing && editPrompt.trim()) {
      handleConversationalEdit()
    }
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

  const openLightbox = () => {
    if (resultImage) {
      setIsLightboxOpen(true)
      setZoomLevel(1)
      setPanPosition({ x: 0, y: 0 })
    }
  }

  const closeLightbox = () => {
    setIsLightboxOpen(false)
    setZoomLevel(1)
    setPanPosition({ x: 0, y: 0 })
  }

  const handleLightboxDownload = async () => {
    await handleDownload()
  }

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.5, 4))
  }

  const handleZoomOut = () => {
    setZoomLevel(prev => {
      const newZoom = Math.max(prev - 0.5, 1)
      if (newZoom === 1) {
        setPanPosition({ x: 0, y: 0 })
      }
      return newZoom
    })
  }

  const handleZoomReset = () => {
    setZoomLevel(1)
    setPanPosition({ x: 0, y: 0 })
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setZoomLevel(prev => {
      const newZoom = Math.max(1, Math.min(prev + delta, 4))
      if (newZoom === 1) {
        setPanPosition({ x: 0, y: 0 })
      }
      return newZoom
    })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      setIsDragging(true)
      setDragStart({
        x: e.clientX - panPosition.x,
        y: e.clientY - panPosition.y
      })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoomLevel > 1) {
      setPanPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
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
              className="result-image clickable"
              onClick={openLightbox}
              style={{ cursor: 'pointer' }}
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

        {/* Conversational Editing - moved under preview */}
        {resultImage && (
          <div className="conversational-edit-section">
            <h3>Edit Your Visualization</h3>
            <p className="control-info">
              Make natural language edits to your image. Try: "make the sky more cloudy", "add some trees", "change the grass to gravel", etc.
            </p>
            <div className="edit-input-group">
              <input
                type="text"
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                onKeyPress={handleEditKeyPress}
                placeholder="Describe the changes you'd like to make..."
                className="edit-input"
                disabled={processing}
              />
              <button
                className="apply-button"
                onClick={handleConversationalEdit}
                disabled={processing || !editPrompt.trim()}
              >
                Apply Edit
              </button>
            </div>
            <div className="edit-examples">
              <strong>Example edits:</strong>
              <ul>
                <li>"make the sky more cloudy"</li>
                <li>"add some trees in the background"</li>
                <li>"change the grass to gravel or paving"</li>
                <li>"make the lighting warmer"</li>
                <li>"add a garden bed near the tiny home"</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="controls">
        <div className="control-panel">
          <h3>View Controls</h3>

          <div className="regenerate-section">
            <div className="history-controls">
              <button
                className="history-button"
                onClick={handleUndo}
                disabled={processing || historyIndex <= 0}
                title="Undo"
              >
                ↶ Undo
              </button>
              <button
                className="history-button"
                onClick={handleRedo}
                disabled={processing || historyIndex >= history.length - 1}
                title="Redo"
              >
                Redo ↷
              </button>
            </div>
            <p className="control-info">Step backward or forward through your edits</p>

            <button
              className="pov-button"
              onClick={handleDifferentPOV}
              disabled={processing || !resultImage}
            >
              Generate Different POV
            </button>
            <p className="control-info">Try a different camera angle and perspective</p>

            <button
              className="toggle-button"
              onClick={handleToggleView}
              disabled={processing || !resultImage}
            >
              {showingOriginal ? 'Show Tiny Home' : 'Show Original'}
            </button>
            <p className="control-info">Toggle between original and visualization</p>
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

      {/* Lightbox Modal */}
      {isLightboxOpen && resultImage && (
        <div className="lightbox-overlay" onClick={closeLightbox}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={closeLightbox} aria-label="Close">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="zoom-controls">
              <button
                className="zoom-button"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 4}
                aria-label="Zoom in"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                  <line x1="11" y1="8" x2="11" y2="14" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
              <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
              <button
                className="zoom-button"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 1}
                aria-label="Zoom out"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
              {zoomLevel > 1 && (
                <button
                  className="zoom-button zoom-reset"
                  onClick={handleZoomReset}
                  aria-label="Reset zoom"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                    <path d="M3 21v-5h5" />
                  </svg>
                </button>
              )}
            </div>

            <div
              className="lightbox-image-container"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{
                cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                overflow: 'hidden'
              }}
            >
              <img
                src={showingOriginal ? uploadedImage.url : resultImage}
                alt={showingOriginal ? "Original space" : "Tiny home visualization"}
                className="lightbox-image"
                style={{
                  transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)`,
                  transition: isDragging ? 'none' : 'transform 0.2s ease'
                }}
                draggable={false}
              />
            </div>

            <button className="lightbox-download" onClick={handleLightboxDownload}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Image
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Visualizer
