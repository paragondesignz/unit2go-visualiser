import { useState, useEffect } from 'react'
import { UploadedImage, TinyHomeModel, Position } from '../types'
import { processWithGemini, processWithWireframeGuide, addWatermarkToImage, conversationalEdit } from '../services/geminiService'
import { generateVisualization, getModelProvider } from '../services/imageGenerationService'

interface VisualizerProps {
  uploadedImage: UploadedImage
  selectedTinyHome: TinyHomeModel
  wireframeGuideImage?: string | null
  tinyHomePosition?: 'center' | 'left' | 'right'
}

function Visualizer({ uploadedImage, selectedTinyHome, wireframeGuideImage, tinyHomePosition = 'center' }: VisualizerProps) {
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
    "The AI intelligently scales and places your tiny home based on surrounding objects",
    "After generation, try Quick Enhancement buttons for instant additions like decks and landscaping",
    "Use conversational editing to customize any aspect of the scene with natural language",
    "Try different lighting and times of day to see your tiny home in various conditions",
    "Use the New Generation button to try different positions for your tiny home",
    "Use Undo/Redo to navigate through your editing history",
    "Download your image to share with family, friends, or planning consultants",
    "The visualization helps you make confident decisions about your tiny home placement"
  ]

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
          lightingPrompt,
          tinyHomePosition
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
          lightingPrompt,
          tinyHomePosition
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

  const handleTimeChange = async (newTime?: number) => {
    const timeToUse = newTime ?? timeOfDay

    setProcessing(true)
    setError(null)

    try {
      const combinedPrompt = getLightingPrompt(timeToUse) + getAccuracyPrompt()
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

  const handleNewGeneration = async () => {
    if (!resultImage) return

    setProcessing(true)
    setError(null)

    try {
      // Define different positioning variations following Gemini best practices
      const positionVariations = [
        'Reposition the tiny home to the left side of the frame (left third), creating more breathing room and environmental context on the right side. The tiny home should be clearly visible but allow more of the property setting to be showcased. Maintain the same photorealistic quality and lighting conditions.',
        'Reposition the tiny home to the right side of the frame (right third), creating more breathing room and environmental context on the left side. The tiny home should be clearly visible but allow more of the property setting to be showcased. Maintain the same photorealistic quality and lighting conditions.',
        'Reposition the tiny home toward the center of the frame as the dominant focal point, using center-weighted composition. The tiny home should be the main subject with balanced environmental context on both sides. Maintain the same photorealistic quality and lighting conditions.',
        'Reposition the tiny home slightly further back in the scene, creating more distance and showing additional foreground elements. This placement should reveal more of the property layout and spatial context while keeping the tiny home clearly visible. Maintain the same photorealistic quality and lighting conditions.',
        'Reposition the tiny home in the foreground, closer to the camera viewpoint, making it more prominent in the composition. This placement should emphasize the tiny home details while still showing environmental context. Maintain the same photorealistic quality and lighting conditions.',
        'Reposition the tiny home at a diagonal angle within the frame, creating a dynamic composition that shows both the front and side perspectives. This placement should provide visual interest through asymmetrical balance. Maintain the same photorealistic quality and lighting conditions.'
      ]

      // Select a random position variation
      const randomPosition = positionVariations[Math.floor(Math.random() * positionVariations.length)]

      const editedImage = await conversationalEdit(resultImage, randomPosition, {
        temperature: 0.7,
        topP: 0.9
      })

      addToHistory(editedImage)
      setShowingOriginal(false)
    } catch (err) {
      setError('Failed to generate new position. Please try again.')
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

  const handleQuickEdit = async (prompt: string) => {
    if (!resultImage) return

    setProcessing(true)
    setError(null)

    try {
      const editedImage = await conversationalEdit(resultImage, prompt)
      addToHistory(editedImage)
      setShowingOriginal(false)
    } catch (err) {
      setError('Failed to apply edit. Please try again.')
      console.error(err)
    } finally {
      setProcessing(false)
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
            Generated images are artistic representations for entertainment purposes only. Results may vary due to AI interpretation and may not be to exact scale. Not intended as a substitute for professional architectural or planning advice.
          </p>
        )}

        {/* Quick Action Buttons */}
        {resultImage && (
          <div className="quick-actions-section">
            <h3>Quick Enhancements</h3>
            <div className="quick-actions-grid">
              <button
                className="quick-action-button"
                onClick={() => handleQuickEdit('add a deck out the front of the tiny home unit')}
                disabled={processing}
              >
                Add Deck
              </button>
              <button
                className="quick-action-button"
                onClick={() => handleQuickEdit('add outdoor furniture')}
                disabled={processing}
              >
                Add Outdoor Furniture
              </button>
              <button
                className="quick-action-button"
                onClick={() => handleQuickEdit('add pot plants and shrubs')}
                disabled={processing}
              >
                Add Plants & Shrubs
              </button>
              <button
                className="quick-action-button"
                onClick={() => handleQuickEdit('add landscaping features')}
                disabled={processing}
              >
                Add Landscaping
              </button>
            </div>
          </div>
        )}

        {/* Conversational Editing - moved under preview */}
        {resultImage && (
          <div className="conversational-edit-section">
            <h3>Custom Editing</h3>
            <p className="control-info">
              Use natural language to make custom changes beyond the Quick Enhancements above. Describe any modification you'd like to see.
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
              <strong>Try these custom edits:</strong>
              <ul>
                <li>"make the sky more dramatic with clouds"</li>
                <li>"add a gravel driveway leading to the tiny home"</li>
                <li>"change the grass to native New Zealand plants"</li>
                <li>"add a pergola beside the tiny home"</li>
                <li>"add window boxes with flowers"</li>
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
              onClick={handleNewGeneration}
              disabled={processing || !resultImage}
            >
              New Generation
            </button>
            <p className="control-info">Generate the tiny home in a different position</p>

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
          <div className="time-button-grid">
            <button
              className={`time-button ${timeOfDay === 9 ? 'active' : ''}`}
              onClick={() => { setTimeOfDay(9); if (timeOfDay !== 9) handleTimeChange(9); }}
              disabled={processing}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
              <span>Morning</span>
            </button>
            <button
              className={`time-button ${timeOfDay === 13 ? 'active' : ''}`}
              onClick={() => { setTimeOfDay(13); if (timeOfDay !== 13) handleTimeChange(13); }}
              disabled={processing}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
              <span>Midday</span>
            </button>
            <button
              className={`time-button ${timeOfDay === 18 ? 'active' : ''}`}
              onClick={() => { setTimeOfDay(18); if (timeOfDay !== 18) handleTimeChange(18); }}
              disabled={processing}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
              <span>Golden Hour</span>
            </button>
            <button
              className={`time-button ${timeOfDay === 21 ? 'active' : ''}`}
              onClick={() => { setTimeOfDay(21); if (timeOfDay !== 21) handleTimeChange(21); }}
              disabled={processing}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
              <span>Night</span>
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
