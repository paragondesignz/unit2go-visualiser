import { useState, useEffect } from 'react'
import { UploadedImage, VisualizationModel, Position, isTinyHomeModel, isPoolModel, ImageResolution } from '../types'
import { processWithGemini, addWatermarkToImage, conversationalEdit, generateVideoWithVeo } from '../services/geminiService'
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
  const [zoomModeActive, setZoomModeActive] = useState(false)
  const [selectionRect, setSelectionRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null)
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null)
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false)

  const tips = [
    isPoolModel(selectedModel)
      ? "The AI intelligently converts the pool diagram into a photorealistic pool and scales it based on surrounding objects"
      : "The AI intelligently scales and places your tiny home based on surrounding objects",
    "After generation, try Quick Enhancement buttons for instant product-appropriate additions",
    "Use conversational editing to customize any aspect of the scene with natural language",
    isPoolModel(selectedModel)
      ? "Try different lighting and times of day to see your pool in various conditions"
      : "Try different lighting and times of day to see your tiny home in various conditions",
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

    if (hour >= 21 && hour <= 22) {
      const baseNightLighting = 'New Zealand nighttime with dark sky (deep blue or black with stars). Natural outdoor lighting from warm deck lights, landscape path lights, and house lighting'

      // Add pool lighting specifically for pool generations at night
      if (isPoolModel(selectedModel)) {
        return baseNightLighting + '. CRITICAL: Include beautiful underwater pool lighting - warm LED lights illuminating the pool water from within, creating an inviting blue glow and gentle water reflections. The pool should have sophisticated lighting that highlights the water clarity and creates an elegant nighttime ambiance.'
      }

      return baseNightLighting
    }

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
      const modelType = isPoolModel(selectedModel) ? 'pool' : 'tiny home'
      const enhancedPrompt = `TOP PRIORITY: PRESERVE ORIGINAL IMAGE COMPOSITION - Maintain the EXACT same camera angle, perspective, and viewpoint as the current image. NEVER change the user's photo composition.

${prompt}. CRITICAL: Keep the ${modelType} in exactly the same position, size, and orientation. Do not move, resize, or alter the ${modelType} in any way. Do not change camera angles, perspectives, or viewing positions. Only add the requested enhancements around or near the ${modelType} while preserving its exact placement, appearance, and the original image composition.`

      const editedImage = await conversationalEdit(resultImage, enhancedPrompt, undefined, nanoBananaOptions)
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

  // New post-generation handlers
  const handleAspectRatioChange = async (newRatio: string) => {
    if (!resultImage) return

    setProcessing(true)
    setError(null)

    try {
      const modelType = isPoolModel(selectedModel) ? 'pool' : 'tiny home'
      const ratioPrompt = `Reframe this image to ${newRatio} aspect ratio. CRITICAL: Keep the ${modelType} and all other elements in exactly the same positions and proportions. Expand the frame composition to fit the ${newRatio} aspect ratio while preserving all visible elements. Maintain the same lighting, perspective, and spatial relationships. Do not crop - expand the scene naturally.`

      // Use proper API aspectRatio parameter for better results
      const editedImage = await conversationalEdit(resultImage, ratioPrompt, undefined, {
        ...nanoBananaOptions,
        imageSize: selectedResolution
      }, newRatio) // Pass aspectRatio as override parameter

      addToHistory(editedImage)
      setShowingOriginal(false)
    } catch (err) {
      setError('Failed to change aspect ratio. Please try again.')
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }

  const handleUpscale = async (targetResolution: '2K' | '4K') => {
    if (!resultImage) return

    // Check if current model supports higher resolutions
    const currentModel = currentModelSettings?.model || 'gemini-3-pro-image-preview'
    if (currentModel.includes('2.5-flash') && targetResolution !== '1K') {
      setError(`Gemini 2.5 Flash Image only supports 1024px resolution. Use Gemini 3 Pro Image for ${targetResolution} upscaling.`)
      return
    }

    setProcessing(true)
    setError(null)

    try {
      // Use minimal prompt since we're relying on API imageSize parameter
      const upscalePrompt = `Enhance the detail and clarity of this image while maintaining exact content and composition.`

      const upscaledImage = await conversationalEdit(resultImage, upscalePrompt, undefined, {
        ...nanoBananaOptions,
        imageSize: targetResolution // Proper API parameter for resolution
      })

      addToHistory(upscaledImage)
      setShowingOriginal(false)
    } catch (err) {
      setError('Failed to upscale image. Please try again.')
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }

  const handleCameraChange = async (cameraAngle: 'aerial' | 'ground' | 'elevated' | 'side' | 'worms-eye') => {
    if (!resultImage) return

    setProcessing(true)
    setError(null)

    try {
      const modelType = isPoolModel(selectedModel) ? 'pool' : 'tiny home'
      const cameraPrompts = {
        aerial: `EXPLICIT USER REQUEST: Change camera perspective. User has specifically requested to change to an aerial/bird's eye view perspective of this scene. Show the ${modelType} and property from directly above or at a high elevated angle. Maintain all existing elements and their spatial relationships while providing this top-down perspective.`,
        ground: `EXPLICIT USER REQUEST: Change camera perspective. User has specifically requested to change to a ground-level perspective of this scene. Position the camera at standing height (about 1.7m) to show the ${modelType} and property from a human eye-level viewpoint. Keep all elements in their current positions.`,
        elevated: `EXPLICIT USER REQUEST: Change camera perspective. User has specifically requested to change to an elevated angle perspective of this scene. Position the camera at a moderate height (2-3 meters) to show the ${modelType} and property from a slightly raised viewpoint. Maintain all existing elements and spatial relationships.`,
        side: `EXPLICIT USER REQUEST: Change camera perspective. User has specifically requested to change to a side view perspective of this scene. Show the ${modelType} and property from the side angle to capture the profile and depth. Keep all elements in their current positions while providing this lateral perspective.`,
        'worms-eye': `EXPLICIT USER REQUEST: Change camera perspective. User has specifically requested to change to a worm's eye view perspective of this scene. Position the camera at a very low angle close to ground level, looking upward to show the ${modelType} and property from below. This dramatic low-angle perspective should create an impressive upward view that emphasizes height and scale. Maintain all existing elements and spatial relationships while providing this upward-looking perspective.`
      }

      const editedImage = await conversationalEdit(resultImage, cameraPrompts[cameraAngle], undefined, nanoBananaOptions)

      addToHistory(editedImage)
      setShowingOriginal(false)
    } catch (err) {
      setError('Failed to change camera angle. Please try again.')
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }


  const handleBeautifyImage = async () => {
    if (!resultImage || processing) return

    setProcessing(true)
    setError(null)

    try {
      const beautifyPrompt = `Transform this image into a stunning, magazine-quality photograph using professional photography techniques while preserving the EXACT same camera angle, perspective, and composition:

🎨 VISUAL COMPOSITION ENHANCEMENTS:
- Apply subtle rule of thirds framing for improved visual balance
- Create enhanced visual flow and leading lines that naturally draw the eye
- Balance all elements harmoniously with refined artistic spacing and positioning
- Add subtle depth enhancement through layered foreground, middle ground, and background elements

📸 PROFESSIONAL PHOTOGRAPHY EFFECTS:
- Apply beautiful shallow depth of field where appropriate (soft bokeh backgrounds for enhanced focus)
- Enhance with warm, golden hour lighting quality and soft directional illumination
- Create subtle lens flare and natural light filtering for magical atmosphere
- Add professional color grading with rich, saturated tones and perfect contrast

✨ ARTISTIC ENHANCEMENTS:
- Enhance all textures to be tactile and inviting (water ripples, plant details, material finishes, surface textures)
- Create enhanced atmospheric mood with subtle mist, dappled light, or warm ambiance
- Add natural photographic elements like floating particles, gentle steam, or organic atmospheric details
- Apply cinematic color palette with complementary tones and professional saturation

🌟 LUXURY APPEAL & POLISH:
- Make all surfaces appear premium with subtle reflections and enhanced material depth
- Add sophisticated lighting that highlights quality, craftsmanship, and architectural details
- Create an aspirational, lifestyle photography aesthetic that feels luxurious and inviting
- Ensure every detail appears polished, refined, and worthy of premium marketing materials

CRITICAL PRESERVATION: Maintain the EXACT same camera position, angle, perspective, and composition. Do not crop, zoom, or change the viewpoint. Only enhance the photographic quality and visual appeal of the existing scene.

The result should be breathtakingly beautiful, enticing, and worthy of premium architectural marketing materials.`

      const beautifiedImage = await conversationalEdit(resultImage, beautifyPrompt, undefined, nanoBananaOptions)

      addToHistory(beautifiedImage)
      setShowingOriginal(false)
    } catch (err) {
      setError('Failed to enhance image. Please try again.')
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }

  const handleSelectionStart = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!zoomModeActive || !resultImage || processing) return

    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    setSelectionRect(null)

    // Add global mouse event listeners for proper drag functionality
    const handleGlobalMouseMove = (e: MouseEvent) => {
      const imageElement = document.querySelector('.result-image') as HTMLImageElement
      if (!imageElement) return

      const imageRect = imageElement.getBoundingClientRect()
      const currentX = e.clientX - imageRect.left
      const currentY = e.clientY - imageRect.top

      // Clamp coordinates to image boundaries
      const clampedX = Math.max(0, Math.min(imageRect.width, currentX))
      const clampedY = Math.max(0, Math.min(imageRect.height, currentY))

      // Calculate raw selection rectangle dimensions
      const deltaX = clampedX - x
      const deltaY = clampedY - y

      let width = Math.abs(deltaX)
      let height = Math.abs(deltaY)

      // Apply minimum size constraint first
      if (width < 20 || height < 20) {
        setSelectionRect(null)
        return
      }

      // Calculate image aspect ratio and apply constraint
      const imageAspectRatio = imageRect.width / imageRect.height

      // Maintain image aspect ratio for the selection
      if (height > 0) {
        const selectionAspectRatio = width / height
        if (selectionAspectRatio > imageAspectRatio) {
          // Selection is too wide - reduce width
          width = height * imageAspectRatio
        } else {
          // Selection is too tall - reduce height
          height = width / imageAspectRatio
        }
      }

      // Calculate position based on drag direction
      const startX = deltaX >= 0 ? x : clampedX
      const startY = deltaY >= 0 ? y : clampedY

      // Apply final boundary constraints
      const maxWidth = imageRect.width - startX
      const maxHeight = imageRect.height - startY

      const finalWidth = Math.min(width, maxWidth)
      const finalHeight = Math.min(height, maxHeight)

      // Only set selection if it's large enough after constraints
      if (finalWidth >= 20 && finalHeight >= 20) {
        setSelectionRect({
          x: startX,
          y: startY,
          width: finalWidth,
          height: finalHeight
        })
      } else {
        setSelectionRect(null)
      }
    }

    const handleGlobalMouseUp = () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove)
      document.removeEventListener('mouseup', handleGlobalMouseUp)
      // Turn off zoom mode but keep selection visible for user to confirm
      setZoomModeActive(false)
    }

    document.addEventListener('mousemove', handleGlobalMouseMove)
    document.addEventListener('mouseup', handleGlobalMouseUp)
  }

  // Reset selection when zoom mode is deactivated
  const handleCancelZoomMode = () => {
    setZoomModeActive(false)
    setSelectionRect(null)
  }

  const handleZoomToSelection = async () => {
    if (!selectionRect || !resultImage || processing) {
      // Clean up selection state even if we're not processing
      setSelectionRect(null)
      return
    }

    // Require minimum selection size (20x20 pixels)
    if (selectionRect.width < 20 || selectionRect.height < 20) {
      setSelectionRect(null)
      return
    }
    setZoomModeActive(false)
    setProcessing(true)
    setError(null)

    try {
      // Get the image element to calculate percentages
      const imageElement = document.querySelector('.result-image') as HTMLImageElement
      if (!imageElement) {
        throw new Error('Image element not found')
      }

      const imageRect = imageElement.getBoundingClientRect()

      // Convert to normalized coordinates [0, 1000] as per Gemini documentation
      const leftNormalized = Math.round((selectionRect.x / imageRect.width) * 1000)
      const topNormalized = Math.round((selectionRect.y / imageRect.height) * 1000)
      const rightNormalized = Math.round(((selectionRect.x + selectionRect.width) / imageRect.width) * 1000)
      const bottomNormalized = Math.round(((selectionRect.y + selectionRect.height) / imageRect.height) * 1000)

      const zoomPrompt = `CROP AND ZOOM into this image to focus on the rectangular area selected by the user.

PRECISE REGION SPECIFICATION (using Gemini's normalized coordinate system [0-1000]):
- Bounding box: [${topNormalized}, ${leftNormalized}, ${bottomNormalized}, ${rightNormalized}] (ymin, xmin, ymax, xmax)
- Top edge: ${topNormalized}/1000 from top
- Left edge: ${leftNormalized}/1000 from left
- Bottom edge: ${bottomNormalized}/1000 from top
- Right edge: ${rightNormalized}/1000 from left

Crop to show ONLY this precisely defined rectangular region while maintaining the EXACT same camera angle, perspective, and viewpoint. Do not change the camera position at all - simply crop/zoom into this exact area using the normalized coordinates provided. Keep all lighting, colors, and details exactly as they appear in the original image.

The output should show only the content within this bounding box, cropped with precision to match the user's selection exactly.`

      const zoomedImage = await conversationalEdit(resultImage, zoomPrompt, undefined, nanoBananaOptions)

      addToHistory(zoomedImage)
      setShowingOriginal(false)
    } catch (err) {
      setError('Failed to zoom into selected area. Please try again.')
      console.error(err)
    } finally {
      setProcessing(false)
      setSelectionRect(null)
    }
  }

  const handleActivateZoomMode = () => {
    setZoomModeActive(true)
  }

  const handleGenerateVideo = async () => {
    if (!resultImage || processing) return

    setIsGeneratingVideo(true)
    setError(null)

    try {
      const modelType = isPoolModel(selectedModel) ? 'pool' : 'tiny home'
      const videoDataUrl = await generateVideoWithVeo(resultImage, modelType)

      setGeneratedVideo(videoDataUrl)
    } catch (err) {
      setError('Failed to generate video. Please try again.')
      console.error(err)
    } finally {
      setIsGeneratingVideo(false)
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
        <div className="visualization-container" style={{ position: 'relative' }}>
          {processing && (
            <div className="processing-overlay">
              <div className="spinner"></div>
              <p className="processing-text">Processing your image...</p>
              <p className="processing-tip">{tips[tipIndex]}</p>
            </div>
          )}

          {resultImage ? (
            <>
              <img
                src={showingOriginal ? uploadedImage.url : resultImage}
                alt={showingOriginal ? "Original space" : "Tiny home visualization"}
                className={`result-image clickable ${zoomModeActive ? 'zoom-mode' : ''}`}
                onClick={!zoomModeActive ? openLightbox : undefined}
                onMouseDown={zoomModeActive ? handleSelectionStart : undefined}
                style={{
                  cursor: zoomModeActive ? 'crosshair' : 'pointer',
                  border: zoomModeActive ? '3px solid #FF6B35' : 'none',
                  userSelect: 'none'
                }}
              />
              {selectionRect && (
                <div
                  className="selection-rectangle"
                  style={{
                    position: 'absolute',
                    left: selectionRect.x,
                    top: selectionRect.y,
                    width: selectionRect.width,
                    height: selectionRect.height,
                    border: '2px dashed #FF6B35',
                    backgroundColor: 'rgba(255, 107, 53, 0.1)',
                    pointerEvents: 'none',
                    zIndex: 10
                  }}
                >
                  {/* Resize handles for transforming selection */}
                  <div className="resize-handle nw-resize" style={{ position: 'absolute', left: '-5px', top: '-5px', width: '10px', height: '10px', backgroundColor: '#FF6B35', cursor: 'nw-resize', pointerEvents: 'auto' }} />
                  <div className="resize-handle ne-resize" style={{ position: 'absolute', right: '-5px', top: '-5px', width: '10px', height: '10px', backgroundColor: '#FF6B35', cursor: 'ne-resize', pointerEvents: 'auto' }} />
                  <div className="resize-handle sw-resize" style={{ position: 'absolute', left: '-5px', bottom: '-5px', width: '10px', height: '10px', backgroundColor: '#FF6B35', cursor: 'sw-resize', pointerEvents: 'auto' }} />
                  <div className="resize-handle se-resize" style={{ position: 'absolute', right: '-5px', bottom: '-5px', width: '10px', height: '10px', backgroundColor: '#FF6B35', cursor: 'se-resize', pointerEvents: 'auto' }} />

                  {/* Edge resize handles */}
                  <div className="resize-handle n-resize" style={{ position: 'absolute', left: '50%', top: '-5px', width: '20px', height: '10px', backgroundColor: '#FF6B35', cursor: 'n-resize', transform: 'translateX(-50%)', pointerEvents: 'auto' }} />
                  <div className="resize-handle s-resize" style={{ position: 'absolute', left: '50%', bottom: '-5px', width: '20px', height: '10px', backgroundColor: '#FF6B35', cursor: 's-resize', transform: 'translateX(-50%)', pointerEvents: 'auto' }} />
                  <div className="resize-handle w-resize" style={{ position: 'absolute', left: '-5px', top: '50%', width: '10px', height: '20px', backgroundColor: '#FF6B35', cursor: 'w-resize', transform: 'translateY(-50%)', pointerEvents: 'auto' }} />
                  <div className="resize-handle e-resize" style={{ position: 'absolute', right: '-5px', top: '50%', width: '10px', height: '20px', backgroundColor: '#FF6B35', cursor: 'e-resize', transform: 'translateY(-50%)', pointerEvents: 'auto' }} />
                </div>
              )}
            </>
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

        {/* Generated Video Display */}
        {generatedVideo && (
          <div className="post-gen-section">
            <h3>🎬 Generated Video</h3>
            <p className="control-info">Cinematic dolly-in flyover generated with Veo 3.1 Fast</p>
            <div className="video-container" style={{ position: 'relative', marginBottom: '20px' }}>
              <video
                src={generatedVideo}
                controls
                autoPlay={false}
                loop
                muted
                style={{
                  width: '100%',
                  maxHeight: '400px',
                  borderRadius: '8px',
                  border: '1px solid #ddd'
                }}
              >
                Your browser doesn't support video playback.
              </video>
              <div className="video-actions" style={{ marginTop: '10px', textAlign: 'center' }}>
                <button
                  className="download-button"
                  onClick={() => {
                    const link = document.createElement('a')
                    link.href = generatedVideo
                    link.download = `unit2go-video-${Date.now()}.mp4`
                    link.click()
                  }}
                  style={{ marginRight: '10px' }}
                >
                  📥 Download Video
                </button>
                <button
                  className="zoom-btn secondary-zoom"
                  onClick={() => setGeneratedVideo(null)}
                >
                  ✖️ Remove Video
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Image Enhancement Controls - Moved under preview image */}
        {resultImage && (
          <div className="post-gen-section close-up-section">
            <h3>🔍 Image & Video Controls</h3>
            <p className="control-info">Enhance your image, create a cinematic video with Veo 3.1, or drag to select an area to zoom into (maintains proportions)</p>

            {!zoomModeActive && !selectionRect ? (
              <div className="zoom-controls">
                <button
                  className="zoom-btn primary-zoom"
                  onClick={handleBeautifyImage}
                  disabled={processing}
                >
                  ✨ Beautiful Photography
                </button>
                <button
                  className="zoom-btn primary-zoom"
                  onClick={handleActivateZoomMode}
                  disabled={processing}
                >
                  🔍 Zoom In
                </button>
                <button
                  className="zoom-btn primary-zoom"
                  onClick={handleGenerateVideo}
                  disabled={processing || isGeneratingVideo}
                >
                  {isGeneratingVideo ? '🎬 Generating...' : '🎬 Create Video'}
                </button>
              </div>
            ) : selectionRect ? (
              <div className="zoom-controls">
                <button
                  className="zoom-btn primary-zoom"
                  onClick={handleZoomToSelection}
                  disabled={processing}
                >
                  🎯 Zoom to Selection
                </button>
                <button
                  className="zoom-btn secondary-zoom"
                  onClick={handleCancelZoomMode}
                  disabled={processing}
                >
                  ✖️ Cancel Selection
                </button>
              </div>
            ) : (
              <div className="zoom-instructions">
                <div className="zoom-active-indicator">
                  <span className="zoom-crosshair">✛</span>
                  <p><strong>Selection Mode Active!</strong></p>
                  <p>Drag on the image above to select a rectangular area to zoom into</p>
                  <button
                    className="cancel-zoom-btn"
                    onClick={handleCancelZoomMode}
                  >
                    Cancel Selection Mode
                  </button>
                </div>
              </div>
            )}
          </div>
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
                    onClick={() => handleQuickEdit('add pool decking and patio area around the pool that naturally integrates with the pool\'s current orientation and shape. The decking should follow the pool\'s existing layout and complement its positioning. Maintain the exact same camera angle and photo perspective - do not change the viewing angle or crop the image.')}
                    disabled={processing}
                  >
                    Add Pool Decking
                  </button>
                  <button
                    className="quick-action-button"
                    onClick={() => handleQuickEdit('add pool furniture (lounge chairs, umbrella, and outdoor dining set) positioned naturally around the pool\'s current layout. Arrange furniture to complement the pool\'s orientation and create natural gathering areas. Maintain the exact same camera angle and photo perspective - do not change the viewing angle or crop the image.')}
                    disabled={processing}
                  >
                    Add Pool Furniture
                  </button>
                  <button
                    className="quick-action-button"
                    onClick={() => handleQuickEdit('add tropical pool landscaping with palms and decorative plants that naturally integrate with the pool\'s current positioning. Plant placement should complement the pool\'s orientation and enhance the existing layout. Maintain the exact same camera angle and photo perspective - do not change the viewing angle or crop the image.')}
                    disabled={processing}
                  >
                    Add Pool Landscaping
                  </button>
                  <button
                    className="quick-action-button"
                    onClick={() => handleQuickEdit('add pool equipment and filtration system screening with landscaping that naturally integrates with the pool\'s current layout. Position screening elements to complement the pool\'s orientation and existing positioning. Maintain the exact same camera angle and photo perspective - do not change the viewing angle or crop the image.')}
                    disabled={processing}
                  >
                    Add Equipment Screening
                  </button>
                  <button
                    className="quick-action-button"
                    onClick={() => handleQuickEdit('create a complete NZ backyard pool area with comprehensive landscaping including native New Zealand plants, entertaining areas with outdoor furniture, pool decking, pathways, privacy fencing, and a cohesive outdoor living space that naturally integrates with the pool\'s current orientation and layout. All additions should complement the pool\'s existing positioning. Maintain the exact same camera angle and photo perspective - do not change the viewing angle or crop the image.')}
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

        {/* Post-Generation Controls */}
        {resultImage && (
          <>
            {/* Aspect Ratio Change */}
            <div className="post-gen-section">
              <h3>Change Aspect Ratio</h3>
              <p className="control-info">Expand the frame to different aspect ratios using Gemini's native aspect ratio support</p>
              <div className="aspect-ratio-grid">
                <button
                  className="aspect-ratio-btn"
                  onClick={() => handleAspectRatioChange('1:1')}
                  disabled={processing}
                >
                  1:1 Square
                </button>
                <button
                  className="aspect-ratio-btn"
                  onClick={() => handleAspectRatioChange('4:3')}
                  disabled={processing}
                >
                  4:3 Standard
                </button>
                <button
                  className="aspect-ratio-btn"
                  onClick={() => handleAspectRatioChange('3:4')}
                  disabled={processing}
                >
                  3:4 Portrait
                </button>
                <button
                  className="aspect-ratio-btn"
                  onClick={() => handleAspectRatioChange('16:9')}
                  disabled={processing}
                >
                  16:9 Widescreen
                </button>
                <button
                  className="aspect-ratio-btn"
                  onClick={() => handleAspectRatioChange('9:16')}
                  disabled={processing}
                >
                  9:16 Mobile
                </button>
                <button
                  className="aspect-ratio-btn"
                  onClick={() => handleAspectRatioChange('21:9')}
                  disabled={processing}
                >
                  21:9 Ultra-wide
                </button>
                <button
                  className="aspect-ratio-btn"
                  onClick={() => handleAspectRatioChange('2:3')}
                  disabled={processing}
                >
                  2:3 Photo
                </button>
                <button
                  className="aspect-ratio-btn"
                  onClick={() => handleAspectRatioChange('3:2')}
                  disabled={processing}
                >
                  3:2 Camera
                </button>
              </div>
            </div>

            {/* Resolution Upscaling */}
            <div className="post-gen-section">
              <h3>Upscale Resolution</h3>
              <div className="upscale-buttons">
                <button
                  className="upscale-btn"
                  onClick={() => handleUpscale('2K')}
                  disabled={processing}
                >
                  Upscale to 2K
                </button>
                <button
                  className="upscale-btn"
                  onClick={() => handleUpscale('4K')}
                  disabled={processing}
                >
                  Upscale to 4K
                </button>
              </div>
            </div>

            {/* Camera Controls */}
            <div className="post-gen-section">
              <h3>Camera Perspective</h3>
              <div className="camera-controls-grid">
                <button
                  className="camera-btn"
                  onClick={() => handleCameraChange('aerial')}
                  disabled={processing}
                >
                  Aerial View
                </button>
                <button
                  className="camera-btn"
                  onClick={() => handleCameraChange('ground')}
                  disabled={processing}
                >
                  Ground Level
                </button>
                <button
                  className="camera-btn"
                  onClick={() => handleCameraChange('elevated')}
                  disabled={processing}
                >
                  Elevated Angle
                </button>
                <button
                  className="camera-btn"
                  onClick={() => handleCameraChange('side')}
                  disabled={processing}
                >
                  Side View
                </button>
                <button
                  className="camera-btn"
                  onClick={() => handleCameraChange('worms-eye')}
                  disabled={processing}
                >
                  Worm's Eye View
                </button>
              </div>
            </div>

          </>
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

            <div className="lightbox-controls">
              <div className="lightbox-zoom-controls">
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
                    className="zoom-reset"
                    onClick={handleZoomReset}
                    aria-label="Reset zoom"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                      <path d="M21 3v5h-5" />
                      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                      <path d="M3 21v-5h5" />
                    </svg>
                    <span>Reset</span>
                  </button>
                )}
              </div>
              <div className="pan-hint" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="3" x2="12" y2="21" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <polyline points="9 6 12 3 15 6" />
                  <polyline points="9 18 12 21 15 18" />
                  <polyline points="6 9 3 12 6 15" />
                  <polyline points="18 9 21 12 18 15" />
                </svg>
                <span>Drag to pan</span>
              </div>
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
