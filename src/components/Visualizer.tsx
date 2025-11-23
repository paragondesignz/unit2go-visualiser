import { useState, useEffect } from 'react'
import { UploadedImage, VisualizationModel, Position, isTinyHomeModel, isPoolModel, ImageResolution } from '../types'
import { processWithGemini, addWatermarkToImage, conversationalEdit } from '../services/geminiService'
import { generateVisualization } from '../services/imageGenerationService'

interface VisualizerProps {
  uploadedImage: UploadedImage
  selectedModel: VisualizationModel
  selectedResolution?: ImageResolution
}

function Visualizer({ uploadedImage, selectedModel, selectedResolution = '2K' }: VisualizerProps) {
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState<Position>({
    x: 50,
    y: 50,
    scale: 1,
    rotation: 0
  })
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null)
  const [currentModelSettings, setCurrentModelSettings] = useState<any>(null)
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
  const [showPromptPanel, setShowPromptPanel] = useState(false)

  const tips = [
    isPoolModel(selectedModel)
      ? "The AI intelligently converts the pool diagram into a photorealistic pool and scales it based on surrounding objects"
      : "The AI intelligently scales and places your tiny home based on surrounding objects",
    "After generation, try Quick Enhancement buttons for instant product-appropriate additions",
    "Use conversational editing to customize any aspect of the scene with natural language",
    isPoolModel(selectedModel)
      ? "Try different lighting and times of day to see your pool in various conditions"
      : "Try different lighting and times of day to see your tiny home in various conditions",
    isPoolModel(selectedModel)
      ? "Use the left/center/right position buttons to reposition your pool in the frame"
      : "Use the left/center/right position buttons to reposition your tiny home in the frame",
    "Use Undo/Redo to navigate through your editing history",
    "Download your image to share with family, friends, or planning consultants",
    isPoolModel(selectedModel)
      ? "The visualization helps you make confident decisions about your pool placement"
      : "The visualization helps you make confident decisions about your tiny home placement",
    `Powered by Google's Nano Banana Pro (Gemini 3) for ${selectedResolution} quality generation`
  ]

  // Enhanced Nano Banana Pro options for 100% accuracy and lighting preservation
  const nanoBananaOptions = {
    imageSize: selectedResolution,
    enableGoogleSearch: true, // Enable real-time grounding for factual accuracy
    useThinkingProcess: true,
    temperature: 1.0, // Google's 2025 recommendation for Gemini 3 Pro reasoning
    topP: 0.95, // Optimal balance for complex architectural scene analysis

    // Enhanced accuracy features for 100% product fidelity
    accuracyMode: 'maximum' as const, // Use 'maximum' accuracy by default for best results
    enableGeometricVerification: true, // Enable step-by-step verification
    useMultiReferenceAccuracy: true, // Prepare for future multi-reference support

    // Lighting preservation settings (preserve user's lighting on first generation)
    preserveOriginalLighting: !resultImage, // Preserve original lighting on first generation
    lightingPreservationMode: 'adaptive' as const // Adaptive preservation mode
  }

  const getLightingPrompt = (hour: number): string => {
    if (hour >= 7 && hour < 8) return 'Sunrise in New Zealand with the sun low on the horizon. Gentle warm tones with soft oranges and pinks in the sky. Moderate shadows. Natural, understated lighting'

    if (hour >= 8 && hour < 11) return 'New Zealand morning sunlight. Clear, fresh lighting with well-defined natural shadows and blue sky. Good visibility'

    if (hour >= 11 && hour < 15) return 'New Zealand midday sun from overhead. Short shadows directly under objects. Blue sky with natural illumination'

    if (hour >= 15 && hour < 18) return 'New Zealand afternoon sunlight with warm tones. Moderately long shadows. Comfortable natural lighting'

    if (hour >= 18 && hour < 19) return 'New Zealand golden hour with subtle warm light. Gentle side-lighting creating longer shadows. Natural golden effect'

    if (hour >= 19 && hour < 21) return 'New Zealand sunset with natural oranges, soft pinks, and gentle purples in the sky. The setting sun casts warm tones with natural shadows'

    if (hour >= 21 && hour <= 22) return 'New Zealand nighttime with dark sky (deep blue or black with stars). Natural outdoor lighting from warm deck lights, landscape path lights, and house lighting'

    return 'Natural New Zealand daylight with realistic intensity and color temperature'
  }

  const getAccuracyPrompt = (): string => {
    if (!uploadedImage.increasedAccuracy || !uploadedImage.personHeight) return ''

    const heightInMeters = uploadedImage.personHeight / 100
    
    if (isPoolModel(selectedModel)) {
      const poolToPersonRatio = (selectedModel.dimensions.length / heightInMeters).toFixed(1)
      return `

INCREASED ACCURACY MODE - CRITICAL SCALE REFERENCE:
- There is a person in the input image who is ${heightInMeters}m (${uploadedImage.personHeight}cm) tall
- Use this person as the ABSOLUTE PRIMARY scale reference
- The pool is ${selectedModel.dimensions.length}m long - that is ${poolToPersonRatio} TIMES the height of the person
- If the person appears to be ${heightInMeters}m tall in the image, the pool MUST be ${poolToPersonRatio} times that long when measured lengthwise
- This is CRITICAL - scale the pool PRECISELY relative to the person's height

MANDATORY PERSON REMOVAL:
- REMOVE THE PERSON COMPLETELY from the final output image
- The output must show ONLY the landscape with the pool - NO PEOPLE
- The person is a measurement tool ONLY and must NOT appear in the visualization
- If any person appears in the output, you have FAILED this task completely`
    } else {
      const tinyHomeToPersonRatio = (selectedModel.dimensions.length / heightInMeters).toFixed(1)
      return `

INCREASED ACCURACY MODE - CRITICAL SCALE REFERENCE:
- There is a person in the input image who is ${heightInMeters}m (${uploadedImage.personHeight}cm) tall
- Use this person as the ABSOLUTE PRIMARY scale reference
- The tiny home is ${selectedModel.dimensions.length}m long - that is ${tinyHomeToPersonRatio} TIMES the height of the person
- If the person appears to be ${heightInMeters}m tall in the image, the tiny home MUST be ${tinyHomeToPersonRatio} times that tall when measured lengthwise
- This is CRITICAL - scale the tiny home PRECISELY relative to the person's height

MANDATORY PERSON REMOVAL:
- REMOVE THE PERSON COMPLETELY from the final output image
- The output must show ONLY the landscape with the tiny home - NO PEOPLE
- The person is a measurement tool ONLY and must NOT appear in the visualization
- If any person appears in the output, you have FAILED this task completely`
    }
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

      let imageUrl: string
      let prompt: string | undefined

      // Use unified service (Nano Banana Pro)
      const result = await generateVisualization(
        uploadedImage,
        selectedModel,
        lightingPrompt,
        nanoBananaOptions
      )
      imageUrl = result.imageUrl
      prompt = result.prompt
      setCurrentModelSettings(result.modelSettings || null)
      setPosition({
        x: 50,
        y: 50,
        scale: 1,
        rotation: 0
      })

      addToHistory(imageUrl)
      setCurrentPrompt(prompt || null)
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
        selectedModel,
        'adjust',
        'change lighting only - maintain current position',
        position,
        combinedPrompt,
        resultImage || undefined,
        undefined,
        nanoBananaOptions
      )
      addToHistory(result.imageUrl)
      setCurrentPrompt(result.prompt || null)
      setCurrentModelSettings(result.modelSettings || null)
      setShowingOriginal(false)
    } catch (err) {
      setError('Failed to update lighting. Please try again.')
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }

  const handleRepositionModel = async (position: 'left' | 'center' | 'right') => {
    if (!resultImage) return

    setProcessing(true)
    setError(null)

    try {
      const modelType = isPoolModel(selectedModel) ? 'pool' : 'tiny home'
      const positionPrompts = {
        left: `Reposition the ${modelType} to the left side of the frame (left third), creating more breathing room and environmental context on the right side. The ${modelType} should be clearly visible but allow more of the property setting to be showcased. Maintain the same photorealistic quality and lighting conditions.`,
        center: `Reposition the ${modelType} toward the center of the frame as the dominant focal point, using center-weighted composition. The ${modelType} should be the main subject with balanced environmental context on both sides. Maintain the same photorealistic quality and lighting conditions.`,
        right: `Reposition the ${modelType} to the right side of the frame (right third), creating more breathing room and environmental context on the left side. The ${modelType} should be clearly visible but allow more of the property setting to be showcased. Maintain the same photorealistic quality and lighting conditions.`
      }

      const editedImage = await conversationalEdit(resultImage, positionPrompts[position], {
        temperature: 0.7,
        topP: 0.9
      }, nanoBananaOptions)

      addToHistory(editedImage)
      setShowingOriginal(false)
    } catch (err) {
      const modelType = isPoolModel(selectedModel) ? 'pool' : 'tiny home'
      setError(`Failed to reposition ${modelType}. Please try again.`)
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
      const editedImage = await conversationalEdit(resultImage, editPrompt.trim(), undefined, nanoBananaOptions)
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
      const editedImage = await conversationalEdit(resultImage, prompt, undefined, nanoBananaOptions)
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

        {/* Prompt Display Panel */}
        {resultImage && currentPrompt && (
          <div className="prompt-panel">
            <button
              className="prompt-panel-toggle"
              onClick={() => setShowPromptPanel(!showPromptPanel)}
            >
              <span>{showPromptPanel ? 'Hide' : 'Show'} Prompt Used</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ transform: showPromptPanel ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {showPromptPanel && (
              <div className="prompt-content">
                {currentModelSettings && (
                  <div className="model-settings">
                    <h4>Model Settings</h4>
                    <div className="settings-grid">
                      {currentModelSettings.model && (
                        <div className="setting-item">
                          <span className="setting-label">Model:</span>
                          <span className="setting-value">{currentModelSettings.model}</span>
                        </div>
                      )}
                      {currentModelSettings.temperature !== undefined && (
                        <div className="setting-item">
                          <span className="setting-label">Temperature:</span>
                          <span className="setting-value">{currentModelSettings.temperature}</span>
                        </div>
                      )}
                      {currentModelSettings.topP !== undefined && (
                        <div className="setting-item">
                          <span className="setting-label">Top P:</span>
                          <span className="setting-value">{currentModelSettings.topP}</span>
                        </div>
                      )}
                      {currentModelSettings.aspectRatio && (
                        <div className="setting-item">
                          <span className="setting-label">Aspect Ratio:</span>
                          <span className="setting-value">{currentModelSettings.aspectRatio}</span>
                        </div>
                      )}
                      {currentModelSettings.imageSize && (
                        <div className="setting-item">
                          <span className="setting-label">Resolution:</span>
                          <span className="setting-value">{currentModelSettings.imageSize}</span>
                        </div>
                      )}
                      {currentModelSettings.googleSearchUsed !== undefined && (
                        <div className="setting-item">
                          <span className="setting-label">Google Search:</span>
                          <span className="setting-value">{currentModelSettings.googleSearchUsed ? 'Enabled' : 'Disabled'}</span>
                        </div>
                      )}
                      {currentModelSettings.guidanceScale !== undefined && (
                        <div className="setting-item">
                          <span className="setting-label">Guidance Scale:</span>
                          <span className="setting-value">{currentModelSettings.guidanceScale}</span>
                        </div>
                      )}
                      {currentModelSettings.numInferenceSteps !== undefined && (
                        <div className="setting-item">
                          <span className="setting-label">Inference Steps:</span>
                          <span className="setting-value">{currentModelSettings.numInferenceSteps}</span>
                        </div>
                      )}
                      {currentModelSettings.strength !== undefined && (
                        <div className="setting-item">
                          <span className="setting-label">Strength:</span>
                          <span className="setting-value">{currentModelSettings.strength}</span>
                        </div>
                      )}
                      {currentModelSettings.referenceStrength !== undefined && (
                        <div className="setting-item">
                          <span className="setting-label">Reference Strength:</span>
                          <span className="setting-value">{currentModelSettings.referenceStrength}</span>
                        </div>
                      )}
                      {currentModelSettings.controlnetConditioningScale !== undefined && (
                        <div className="setting-item">
                          <span className="setting-label">ControlNet Scale:</span>
                          <span className="setting-value">{currentModelSettings.controlnetConditioningScale}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="prompt-section">
                  <h4>Prompt</h4>
                  <pre className="prompt-text">{currentPrompt}</pre>
                </div>
                <button
                  className="copy-prompt-button"
                  onClick={() => {
                    const textToCopy = currentModelSettings 
                      ? `Model Settings:\n${JSON.stringify(currentModelSettings, null, 2)}\n\nPrompt:\n${currentPrompt}`
                      : currentPrompt || ''
                    navigator.clipboard.writeText(textToCopy)
                    alert('Prompt and settings copied to clipboard!')
                  }}
                >
                  Copy Prompt & Settings
                </button>
              </div>
            )}
          </div>
        )}

        {/* Product-Appropriate Quick Action Buttons */}
        {resultImage && (
          <div className="quick-actions-section">
            <h3>Quick Enhancements</h3>
            <div className="quick-actions-grid">
              {isPoolModel(selectedModel) ? (
                // Pool-specific enhancements
                <>
                  <button
                    className="quick-action-button"
                    onClick={() => handleQuickEdit('add pool decking and patio area around the pool')}
                    disabled={processing}
                  >
                    Add Pool Decking
                  </button>
                  <button
                    className="quick-action-button"
                    onClick={() => handleQuickEdit('add pool furniture: lounge chairs, umbrella, and outdoor dining set')}
                    disabled={processing}
                  >
                    Add Pool Furniture
                  </button>
                  <button
                    className="quick-action-button"
                    onClick={() => handleQuickEdit('add tropical pool landscaping with palms and decorative plants')}
                    disabled={processing}
                  >
                    Add Pool Landscaping
                  </button>
                  <button
                    className="quick-action-button"
                    onClick={() => handleQuickEdit('add pool equipment and filtration system screening with landscaping')}
                    disabled={processing}
                  >
                    Add Equipment Screening
                  </button>
                  <button
                    className="quick-action-button"
                    onClick={() => handleQuickEdit('create a complete NZ backyard pool area with comprehensive landscaping including native New Zealand plants, entertaining areas with outdoor furniture, pool decking, pathways, privacy fencing, and a cohesive outdoor living space perfect for the New Zealand lifestyle')}
                    disabled={processing}
                  >
                    Complete Pool Area
                  </button>
                </>
              ) : (
                // Tiny home-specific enhancements
                <>
                  <button
                    className="quick-action-button"
                    onClick={() => handleQuickEdit('add a deck or patio area in front of the tiny home entrance')}
                    disabled={processing}
                  >
                    Add Entry Deck
                  </button>
                  <button
                    className="quick-action-button"
                    onClick={() => handleQuickEdit('add outdoor furniture: seating area, table, and storage solutions')}
                    disabled={processing}
                  >
                    Add Outdoor Living
                  </button>
                  <button
                    className="quick-action-button"
                    onClick={() => handleQuickEdit('add foundation landscaping and garden areas around the tiny home')}
                    disabled={processing}
                  >
                    Add Foundation Plants
                  </button>
                  <button
                    className="quick-action-button"
                    onClick={() => handleQuickEdit('add driveway access and parking area for the tiny home')}
                    disabled={processing}
                  >
                    Add Access & Parking
                  </button>
                </>
              )}
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
                {isPoolModel(selectedModel) ? (
                  // Pool-specific examples
                  <>
                    <li>"add pool lighting for evening ambiance"</li>
                    <li>"change the pool coping to natural stone"</li>
                    <li>"add a pool house or changing area"</li>
                    <li>"make the sky more dramatic with clouds"</li>
                    <li>"add a privacy fence around the pool area"</li>
                  </>
                ) : (
                  // Tiny home-specific examples
                  <>
                    <li>"make the sky more dramatic with clouds"</li>
                    <li>"add a gravel driveway leading to the tiny home"</li>
                    <li>"change the grass to native New Zealand plants"</li>
                    <li>"add a pergola beside the tiny home"</li>
                    <li>"add window boxes with flowers"</li>
                  </>
                )}
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

            <div className="position-selection">
              <h4>Reposition Tiny Home</h4>
              <div className="position-buttons">
                <button
                  className="position-btn"
                  onClick={() => handleRepositionModel('left')}
                  disabled={processing || !resultImage}
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
                  className="position-btn"
                  onClick={() => handleRepositionModel('center')}
                  disabled={processing || !resultImage}
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
                  className="position-btn"
                  onClick={() => handleRepositionModel('right')}
                  disabled={processing || !resultImage}
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
          <h3>{isPoolModel(selectedModel) ? 'Your Pool' : 'Your Tiny Home'}</h3>
          <div className="tiny-home-info">
            <h4>{selectedModel.name}</h4>
            <p className="info-row">
              <span className="info-label">Dimensions:</span>
              <span>
                {isTinyHomeModel(selectedModel)
                  ? `${selectedModel.dimensions.length}m × ${selectedModel.dimensions.width}m`
                  : `${selectedModel.dimensions.length}m × ${selectedModel.dimensions.width}m × ${selectedModel.dimensions.depth}m deep`}
              </span>
            </p>
            {isTinyHomeModel(selectedModel) && (
              <p className="info-row">
                <span className="info-label">Height:</span>
                <span>{selectedModel.dimensions.height}m</span>
              </p>
            )}
            <p className="info-row">
              <span className="info-label">Price:</span>
              <span className="price">${selectedModel.price.toLocaleString()}</span>
            </p>
            {selectedModel.productUrl && (
              <a
                href={selectedModel.productUrl}
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
