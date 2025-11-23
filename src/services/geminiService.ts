import { GoogleGenAI } from '@google/genai'
import { UploadedImage, TinyHomeModel, PoolModel, Position, VisualizationResult, isPoolModel, VisualizationStyle, NanoBananaProOptions, InteriorViewRequest } from '../types'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''

if (!API_KEY) {
  console.error('Gemini API key is missing. Please add VITE_GEMINI_API_KEY to your .env file')
}

const ai = new GoogleGenAI({
  apiKey: API_KEY,
})

export async function processWithGemini(
  uploadedImage: UploadedImage,
  model: TinyHomeModel | PoolModel,
  mode: 'initial' | 'adjust',
  command?: string,
  currentPosition?: Position,
  lightingPrompt?: string,
  currentResultImage?: string,
  style?: VisualizationStyle,
  nanoBananaOptions?: NanoBananaProOptions
): Promise<VisualizationResult> {

  if (!API_KEY) {
    throw new Error('Gemini API key is not configured. Please add your API key to the .env file.')
  }

  if (mode === 'initial') {
    if (isPoolModel(model)) {
      const result = await generateImageWithPool(uploadedImage, model, undefined, lightingPrompt, style, nanoBananaOptions)
      return {
        imageUrl: result.imageUrl,
        prompt: result.prompt,
        modelSettings: result.modelSettings,
        position: {
          x: 50,
          y: 50,
          scale: 1,
          rotation: 0
        }
      }
    } else {
      const result = await generateImageWithTinyHome(uploadedImage, model, undefined, lightingPrompt, style, nanoBananaOptions)
      return {
        imageUrl: result.imageUrl,
        prompt: result.prompt,
        modelSettings: result.modelSettings,
        position: {
          x: 50,
          y: 50,
          scale: 1,
          rotation: 0
        }
      }
    }
  } else {
    const isLightingOnly = command?.toLowerCase().includes('change lighting only') || command?.toLowerCase().includes('maintain current position')

    if (isLightingOnly && currentResultImage && lightingPrompt) {
      const lightingAdjustedImage = await generateConversationalLightingEdit(currentResultImage, lightingPrompt, nanoBananaOptions)

      return {
        imageUrl: lightingAdjustedImage,
        prompt: `Lighting adjustment: ${lightingPrompt}`,
        modelSettings: {
          model: 'gemini-3-pro-image-preview',
          temperature: nanoBananaOptions?.temperature || 1.0,
          imageSize: nanoBananaOptions?.imageSize || '2K'
        },
        position: currentPosition || { x: 50, y: 50, scale: 1, rotation: 0 }
      }
    } else {
      const newPosition = adjustPositionByCommand(command || '', currentPosition || {
        x: 50,
        y: 50,
        scale: 1,
        rotation: 0
      })

      if (isPoolModel(model)) {
        const adjustedImage = await generateImageWithPool(
          uploadedImage,
          model,
          commandToPrompt(command || '', model, lightingPrompt),
          lightingPrompt,
          style,
          nanoBananaOptions
        )
        return {
          imageUrl: adjustedImage.imageUrl,
          prompt: adjustedImage.prompt,
          modelSettings: adjustedImage.modelSettings,
          position: newPosition
        }
      } else {
        const adjustedImage = await generateImageWithTinyHome(
          uploadedImage,
          model,
          commandToPrompt(command || '', model, lightingPrompt),
          lightingPrompt,
          style,
          nanoBananaOptions
        )
        return {
          imageUrl: adjustedImage.imageUrl,
          prompt: adjustedImage.prompt,
          modelSettings: adjustedImage.modelSettings,
          position: newPosition
        }
      }
    }
  }
}

async function generateConversationalLightingEdit(
  currentImageDataUrl: string,
  lightingPrompt: string,
  nanoBananaOptions?: NanoBananaProOptions
): Promise<string> {
  const imageBase64 = currentImageDataUrl.includes('base64,')
    ? currentImageDataUrl.split('base64,')[1]
    : currentImageDataUrl

  const aspectRatio = await detectAspectRatioFromDataUrl(currentImageDataUrl)

  const conversationalPrompt = `Adjust the lighting in this photograph to match these conditions: ${lightingPrompt}. Keep all structures, positions, and composition exactly the same. Only change the light quality, shadow direction and softness, and overall atmosphere. This should look like the same scene photographed at a different time of day with natural lighting.`

  console.log(`Using aspect ratio for lighting edit: ${aspectRatio}`)

  const config = {
    temperature: nanoBananaOptions?.temperature || 1.0, // Optimal for Gemini 3 Pro reasoning and natural results
    responseModalities: ['Image'] as string[],
    imageConfig: {
      aspectRatio: aspectRatio,
      imageSize: nanoBananaOptions?.imageSize || '2K',
    },
    ...(nanoBananaOptions?.topP && { topP: nanoBananaOptions.topP }),
    ...(nanoBananaOptions?.topK && { topK: nanoBananaOptions.topK }),
    ...(nanoBananaOptions?.enableGoogleSearch && { tools: [{ googleSearch: {} }] }),
  }

  const model = 'gemini-3-pro-image-preview'

  const contents = [
    {
      role: 'user' as const,
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBase64,
          },
        },
        {
          text: conversationalPrompt,
        },
      ],
    },
  ]

  console.log('Sending conversational lighting edit to Gemini API')

  const response = await ai.models.generateContent({
    model,
    config,
    contents,
  })

  if (!response.candidates || !response.candidates[0].content || !response.candidates[0].content.parts) {
    throw new Error('No response from Gemini API')
  }

  const imagePart = response.candidates[0].content.parts.find(part => part.inlineData)

  if (imagePart?.inlineData) {
    console.log('Found lighting-edited image in response!')
    const { mimeType, data } = imagePart.inlineData
    return `data:${mimeType};base64,${data}`
  }

  const textResponse = response.candidates[0].content.parts
    .filter(part => part.text)
    .map(part => part.text)
    .join('')

  throw new Error(`No image generated during lighting edit. API Response: ${textResponse || 'No response text'}`)
}

export async function generateVideoWithVeo(
  imageDataUrl: string,
  modelType: 'pool' | 'tiny home'
): Promise<string> {
  if (!API_KEY) {
    throw new Error('Gemini API key is not configured. Please add your API key to the .env file.')
  }

  const imageBase64 = imageDataUrl.includes('base64,')
    ? imageDataUrl.split('base64,')[1]
    : imageDataUrl

  // Create dolly in camera movement prompt without audio
  const videoPrompt = `Slow cinematic dolly in camera movement toward the ${modelType}, mimicking a gentle drone flyover approach. The camera smoothly moves closer to reveal more detail of the scene. Professional cinematography with stable, controlled movement. No dialogue, no sound effects, no music.`

  console.log('🎬 Generating video with Veo 3.1 Standard...')

  try {
    console.log('Starting video generation operation with REST API...')

    // Use correct REST API format for Veo 3.1
    const requestBody = {
      instances: [{
        prompt: videoPrompt,
        image: {
          imageBytes: imageBase64,
          mimeType: 'image/jpeg'
        }
      }],
      parameters: {
        aspectRatio: "16:9",
        durationSeconds: "6",
        resolution: "720p"
      }
    }

    console.log('Request body structure:', {
      instances: requestBody.instances.length,
      promptLength: requestBody.instances[0].prompt.length,
      hasImage: !!requestBody.instances[0].image,
      imageSize: requestBody.instances[0].image?.imageBytes?.length || 0,
      parameters: requestBody.parameters
    })

    // Start video generation operation - use standard model, not fast (fast may not support image-to-video)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': API_KEY
        },
        body: JSON.stringify(requestBody)
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Veo API Error Response:', errorText)
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const operationResponse = await response.json()
    const operationName = operationResponse.name

    if (!operationName) {
      throw new Error('No operation name returned from video generation request')
    }

    console.log('Polling for video generation completion...')

    // Poll for completion (max 5 minutes)
    let attempts = 0
    const maxAttempts = 30 // 5 minutes at 10-second intervals
    let operation: any = { done: false }

    while (!operation.done && attempts < maxAttempts) {
      console.log(`Video generation in progress... (${attempts + 1}/${maxAttempts})`)
      await new Promise(resolve => setTimeout(resolve, 10000)) // Wait 10 seconds

      try {
        const pollResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
          {
            method: 'GET',
            headers: {
              'x-goog-api-key': API_KEY
            }
          }
        )

        if (pollResponse.ok) {
          operation = await pollResponse.json()
        } else {
          console.error('Error polling operation:', pollResponse.status)
          break
        }
      } catch (pollError) {
        console.error('Error polling video operation:', pollError)
        break
      }

      attempts++
    }

    if (!operation.done) {
      throw new Error('Video generation timed out after 5 minutes')
    }

    if (operation.error) {
      throw new Error(`Video generation failed: ${JSON.stringify(operation.error)}`)
    }

    if (!operation.response?.generatedVideos?.[0]?.video) {
      throw new Error('No video content in completed operation')
    }

    const video = operation.response.generatedVideos[0].video

    // Handle different video response formats
    if (video.data) {
      // Video data is directly accessible
      const videoDataUrl = `data:video/mp4;base64,${video.data}`
      console.log('✅ Video generated and processed successfully')
      return videoDataUrl
    } else if (video.uri) {
      // Fetch video from URI
      const videoResponse = await fetch(video.uri)
      if (!videoResponse.ok) {
        throw new Error(`Failed to fetch video from URI: ${videoResponse.status}`)
      }
      const videoBlob = await videoResponse.blob()
      const videoDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(videoBlob)
      })
      console.log('✅ Video generated and processed successfully')
      return videoDataUrl
    } else {
      throw new Error('No video data or URI found in response')
    }

  } catch (error) {
    console.error('Video generation failed:', error)
    throw new Error(`Failed to generate video: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function addWatermarkToImage(imageDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      reject(new Error('Failed to get canvas context'))
      return
    }

    const mainImage = new Image()
    mainImage.crossOrigin = 'anonymous'

    mainImage.onload = () => {
      canvas.width = mainImage.width
      canvas.height = mainImage.height

      ctx.drawImage(mainImage, 0, 0)

      const watermark = new Image()
      watermark.crossOrigin = 'anonymous'

      watermark.onload = () => {
        const maxWidth = 120
        const aspectRatio = watermark.width / watermark.height

        let logoWidth, logoHeight
        if (aspectRatio > 1) {
          logoWidth = maxWidth
          logoHeight = maxWidth / aspectRatio
        } else {
          logoHeight = maxWidth
          logoWidth = maxWidth * aspectRatio
        }

        const padding = 20

        const x = padding
        const y = canvas.height - logoHeight - padding

        ctx.globalAlpha = 0.6
        ctx.drawImage(watermark, x, y, logoWidth, logoHeight)

        ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        ctx.fillStyle = 'white'
        ctx.globalAlpha = 0.6

        const textX = x + logoWidth + 12
        const textY = y + logoHeight / 2 + 7
        ctx.fillText('www.unit2go.co.nz', textX, textY)

        const watermarkedImage = canvas.toDataURL('image/png')
        resolve(watermarkedImage)
      }

      watermark.onerror = () => {
        console.warn('Failed to load watermark, returning original image')
        resolve(imageDataUrl)
      }

      watermark.src = '/unit2go-logo.png'
    }

    mainImage.onerror = () => reject(new Error('Failed to load main image for watermarking'))
    mainImage.src = imageDataUrl
  })
}

async function generateImageWithTinyHome(
  uploadedImage: UploadedImage,
  tinyHomeModel: TinyHomeModel,
  customPrompt?: string,
  lightingPrompt?: string,
  style?: VisualizationStyle,
  nanoBananaOptions?: NanoBananaProOptions
): Promise<{ imageUrl: string; prompt: string; modelSettings: any }> {
  const imageBase64 = await fileToBase64(uploadedImage.file)
  const tinyHomeImageBase64 = await fetchImageAsBase64(tinyHomeModel.imageUrl)
  const aspectRatio = await detectAspectRatio(uploadedImage.file)

  // Note: Dimensions are included in the model name and handled by AI scaling

  const stylePrompt = style ? `
STYLE INSTRUCTION: Apply a "${style}" aesthetic to the final image.
${getStyleDescription(style)}
` : ''

  // Enhanced prompt for 100% tiny home accuracy
  const getEnhancedTinyHomePrompt = () => {
    const accuracyLevel = nanoBananaOptions?.accuracyMode || 'standard'
    const useThinking = nanoBananaOptions?.useThinkingProcess !== false // Default to enabled for architectural accuracy
    const preserveLighting = nanoBananaOptions?.preserveOriginalLighting && !lightingPrompt

    let basePrompt = `TOP PRIORITY CONSTRAINT: PRESERVE USER'S ORIGINAL IMAGE COMPOSITION
CRITICAL: NEVER change the camera angle, perspective, viewpoint, or composition from the user's original photograph [Image 0]. The user's photo represents their desired viewing angle and must be respected absolutely. Only add tiny home elements and environmental enhancements while maintaining the EXACT same camera position and perspective as the original image.

PRIMARY OBJECTIVE: ACHIEVE 100% PRODUCT ACCURACY FOR ${tinyHomeModel.name} INTEGRATION.

You are performing ultra-precise architectural visualization using Google Nano Banana Pro's advanced capabilities for professional real estate photography.

${useThinking ? `STEP 1: FORENSIC ARCHITECTURAL ANALYSIS (Use thinking process)
Before generating the image, perform a detailed forensic study of the tiny home reference image [1]. Create a comprehensive architectural inventory by carefully examining and documenting:

STRUCTURAL ELEMENTS: Count and describe every window (noting exact shapes, sizes, frame styles, and grid patterns), identify door types and their exact placement, analyze the complete roof configuration including pitch angles and any dormers or chimneys, document siding materials and their installation patterns.

VISUAL CHARACTERISTICS: Record the precise color palette of all exterior materials, note any weathering or aging effects on surfaces, document hardware details like door handles and window trim, identify the foundation or base structure design.

PROPORTIONAL ANALYSIS: Measure the relationships between architectural elements (window-to-wall ratios, door proportions, roof overhang dimensions), establish the overall building proportions and massing.

This forensic documentation will serve as your architectural specification for perfect replication in the property scene.

` : ''}Professional Photography Standards: Shoot with architectural photography standards using 85mm lens perspective, f/8 aperture for optimal clarity, tripod-mounted with perspective correction. Maintain marketing-grade composition and lighting quality.

Input Specification

Image [0]: The property scene - your canvas for integration.

Image [1]: Tiny home reference image - THIS IS THE EXACT ARCHITECTURAL TEMPLATE.

UNBREAKABLE RULES: ARCHITECTURAL PRECISION (100% ACCURACY REQUIRED)

Your CRITICAL task is to render the tiny home from Image [1] into Image [0] with IDENTICAL architectural features and proportions.

MANDATORY ARCHITECTURAL CONSTRAINTS:

FEATURE PRESERVATION PROTOCOL:
Study the tiny home reference image [1] like an architectural blueprint. Count and document every architectural element: the exact number of windows, their precise sizes and positions, the specific door style and placement, the roof design including any dormers or chimneys, the siding material and pattern, and all trim details. Transfer these elements with forensic accuracy to the property scene [0].

CRITICAL PROHIBITIONS:
- NEVER add architectural features not present in the reference image [1]
- NEVER modify window sizes, shapes, or quantities from the reference
- NEVER change door styles or add additional doors beyond what's shown
- NEVER alter the roofline configuration or add roof features not in reference
- NEVER modify siding patterns or material appearances
- NEVER add porches, decks, or structural elements not visible in reference
- NEVER change the proportional relationships between architectural elements

DESCRIPTIVE ACCURACY REQUIREMENTS:
The tiny home must appear as if the exact structure from reference image [1] was physically transported and placed in the property scene [0]. Every architectural detail—from the window mullions to the door hardware to the roof edge details—must match the reference with photographic precision. The materials should exhibit the same weathering, color saturation, and surface textures as shown in the reference image.

GROUND PLANE ALIGNMENT: The tiny home MUST sit level and horizontal on the natural ground plane, appearing naturally founded and stable, never tilted or at an angle.

This is forensic architectural replication. Visual accuracy of existing features overrides ALL other considerations.

${accuracyLevel === 'ultra' ? `ULTRA ACCURACY MODE ACTIVE:
- Generate at maximum resolution (4K) for architectural detail verification
- Use Google Search grounding for factual tiny home specifications
- Apply multi-step verification for architectural compliance
- Implement advanced architectural recognition algorithms

` : ''}ADVANCED SCENE ANALYSIS & INTEGRATION:

1. SPATIAL DEPTH ANALYSIS FOR TINY HOMES:
   Use Gemini 3 Pro's advanced spatial reasoning to analyze the property's 3D environment:
   - Detect depth planes and perspective lines to understand the terrain's spatial structure
   - Identify fence lines, building edges, and terrain contours for optimal alignment
   - Analyze existing structures (sheds, garages, utilities) to maintain spatial harmony
   - Understand property boundaries and setback requirements for realistic placement
   - Assess access points and pathways for natural integration with property flow
   - Determine sight lines from main house to create harmonious living spaces

2. INTELLIGENT PLACEMENT OPTIMIZATION:
   Position the tiny home using spatial intelligence and practical considerations:
   - Select flat or gently sloped areas suitable for foundation and utilities
   - Ensure visual composition showcases both property and tiny home effectively
   - Align with existing structures and boundaries using spatial reference points
   - Create natural sight lines and accessibility for realistic living scenarios
   - Consider privacy, wind patterns, and sun exposure for practical placement
   - Integrate with existing landscaping and hardscaping features

3. Scale & Proportion Accuracy:
Scale the tiny home to precise real-world proportions using visible reference points: standard doors (8 feet), fence panels (6 feet), windows (3x4 feet), and vehicle dimensions when present. The tiny home should maintain its authentic ${tinyHomeModel.dimensions.length}m x ${tinyHomeModel.dimensions.width}m footprint relative to these reference elements.${uploadedImage.increasedAccuracy && uploadedImage.personHeight ? ` CRITICAL: Use person height reference (${uploadedImage.personHeight}cm) for precise scaling ratio. Tiny home should measure ${(tinyHomeModel.dimensions.length / (uploadedImage.personHeight / 100)).toFixed(1)} times the person's height. REMOVE person from final image.` : ''}`

    // Enhanced lighting logic with preservation mode
    if (preserveLighting) {
      basePrompt += `

LIGHTING PRESERVATION MODE: Analyze and PRESERVE the exact lighting conditions from Image [0]:
   - Shadow direction, length, and softness must remain identical
   - Color temperature and atmospheric conditions must be maintained exactly
   - Tiny home integration must appear as if it was photographed under the same lighting
   - Material reflections and surface lighting must match the preserved lighting environment
   - NO changes to overall scene lighting or atmosphere`
    } else {
      basePrompt += `

Lighting & Environmental Integration:
Match the existing lighting conditions exactly - analyze shadow direction, length, and softness from the property photo. Replicate this lighting on the tiny home including shadow placement, color temperature, ambient lighting balance, and atmospheric conditions.${lightingPrompt ? ` Specific lighting requirements: ${lightingPrompt}` : ''}`
    }

    basePrompt += `

4. COMPREHENSIVE LANDSCAPING & SITE INTEGRATION:
   Create a complete outdoor living environment that makes the tiny home appear naturally established:
   - Analyze existing vegetation and terrain to determine complementary landscaping approach
   - Add appropriate foundation landscaping (native plants, decorative gravel, pathway materials)
   - Create seamless transitions between tiny home and existing yard features
   - Include practical elements: utilities screening, pathway connections, outdoor living spaces
   - Add complementary outdoor features: small deck/patio, garden areas, storage solutions
   - Integrate parking area or driveway access that flows naturally with property layout
   - Include privacy landscaping where appropriate (hedges, screens, strategic plantings)
   - Add functional elements: outdoor lighting, mailbox placement, utility connections
   - Ensure all additions suit the property's existing style and maintenance requirements

${customPrompt ? `Additional Requirements: ${customPrompt}` : ''}
${stylePrompt}`

    if (nanoBananaOptions?.enableGeometricVerification) {
      basePrompt += `

FINAL ARCHITECTURAL VERIFICATION CHECKLIST:
1. Does the tiny home architecture match Image [1] exactly? (Must be YES)
2. Are all windows, doors, and features identical to reference? (Must be YES)
3. Do the proportions and scale match the reference precisely? (Must be YES)
4. Are materials and colors accurate to the reference? (Must be YES)
5. Is the tiny home sitting level and horizontal on the ground plane? (Must be YES)
If any answer is incorrect, the generation has FAILED and must be corrected.`
    } else {
      basePrompt += `

FINAL VERIFICATION: Confirm that the tiny home's architectural features match Image [1] exactly, scale matches real-world proportions relative to visible reference points, the structure sits perfectly level and horizontal on the ground plane, shadows align precisely with the property's lighting direction, ground integration appears naturally established, and the overall composition maintains professional real estate photography standards suitable for premium marketing materials.`
    }

    return basePrompt
  }

  const prompt = customPrompt || getEnhancedTinyHomePrompt()

  console.log(`Detected aspect ratio: ${aspectRatio}`)
  console.log(`Tiny home accuracy mode: ${nanoBananaOptions?.accuracyMode || 'standard'}`)

  // Enhanced configuration for maximum tiny home accuracy
  const accuracyLevel = nanoBananaOptions?.accuracyMode || 'standard'
  const defaultImageSize = accuracyLevel === 'ultra' ? '4K' : (accuracyLevel === 'maximum' ? '2K' : '1K')
  const enableGoogleSearch = nanoBananaOptions?.enableGoogleSearch ||
                            (accuracyLevel === 'ultra' || accuracyLevel === 'maximum')
  const useThinking = nanoBananaOptions?.useThinkingProcess !== false // Default enabled for architectural accuracy

  const config = {
    temperature: nanoBananaOptions?.temperature || 1.0, // Optimal for Gemini 3 Pro reasoning and natural placement
    topP: nanoBananaOptions?.topP || 0.95, // Balanced performance for complex architectural analysis
    responseModalities: ['Image'] as string[],
    imageConfig: {
      aspectRatio: aspectRatio,
      imageSize: nanoBananaOptions?.imageSize || defaultImageSize,
    },
    // Enhanced accuracy settings
    ...(nanoBananaOptions?.topK && { topK: nanoBananaOptions.topK }),
    ...(enableGoogleSearch && { tools: [{ googleSearch: {} }] }),
    ...(useThinking && { thinkingBudget: accuracyLevel === 'ultra' ? 2000 : (accuracyLevel === 'maximum' ? 1500 : 1000) }),
  }

  const model = 'gemini-3-pro-image-preview'

  const contents = [
    {
      role: 'user' as const,
      parts: [
        {
          inlineData: {
            mimeType: uploadedImage.file.type || 'image/jpeg',
            data: imageBase64,
          },
        },
        {
          inlineData: {
            mimeType: 'image/png',
            data: tinyHomeImageBase64,
          },
        },
        {
          text: prompt,
        },
      ],
    },
  ]

  console.log('Sending request to Gemini API with model:', model)

  const response = await ai.models.generateContent({
    model,
    config,
    contents,
  })

  if (!response.candidates || !response.candidates[0].content || !response.candidates[0].content.parts) {
    throw new Error('No response from Gemini API')
  }

  const imagePart = response.candidates[0].content.parts.find(part => part.inlineData)

  if (imagePart?.inlineData) {
    console.log('Found image in response!')
    const { mimeType, data } = imagePart.inlineData
    return {
      imageUrl: `data:${mimeType};base64,${data}`,
      prompt: prompt,
      modelSettings: {
        model: model,
        temperature: config.temperature,
        aspectRatio: config.imageConfig.aspectRatio,
        imageSize: config.imageConfig.imageSize,
        ...(nanoBananaOptions?.topP && { topP: nanoBananaOptions.topP }),
        ...(nanoBananaOptions?.topK && { topK: nanoBananaOptions.topK }),
        googleSearchUsed: nanoBananaOptions?.enableGoogleSearch || false
      }
    }
  }

  const textResponse = response.candidates[0].content.parts
    .filter(part => part.text)
    .map(part => part.text)
    .join('')

  throw new Error(`No image generated. API Response: ${textResponse || 'No response text'}`)
}

async function generateImageWithPool(
  uploadedImage: UploadedImage,
  poolModel: PoolModel,
  customPrompt?: string,
  lightingPrompt?: string,
  style?: VisualizationStyle,
  nanoBananaOptions?: NanoBananaProOptions
): Promise<{ imageUrl: string; prompt: string; modelSettings: any }> {
  const imageBase64 = await fileToBase64(uploadedImage.file)
  const poolImageBase64 = await fetchImageAsBase64(poolModel.imageUrl)
  const aspectRatio = await detectAspectRatio(uploadedImage.file)

  // Get pool dimensions
  const { length, width } = poolModel.dimensions

  const stylePrompt = style ? `
STYLE INSTRUCTION: Apply a "${style}" aesthetic to the final image.
${getStyleDescription(style)}
` : ''

  // Enhanced prompt for 100% accuracy with Nano Banana Pro capabilities
  // IMPORTANT: Reference images are sent in order: [0] = property photo, [1] = pool diagram
  const getEnhancedPoolPrompt = () => {
    const accuracyLevel = nanoBananaOptions?.accuracyMode || 'standard'
    const useThinking = nanoBananaOptions?.useThinkingProcess && accuracyLevel !== 'standard'
    const preserveLighting = nanoBananaOptions?.preserveOriginalLighting && !lightingPrompt

    let basePrompt = `TOP PRIORITY CONSTRAINT: PRESERVE USER'S ORIGINAL IMAGE COMPOSITION
CRITICAL: NEVER change the camera angle, perspective, viewpoint, or composition from the user's original photograph [Image 0]. The user's photo represents their desired viewing angle and must be respected absolutely. Only add pool elements and environmental enhancements while maintaining the EXACT same camera position and perspective as the original image.

PRIMARY DIRECTIVE: ACHIEVE 100% PRODUCT ACCURACY AND SHAPE FIDELITY.

You are performing ultra-precise architectural visualization using Google Nano Banana Pro's advanced capabilities for professional real estate photography.

${useThinking ? `STEP 1: GEOMETRIC ANALYSIS (Use thinking process)
Before generating the image, analyze the pool reference image [1] and identify:
- Exact geometric shape (rectangle, oval, kidney, etc.)
- All visible features (steps, ledges, depth variations, equipment)
- Corner types (rounded vs. sharp)
- Any unique design elements or cutouts
Document these elements for perfect replication.

` : ''}Professional Photography Context: Render as studio-quality real estate photography with calibrated lighting, professional composition, and marketing-grade clarity. Use 85mm lens perspective with f/8 aperture for architectural detail optimization.

Input Specification

Image [0]: The property/backyard scene - your canvas for integration.

Image [1]: Pool reference image - THIS IS THE EXACT SHAPE AND FEATURE TEMPLATE.

UNBREAKABLE RULES: GEOMETRIC PRECISION (100% ACCURACY REQUIRED)

Your CRITICAL task is to render the pool from Image [1] into Image [0] with IDENTICAL shape and features.

MANDATORY GEOMETRIC CONSTRAINTS:
- NO ADDED FEATURES: You MUST NOT add any features absent from Image [1].
- NO STEPS: If Image [1] lacks steps, the final pool MUST NOT have steps.
- NO CURVES: If Image [1] shows straight edges, maintain straight edges exactly.
- NO CUTOUTS: Do not add ledges, alcoves, or cutouts unless explicitly visible in Image [1].
- PERFECT OUTLINE: The final pool's perimeter must match Image [1] exactly. Do not "improve" or modify the geometric design.
- EXACT PROPORTIONS: Length-to-width ratio must match Image [1] precisely.
- GROUND PLANE ALIGNMENT: The pool MUST be perfectly level and horizontal with the ground plane. Pool edges must be parallel to the natural ground surface and never appear tilted or at an angle.

This is precision engineering, not creative interpretation. Shape accuracy overrides ALL other considerations.

${accuracyLevel === 'ultra' ? `ULTRA ACCURACY MODE ACTIVE:
- Generate at maximum resolution (4K) for detail verification
- Use Google Search grounding for factual pool specifications
- Apply multi-step verification for geometric compliance
- Implement advanced shape recognition algorithms

` : ''}Secondary Task: Professional Integration

After guaranteeing 100% shape fidelity, execute these requirements:

1. SPATIAL DEPTH ANALYSIS & OPTIMAL PLACEMENT:
   Use Gemini 3 Pro's advanced spatial reasoning to analyze the scene's 3D structure:
   - Detect depth planes and perspective lines to understand the yard's spatial layout
   - Identify fence lines, building edges, and terrain contours as spatial reference points
   - Analyze existing hardscaping (paths, patios, retaining walls) for alignment opportunities
   - Determine optimal pool position using spatial intelligence rather than simple placement
   - Ensure the pool aligns with the property's natural flow and existing structures
   - Position pool to complement sight lines from house windows and outdoor spaces
   - CRITICAL: Establish the natural ground plane from visible terrain features and ensure the pool sits perfectly level and horizontal with this ground plane. The pool surface must appear as a natural extension of the yard's level areas.

2. Precise Scaling: The pool measures exactly ${length}m long × ${width}m wide (aspect ratio ${(width / length).toFixed(2)}:1 width-to-length). Scale accurately using these visible reference elements from Image [0]:

   PRIMARY SCALING REFERENCES (use any visible):
   - Standard residential doors: 2.0m height, 0.9m width
   - Fence panels: 1.8m height, typical 2.4m sections
   - Single-story house height: ~3m to roof line
   - Standard cars: ~4.5m length, 1.8m width
   - Patio furniture: chairs ~0.6m wide, tables ~1.0-1.5m
   - Garden beds: analyze width against house proportions
   - Driveways: typically 3-4m wide for residential
   - Windows: standard residential ~1.2m wide

   SCALING VERIFICATION: Ensure the pool's footprint looks proportionally correct against the house size - a ${length}m pool should appear roughly ${(length/12).toFixed(1)} times the width of a standard residential door when viewed at similar distances.${uploadedImage.increasedAccuracy && uploadedImage.personHeight ? ` CRITICAL: Use person height reference (${uploadedImage.personHeight}cm) for precise scaling ratio. Pool should measure ${(poolModel.dimensions.length / (uploadedImage.personHeight / 100)).toFixed(1)} times the person's height. REMOVE person from final image.` : ''}

3. PREMIUM WATER QUALITY RENDERING:
   MANDATORY WATER SPECIFICATIONS - The pool water MUST be absolutely pristine and photorealistic:
   - CRYSTAL CLARITY: Water must be completely transparent and crystal clear with pristine blue coloration
   - CRISP DETAIL: Every water detail must be sharp and photorealistic - no blurring or artifacting
   - SURFACE PERFECTION: Smooth, natural surface tension with subtle, realistic ripples and movement
   - LIGHT REFRACTION: Perfect light refraction patterns showing depth and clarity through the water
   - DEPTH VISIBILITY: Bottom of pool must be clearly visible through the crystal clear water
   - PROFESSIONAL MAINTENANCE: Water appearance must suggest professional pool maintenance and filtration
   - INVITING QUALITY: Water should appear refreshing, clean, and inviting for swimming
   - NO CLOUDINESS: Absolutely no murky, cloudy, or unclear water - pristine transparency required
   - REALISTIC PHYSICS: Natural water behavior with correct reflection angles and surface dynamics
   For nighttime scenes: Underwater LED lighting must illuminate the crystal clear water from within, creating stunning blue glow that showcases perfect water clarity and produces elegant surface reflections.`

    // Enhanced lighting logic with preservation mode
    if (preserveLighting) {
      basePrompt += `

4. LIGHTING PRESERVATION MODE: Analyze and PRESERVE the exact lighting conditions from Image [0]:
   - Shadow direction, length, and softness must remain identical
   - Color temperature and atmospheric conditions must be maintained exactly
   - Pool integration must appear as if it was photographed under the same lighting
   - Water reflections must match the preserved lighting environment
   - NO changes to overall scene lighting or atmosphere`
    } else {
      basePrompt += `

4. Professional Lighting Integration: Analyze shadow direction, length, and softness from Image [0]. Replicate exact lighting on the pool including shadow placement, water reflections, color temperature, and atmospheric conditions.${lightingPrompt ? ` Specific lighting: ${lightingPrompt}` : ''}`
    }

    basePrompt += `

5. PROFESSIONAL LANDSCAPING INTEGRATION:
   Create a cohesive outdoor environment that makes the pool appear naturally established:
   - Analyze existing yard vegetation (trees, shrubs, lawn) to determine appropriate landscaping style
   - Add complementary pool-appropriate landscaping that suits the climate and yard aesthetic
   - Include strategic plantings around pool perimeter (tropical palms for modern pools, native plants for natural settings)
   - Integrate pool coping and decking materials that harmonize with existing hardscaping
   - Add practical elements: pool equipment screening with landscaping, pathway connections
   - Ensure landscaping provides privacy screening where appropriate
   - Include outdoor furniture positioning that creates natural gathering spaces
   - Add lighting elements (subtle landscape lighting) that enhance evening ambiance

${stylePrompt}`

    if (nanoBananaOptions?.enableGeometricVerification) {
      basePrompt += `

FINAL GEOMETRIC VERIFICATION CHECKLIST:
1. Does the pool shape in the output match Image [1] exactly? (Must be YES)
2. Are there any added features not visible in Image [1]? (Must be NO)
3. Do the proportions match the reference image precisely? (Must be YES)
4. Is the scaling accurate to real-world dimensions? (Must be YES)
5. Is the pool perfectly level and horizontal with the ground plane? (Must be YES)
If any answer is incorrect, the generation has FAILED and must be corrected.`
    }

    return basePrompt
  }

  const prompt = customPrompt || getEnhancedPoolPrompt()

  console.log(`Detected aspect ratio: ${aspectRatio}`)
  console.log(`Pool accuracy mode: ${nanoBananaOptions?.accuracyMode || 'standard'}`)

  // Enhanced configuration for maximum accuracy
  const accuracyLevel = nanoBananaOptions?.accuracyMode || 'standard'
  const defaultImageSize = accuracyLevel === 'ultra' ? '4K' : (accuracyLevel === 'maximum' ? '2K' : '1K')
  const enableGoogleSearch = nanoBananaOptions?.enableGoogleSearch ||
                            (accuracyLevel === 'ultra' || accuracyLevel === 'maximum')
  const useThinking = nanoBananaOptions?.useThinkingProcess ||
                     (accuracyLevel === 'ultra' || accuracyLevel === 'maximum')

  const config = {
    temperature: nanoBananaOptions?.temperature || 1.0, // Optimal for Gemini 3 Pro reasoning capabilities
    topP: nanoBananaOptions?.topP || 0.95, // Balanced performance for complex scene analysis
    responseModalities: ['Image'] as string[],
    imageConfig: {
      aspectRatio: aspectRatio,
      imageSize: nanoBananaOptions?.imageSize || defaultImageSize,
    },
    // Enhanced accuracy settings
    ...(nanoBananaOptions?.topK && { topK: nanoBananaOptions.topK }),
    ...(enableGoogleSearch && { tools: [{ googleSearch: {} }] }),
    ...(useThinking && { thinkingBudget: accuracyLevel === 'ultra' ? 2000 : 1000 }),
  }

  const model = 'gemini-3-pro-image-preview'

  const contents = [
    {
      role: 'user' as const,
      parts: [
        {
          text: prompt,
        },
        {
          inlineData: {
            mimeType: uploadedImage.file.type || 'image/jpeg',
            data: imageBase64,
          },
        },
        {
          inlineData: {
            mimeType: 'image/png',
            data: poolImageBase64,
          },
        },
      ],
    },
  ]

  console.log('Sending pool generation request to Gemini API with model:', model)

  const response = await ai.models.generateContent({
    model,
    config,
    contents,
  })

  if (!response.candidates || !response.candidates[0].content || !response.candidates[0].content.parts) {
    throw new Error('No response from Gemini API')
  }

  const imagePart = response.candidates[0].content.parts.find(part => part.inlineData)

  if (imagePart?.inlineData) {
    console.log('Found pool image in response!')
    const { mimeType, data } = imagePart.inlineData
    return {
      imageUrl: `data:${mimeType};base64,${data}`,
      prompt: prompt,
      modelSettings: {
        model: model,
        temperature: config.temperature,
        topP: config.topP,
        aspectRatio: config.imageConfig.aspectRatio,
        imageSize: config.imageConfig.imageSize,
        ...(nanoBananaOptions?.topK && { topK: nanoBananaOptions.topK }),
        googleSearchUsed: nanoBananaOptions?.enableGoogleSearch || false
      }
    }
  }

  const textResponse = response.candidates[0].content.parts
    .filter(part => part.text)
    .map(part => part.text)
    .join('')

  throw new Error(`No pool image generated.API Response: ${textResponse || 'No response text'} `)
}

/**
 * Map ratio value to closest Gemini-supported aspect ratio string
 * Supported: "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"
 */
function mapToAspectRatio(ratio: number): string {
  // Map to closest supported aspect ratio
  if (Math.abs(ratio - 1) < 0.1) return "1:1"
  if (Math.abs(ratio - 4 / 3) < 0.1) return "4:3"
  if (Math.abs(ratio - 3 / 4) < 0.1) return "3:4"
  if (Math.abs(ratio - 16 / 9) < 0.1) return "16:9"
  if (Math.abs(ratio - 9 / 16) < 0.1) return "9:16"
  if (Math.abs(ratio - 3 / 2) < 0.1) return "3:2"
  if (Math.abs(ratio - 2 / 3) < 0.1) return "2:3"
  if (Math.abs(ratio - 5 / 4) < 0.1) return "5:4"
  if (Math.abs(ratio - 4 / 5) < 0.1) return "4:5"
  if (Math.abs(ratio - 21 / 9) < 0.1) return "21:9"

  // Default to closest common ratio
  if (ratio > 1.5) return "16:9"
  if (ratio > 1.2) return "4:3"
  if (ratio > 0.9) return "1:1"
  if (ratio > 0.6) return "3:4"
  return "9:16"
}

/**
 * Detect aspect ratio from File
 */
async function detectAspectRatio(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      const ratio = img.width / img.height
      URL.revokeObjectURL(url)
      resolve(mapToAspectRatio(ratio))
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image for aspect ratio detection'))
    }

    img.src = url
  })
}

/**
 * Detect aspect ratio from data URL
 */
async function detectAspectRatioFromDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => {
      const ratio = img.width / img.height
      resolve(mapToAspectRatio(ratio))
    }

    img.onerror = () => {
      reject(new Error('Failed to load image from data URL'))
    }

    img.src = dataUrl
  })
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function fetchImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      ctx.drawImage(img, 0, 0)
      const dataUrl = canvas.toDataURL('image/png')
      resolve(dataUrl.split(',')[1])
    }

    img.onerror = () => reject(new Error('Failed to load tiny home image'))
    img.src = url
  })
}

function commandToPrompt(command: string, model: TinyHomeModel | PoolModel, lightingPrompt?: string): string {
  const lowerCommand = command.toLowerCase()

  if (lowerCommand.includes('change lighting only') || lowerCommand.includes('maintain current position')) {
    return `Modify this image by adjusting only the lighting and atmospheric conditions according to these specifications: ${lightingPrompt}. Preserve the ${isPoolModel(model) ? 'pool' : 'tiny home'} and all other elements in their exact current positions, maintaining the same composition and spatial relationships.`
  }

  const modelType = isPoolModel(model) ? 'pool' : 'tiny home'
  const modelName = model.name

  let prompt = `Reposition the ${modelName} ${modelType} in this scene by making the following adjustments: `

  if (lowerCommand.includes('left')) prompt += 'move the structure to the left side of the scene, '
  if (lowerCommand.includes('right')) prompt += 'move the structure to the right side of the scene, '
  if (lowerCommand.includes('up') || lowerCommand.includes('back')) prompt += 'move the structure further back creating more distance from the camera viewpoint, '
  if (lowerCommand.includes('down') || lowerCommand.includes('forward')) prompt += 'move the structure closer to the camera viewpoint, '

  prompt += 'while maintaining realistic proportions and scale. Preserve the property scene exactly as shown, changing only the position of the structure.'

  if (lightingPrompt) prompt += ` Adjust lighting and atmospheric conditions according to these specifications: ${lightingPrompt}.`

  return prompt
}

function adjustPositionByCommand(command: string, currentPosition: Position): Position {
  const lowerCommand = command.toLowerCase()
  let newPosition = { ...currentPosition }

  if (lowerCommand.includes('left')) {
    newPosition.x = Math.max(10, currentPosition.x - 10)
  } else if (lowerCommand.includes('right')) {
    newPosition.x = Math.min(90, currentPosition.x + 10)
  }

  if (lowerCommand.includes('up') || lowerCommand.includes('top')) {
    newPosition.y = Math.max(10, currentPosition.y - 10)
  } else if (lowerCommand.includes('down') || lowerCommand.includes('bottom')) {
    newPosition.y = Math.min(90, currentPosition.y + 10)
  }

  if (lowerCommand.includes('rotate')) {
    const angleMatch = lowerCommand.match(/(\d+)/)
    if (angleMatch) {
      newPosition.rotation = (currentPosition.rotation + parseInt(angleMatch[1])) % 360
    } else {
      newPosition.rotation = (currentPosition.rotation + 45) % 360
    }
  }

  if (lowerCommand.includes('smaller') || lowerCommand.includes('shrink')) {
    newPosition.scale = Math.max(0.5, currentPosition.scale - 0.1)
  } else if (lowerCommand.includes('larger') || lowerCommand.includes('bigger')) {
    newPosition.scale = Math.min(2.0, currentPosition.scale + 0.1)
  }

  if (lowerCommand.includes('center')) {
    newPosition.x = 50
    newPosition.y = 50
  } else if (lowerCommand.includes('corner')) {
    if (lowerCommand.includes('top') && lowerCommand.includes('left')) {
      newPosition.x = 20
      newPosition.y = 20
    } else if (lowerCommand.includes('top') && lowerCommand.includes('right')) {
      newPosition.x = 80
      newPosition.y = 20
    } else if (lowerCommand.includes('bottom') && lowerCommand.includes('left')) {
      newPosition.x = 20
      newPosition.y = 80
    } else if (lowerCommand.includes('bottom') && lowerCommand.includes('right')) {
      newPosition.x = 80
      newPosition.y = 80
    }
  }

  return newPosition
}

export async function processWithWireframeGuide(
  uploadedImage: UploadedImage,
  model: TinyHomeModel | PoolModel,
  wireframeGuideDataUrl: string,
  lightingPrompt?: string,
  nanoBananaOptions?: NanoBananaProOptions
): Promise<string> {
  const imageBase64 = await fileToBase64(uploadedImage.file)
  const modelImageBase64 = await fetchImageAsBase64(model.imageUrl)
  const wireframeBase64 = wireframeGuideDataUrl.includes('base64,')
    ? wireframeGuideDataUrl.split('base64,')[1]
    : wireframeGuideDataUrl
  const aspectRatio = await detectAspectRatio(uploadedImage.file)

  const modelType = isPoolModel(model) ? 'pool' : 'tiny home'
  const prompt = `This is a real estate photograph showing the ${model.name} ${modelType} placed on a property.Use the wireframe guide(third image) to position the ${modelType} exactly where indicated in the property photo(first image).Match the ${modelType} 's appearance from the reference (second image) while ensuring it looks naturally integrated with realistic shadows, lighting, and scale. ${isPoolModel(model) ? 'Convert the pool diagram into a photorealistic pool with realistic water, materials, and integration.' : 'Orient it parallel to visible features like fences or pathways.'} The result should be an authentic photograph.${lightingPrompt ? ` Use these lighting conditions: ${lightingPrompt}.` : ''}`

  console.log(`Using aspect ratio for wireframe guide: ${aspectRatio}`)

  const config = {
    temperature: nanoBananaOptions?.temperature || 1.0, // Optimal for Gemini 3 Pro reasoning and accurate positioning
    responseModalities: ['Image'] as string[],
    imageConfig: {
      aspectRatio: aspectRatio,
      imageSize: nanoBananaOptions?.imageSize || '2K',
    },
    ...(nanoBananaOptions?.topP && { topP: nanoBananaOptions.topP }),
    ...(nanoBananaOptions?.topK && { topK: nanoBananaOptions.topK }),
    ...(nanoBananaOptions?.enableGoogleSearch && { tools: [{ googleSearch: {} }] }),
  }

  const modelName = 'gemini-3-pro-image-preview'

  const contents = [
    {
      role: 'user' as const,
      parts: [
        {
          inlineData: {
            mimeType: uploadedImage.file.type || 'image/jpeg',
            data: imageBase64,
          },
        },
        {
          inlineData: {
            mimeType: 'image/png',
            data: modelImageBase64,
          },
        },
        {
          inlineData: {
            mimeType: 'image/png',
            data: wireframeBase64,
          },
        },
        {
          text: prompt,
        },
      ],
    },
  ]

  console.log('Sending wireframe-guided request to Gemini API with model:', modelName)

  const response = await ai.models.generateContent({
    model: modelName,
    config,
    contents,
  })

  if (!response.candidates || !response.candidates[0].content || !response.candidates[0].content.parts) {
    throw new Error('No response from Gemini API')
  }

  const imagePart = response.candidates[0].content.parts.find(part => part.inlineData)

  if (imagePart?.inlineData) {
    console.log('Found image in wireframe-guided response!')
    const { mimeType, data } = imagePart.inlineData
    return `data:${mimeType};base64,${data}`
  }

  const textResponse = response.candidates[0].content.parts
    .filter(part => part.text)
    .map(part => part.text)
    .join('')

  throw new Error(`No image generated with wireframe guide. API Response: ${textResponse || 'No response text'}`)
}

function getStyleDescription(style: VisualizationStyle): string {
  switch (style) {
    case 'Realistic':
      return 'Focus on absolute photorealism. Natural lighting, accurate colors, and realistic textures. The image should look like an unedited photograph.'
    case 'Cinematic':
      return 'Use dramatic lighting, high contrast, and a slightly wider aspect ratio feel. Emphasize mood and atmosphere. Rich colors and deep shadows.'
    case 'Golden Hour':
      return 'Simulate the warm, soft light of sunrise or sunset. Long shadows, golden hues, and a magical, inviting atmosphere.'
    case 'Modern':
      return 'Clean lines, cool tones, and high-key lighting. Emphasize clarity, brightness, and contemporary architectural aesthetics.'
    case 'Rustic':
      return 'Warm, earthy tones. Soft, diffused lighting. Emphasize natural materials and a cozy, welcoming feel.'
    case 'Architectural':
      return 'Focus on structure and form. Balanced composition, vertical lines, and neutral lighting. The image should look like a professional architectural visualization.'
    default:
      return ''
  }
}

export async function conversationalEdit(
  currentImageDataUrl: string,
  editPrompt: string,
  customConfig?: { temperature?: number; topP?: number; topK?: number },
  nanoBananaOptions?: NanoBananaProOptions,
  overrideAspectRatio?: string
): Promise<string> {
  const imageBase64 = currentImageDataUrl.includes('base64,')
    ? currentImageDataUrl.split('base64,')[1]
    : currentImageDataUrl

  const detectedAspectRatio = await detectAspectRatioFromDataUrl(currentImageDataUrl)
  const aspectRatio = overrideAspectRatio || detectedAspectRatio

  const prompt = `TOP PRIORITY: PRESERVE ORIGINAL IMAGE COMPOSITION
CRITICAL: Maintain the EXACT same camera angle, perspective, viewpoint, and composition as the current image. The user's photo composition must be respected absolutely.

Make this specific change to the photograph: ${editPrompt}. CRITICAL PRESERVATION REQUIREMENTS: Keep everything else in the scene exactly as it appears—same composition, positions, and lighting. Do NOT move, resize, rotate, or alter any existing structures (pools, tiny homes, buildings). The existing structures must remain in their exact same location and appearance. NEVER change the camera angle, viewing perspective, or photo crop unless the request explicitly starts with "EXPLICIT USER REQUEST: Change camera perspective" - maintain the identical viewpoint in all other cases. For pool enhancements, ensure all additions naturally integrate with the pool's current orientation and layout geometry. Only add or modify what was specifically requested around the existing elements. The result should look like a real photograph with the requested change naturally integrated while preserving all original elements and camera perspective.`

  console.log(`Using aspect ratio for conversational edit: ${aspectRatio}${overrideAspectRatio ? ' (override)' : ' (detected)'}`)

  const config = {
    temperature: customConfig?.temperature ?? nanoBananaOptions?.temperature ?? 1.0,
    ...(customConfig?.topP && { topP: customConfig.topP }),
    ...(customConfig?.topK && { topK: customConfig.topK }),
    ...(nanoBananaOptions?.topP && !customConfig?.topP && { topP: nanoBananaOptions.topP }),
    ...(nanoBananaOptions?.topK && !customConfig?.topK && { topK: nanoBananaOptions.topK }),
    responseModalities: ['Image'] as string[],
    imageConfig: {
      aspectRatio: aspectRatio,
      imageSize: nanoBananaOptions?.imageSize || '2K',
    },
    ...(nanoBananaOptions?.enableGoogleSearch && { tools: [{ googleSearch: {} }] }),
  }

  const model = 'gemini-3-pro-image-preview'

  const contents = [
    {
      role: 'user' as const,
      parts: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: imageBase64,
          },
        },
        {
          text: prompt,
        },
      ],
    },
  ]

  console.log('Sending conversational edit request to Gemini API')

  const response = await ai.models.generateContent({
    model,
    config,
    contents,
  })

  if (!response.candidates || !response.candidates[0].content || !response.candidates[0].content.parts) {
    throw new Error('No response from Gemini API')
  }

  const imagePart = response.candidates[0].content.parts.find(part => part.inlineData)

  if (imagePart?.inlineData) {
    console.log('Found image in conversational edit response!')
    const { mimeType, data } = imagePart.inlineData
    return `data:${mimeType};base64,${data}`
  }

  const textResponse = response.candidates[0].content.parts
    .filter(part => part.text)
    .map(part => part.text)
    .join('')

  throw new Error(`No image generated for conversational edit. API Response: ${textResponse || 'No response text'}`)
}

// Generate interior views using top-down floor plan reference
export async function generateInteriorView(
  tinyHomeModel: TinyHomeModel,
  interiorRequest: InteriorViewRequest,
  nanoBananaOptions?: NanoBananaProOptions
): Promise<{ imageUrl: string; prompt: string; modelSettings: any }> {

  console.log('🚀 generateInteriorView called with:', {
    modelId: tinyHomeModel.id,
    modelName: tinyHomeModel.name,
    supportsInteriorViews: tinyHomeModel.supportsInteriorViews,
    isTopDownView: tinyHomeModel.isTopDownView,
    cameraPosition: interiorRequest.camera,
    viewType: interiorRequest.viewType
  })

  if (!tinyHomeModel.supportsInteriorViews || !tinyHomeModel.isTopDownView) {
    console.error('❌ Model does not support interior views:', {
      supportsInteriorViews: tinyHomeModel.supportsInteriorViews,
      isTopDownView: tinyHomeModel.isTopDownView
    })
    throw new Error('This tiny home model does not support interior view generation')
  }

  const floorPlanImageBase64 = await fetchImageAsBase64(tinyHomeModel.imageUrl)
  const { camera } = interiorRequest

  // Create detailed interior generation prompt
  const getInteriorPrompt = () => {

    // Calculate viewing direction more clearly
    const getDirection = (angle: number) => {
      if (angle >= 315 || angle < 45) return 'toward the top of the floor plan'
      if (angle >= 45 && angle < 135) return 'toward the right side of the floor plan'
      if (angle >= 135 && angle < 225) return 'toward the bottom of the floor plan'
      return 'toward the left side of the floor plan'
    }

    let basePrompt = `Generate a photorealistic interior photograph of a ${tinyHomeModel.name} tiny home.

REFERENCE IMAGE: The provided image is a top-down architectural floor plan showing the complete layout.

CAMERA POSITION: You are standing inside this tiny home at position ${camera.x}% across (left to right) and ${camera.y}% down (top to bottom) on the floor plan.

VIEWING DIRECTION: From this position, you are looking ${getDirection(camera.viewingAngle)} (${camera.viewingAngle} degrees).

CRITICAL REQUIREMENTS:
1. Study the floor plan carefully to understand room layouts, walls, doors, and windows
2. Show ONLY architectural elements and built-ins visible in the floor plan - do not add storage, closets, or features not shown
3. The view must match what someone would actually see from this exact position looking in this direction
4. Room proportions and spatial relationships must match the floor plan exactly
5. Use the floor plan as your architectural blueprint - it shows the true layout

CAMERA SETTINGS:
- Height: ${camera.height}m above floor (${camera.height <= 1.3 ? 'seated' : 'standing'} eye level)
- Field of view: ${camera.fieldOfView} degrees (${camera.fieldOfView <= 60 ? 'narrow' : camera.fieldOfView <= 90 ? 'normal' : 'wide'} angle)
- Style: ${interiorRequest.viewType} shot

INTERIOR DESIGN: Modern tiny home with clean lines, natural wood, white walls, and efficient built-in solutions. Light, airy, and minimalist aesthetic.${interiorRequest.room ? `\n\nFOCUS AREA: This view should emphasize the ${interiorRequest.room} space.` : ''}

Render this as a professional interior photograph with natural lighting and realistic proportions.`

    return basePrompt
  }

  const prompt = getInteriorPrompt()

  // Enhanced configuration for interior photography
  const accuracyLevel = nanoBananaOptions?.accuracyMode || 'standard'
  const defaultImageSize = accuracyLevel === 'ultra' ? '4K' : (accuracyLevel === 'maximum' ? '2K' : '1K')
  const enableGoogleSearch = nanoBananaOptions?.enableGoogleSearch ||
                            (accuracyLevel === 'ultra' || accuracyLevel === 'maximum')
  const useThinking = nanoBananaOptions?.useThinkingProcess ||
                     (accuracyLevel === 'ultra' || accuracyLevel === 'maximum')

  const config = {
    temperature: nanoBananaOptions?.temperature || 1.0,
    topP: nanoBananaOptions?.topP || 0.95,
    responseModalities: ['Image'] as string[],
    imageConfig: {
      aspectRatio: '16:9', // Standard interior photography aspect ratio
      imageSize: nanoBananaOptions?.imageSize || defaultImageSize,
    },
    ...(nanoBananaOptions?.topK && { topK: nanoBananaOptions.topK }),
    ...(enableGoogleSearch && { tools: [{ googleSearch: {} }] }),
    ...(useThinking && { thinkingBudget: accuracyLevel === 'ultra' ? 2000 : 1000 }),
  }

  const model = 'gemini-3-pro-image-preview'

  const contents = [
    {
      role: 'user' as const,
      parts: [
        {
          inlineData: {
            mimeType: 'image/webp',
            data: floorPlanImageBase64,
          },
        },
        {
          text: prompt,
        },
      ],
    },
  ]

  console.log(`🏠 INTERIOR VIEW DEBUG:`)
  console.log(`- Position: (${camera.x}%, ${camera.y}%)`)
  console.log(`- Viewing angle: ${camera.viewingAngle}°`)
  console.log(`- Height: ${camera.height}m`)
  console.log(`- FOV: ${camera.fieldOfView}°`)
  console.log(`- Floor plan image: ${tinyHomeModel.imageUrl}`)
  console.log(`- Floor plan base64 length: ${floorPlanImageBase64.length}`)
  console.log(`- Prompt preview:`, prompt.substring(0, 200) + '...')

  const ai = new GoogleGenAI({
    apiKey: API_KEY,
  })
  const response = await ai.models.generateContent({
    model,
    config,
    contents,
  })

  console.log(`🔍 API Response received:`, {
    hasCandidates: !!response.candidates,
    candidatesLength: response.candidates?.length,
    hasContent: !!response.candidates?.[0]?.content,
    partsLength: response.candidates?.[0]?.content?.parts?.length
  })

  if (!response.candidates || !response.candidates[0].content || !response.candidates[0].content.parts) {
    console.error('❌ No valid API response structure')
    throw new Error('No response from Gemini API for interior view generation')
  }

  const imagePart = response.candidates[0].content.parts.find(part => part.inlineData)
  const textParts = response.candidates[0].content.parts.filter(part => part.text)

  console.log(`📊 Response analysis:`, {
    hasImagePart: !!imagePart,
    textPartsCount: textParts.length,
    totalParts: response.candidates[0].content.parts.length
  })

  if (imagePart?.inlineData) {
    console.log('✅ Interior view generated successfully!')
    const { mimeType, data } = imagePart.inlineData
    console.log(`🖼️ Image details: ${mimeType}, base64 length: ${data?.length || 0}`)
    return {
      imageUrl: `data:${mimeType};base64,${data}`,
      prompt: prompt,
      modelSettings: config
    }
  }

  const textResponse = textParts
    .map(part => part.text)
    .join('')

  console.error('❌ No image in response. Text response:', textResponse)
  throw new Error(`No interior image generated. API Response: ${textResponse || 'No response text'}`)
}
