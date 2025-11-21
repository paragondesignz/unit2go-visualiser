import { GoogleGenAI } from '@google/genai'
import { UploadedImage, TinyHomeModel, PoolModel, Position, VisualizationResult, isPoolModel, VisualizationStyle, NanoBananaProOptions } from '../types'

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
    const useThinking = nanoBananaOptions?.useThinkingProcess && accuracyLevel !== 'standard'
    const preserveLighting = nanoBananaOptions?.preserveOriginalLighting && !lightingPrompt

    let basePrompt = `PRIMARY OBJECTIVE: ACHIEVE 100% PRODUCT ACCURACY FOR ${tinyHomeModel.name} INTEGRATION.

You are performing ultra-precise architectural visualization using Google Nano Banana Pro's advanced capabilities for professional real estate photography.

${useThinking ? `STEP 1: ARCHITECTURAL ANALYSIS (Use thinking process)
Before generating the image, analyze the tiny home reference image [1] and document:
- Exact architectural features (windows, doors, roof type, siding)
- Proportions and scale relationships
- Unique design elements (dormers, porches, chimneys)
- Color scheme and material finishes
- Foundation/base structure details
Document these elements for perfect replication.

` : ''}Professional Photography Standards: Shoot with architectural photography standards using 85mm lens perspective, f/8 aperture for optimal clarity, tripod-mounted with perspective correction. Maintain marketing-grade composition and lighting quality.

Input Specification

Image [0]: The property scene - your canvas for integration.

Image [1]: Tiny home reference image - THIS IS THE EXACT ARCHITECTURAL TEMPLATE.

UNBREAKABLE RULES: ARCHITECTURAL PRECISION (100% ACCURACY REQUIRED)

Your CRITICAL task is to render the tiny home from Image [1] into Image [0] with IDENTICAL architectural features and proportions.

MANDATORY ARCHITECTURAL CONSTRAINTS:
- EXACT FEATURES: Every window, door, roofline, and detail from Image [1] must be replicated perfectly
- NO ADDED FEATURES: Do not add windows, dormers, porches, or details not visible in Image [1]
- PERFECT PROPORTIONS: Length, width, and height ratios must match Image [1] precisely
- ACCURATE MATERIALS: Siding, roofing, trim colors must match the reference exactly
- IDENTICAL STYLE: Architectural style (modern, rustic, traditional) must be preserved

This is precision architectural replication, not creative interpretation. Feature accuracy overrides ALL other considerations.

${accuracyLevel === 'ultra' ? `ULTRA ACCURACY MODE ACTIVE:
- Generate at maximum resolution (4K) for architectural detail verification
- Use Google Search grounding for factual tiny home specifications
- Apply multi-step verification for architectural compliance
- Implement advanced architectural recognition algorithms

` : ''}Scene Analysis & Integration:
Analyze the property photograph (Image [0]) to understand terrain characteristics, natural lighting direction and intensity, available placement areas, and existing architectural elements. Integrate the tiny home as a naturally-placed structure that belongs in this environment.

Optimal Placement Logic:
Determine the most effective positioning within the scene based on:
- Available flat or gently sloped areas suitable for foundation placement
- Visual composition that showcases both the property and tiny home effectively
- Natural sight lines and accessibility considerations
- Relationship to existing structures, boundaries, and landscape features

Scale & Proportion Accuracy:
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

Ground Integration & Materials:
Create seamless ground transition between the tiny home foundation and existing surface (grass, gravel, concrete, etc.). Include appropriate foundation details, utility connections where visible, and natural landscape integration around the structure.

${customPrompt ? `Additional Requirements: ${customPrompt}` : ''}
${stylePrompt}`

    if (nanoBananaOptions?.enableGeometricVerification) {
      basePrompt += `

FINAL ARCHITECTURAL VERIFICATION CHECKLIST:
1. Does the tiny home architecture match Image [1] exactly? (Must be YES)
2. Are all windows, doors, and features identical to reference? (Must be YES)
3. Do the proportions and scale match the reference precisely? (Must be YES)
4. Are materials and colors accurate to the reference? (Must be YES)
If any answer is incorrect, the generation has FAILED and must be corrected.`
    } else {
      basePrompt += `

FINAL VERIFICATION: Confirm that the tiny home's architectural features match Image [1] exactly, scale matches real-world proportions relative to visible reference points, shadows align precisely with the property's lighting direction, ground integration appears naturally established, and the overall composition maintains professional real estate photography standards suitable for premium marketing materials.`
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
  const useThinking = nanoBananaOptions?.useThinkingProcess ||
                     (accuracyLevel === 'ultra' || accuracyLevel === 'maximum')

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
    ...(useThinking && { thinkingBudget: accuracyLevel === 'ultra' ? 2000 : 1000 }),
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
  const { length } = poolModel.dimensions

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

    let basePrompt = `PRIMARY DIRECTIVE: ACHIEVE 100% PRODUCT ACCURACY AND SHAPE FIDELITY.

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

This is precision engineering, not creative interpretation. Shape accuracy overrides ALL other considerations.

${accuracyLevel === 'ultra' ? `ULTRA ACCURACY MODE ACTIVE:
- Generate at maximum resolution (4K) for detail verification
- Use Google Search grounding for factual pool specifications
- Apply multi-step verification for geometric compliance
- Implement advanced shape recognition algorithms

` : ''}Secondary Task: Professional Integration

After guaranteeing 100% shape fidelity, execute these requirements:

1. Optimal Placement: Determine the most effective pool position within the property based on available space, natural sight lines, accessibility, and visual composition that showcases the pool effectively.

2. Precise Scaling: The pool measures ${length}m in length. Scale accurately using visible reference elements: standard doors (8 feet), fence panels (6 feet), and existing structures in Image [0].${uploadedImage.increasedAccuracy && uploadedImage.personHeight ? ` CRITICAL: Use person height reference (${uploadedImage.personHeight}cm) for precise scaling ratio. Pool should measure ${(poolModel.dimensions.length / (uploadedImage.personHeight / 100)).toFixed(1)} times the person's height. REMOVE person from final image.` : ''}

3. Advanced Water Rendering: Create crystal clear water with natural surface tension, realistic light refraction patterns, subtle movement ripples, and depth transparency. Water should appear inviting and professionally maintained.`

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

5. Premium Material Integration: Pool coping, tiles, and finish materials should integrate naturally with the property's existing materials and landscaping. Include appropriate decking transitions and utility considerations.

${stylePrompt}`

    if (nanoBananaOptions?.enableGeometricVerification) {
      basePrompt += `

FINAL GEOMETRIC VERIFICATION CHECKLIST:
1. Does the pool shape in the output match Image [1] exactly? (Must be YES)
2. Are there any added features not visible in Image [1]? (Must be NO)
3. Do the proportions match the reference image precisely? (Must be YES)
4. Is the scaling accurate to real-world dimensions? (Must be YES)
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
  nanoBananaOptions?: NanoBananaProOptions
): Promise<string> {
  const imageBase64 = currentImageDataUrl.includes('base64,')
    ? currentImageDataUrl.split('base64,')[1]
    : currentImageDataUrl

  const aspectRatio = await detectAspectRatioFromDataUrl(currentImageDataUrl)

  const prompt = `Make this specific change to the photograph: ${editPrompt}. Keep everything else in the scene exactly as it appears—same composition, positions, and lighting. Only modify what was requested. The result should look like a real photograph with the requested change naturally integrated.`

  console.log(`Using aspect ratio for conversational edit: ${aspectRatio}`)

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
