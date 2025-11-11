import { GoogleGenAI } from '@google/genai'
import { UploadedImage, TinyHomeModel, PoolModel, Position, VisualizationResult, isPoolModel } from '../types'

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
  position?: 'center' | 'left' | 'right'
): Promise<VisualizationResult> {

  if (!API_KEY) {
    throw new Error('Gemini API key is not configured. Please add your API key to the .env file.')
  }

  if (mode === 'initial') {
    if (isPoolModel(model)) {
      const result = await generateImageWithPool(uploadedImage, model, undefined, lightingPrompt, position)
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
      const result = await generateImageWithTinyHome(uploadedImage, model, undefined, lightingPrompt, position)
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
      const lightingAdjustedImage = await generateConversationalLightingEdit(currentResultImage, lightingPrompt)

      return {
        imageUrl: lightingAdjustedImage,
        prompt: `Lighting adjustment: ${lightingPrompt}`,
        modelSettings: {
          model: 'gemini-2.5-flash-image',
          temperature: 1.0,
          operation: 'lighting_edit'
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
          position
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
        position
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
  lightingPrompt: string
): Promise<string> {
  const imageBase64 = currentImageDataUrl.includes('base64,')
    ? currentImageDataUrl.split('base64,')[1]
    : currentImageDataUrl

  const aspectRatio = await detectAspectRatioFromDataUrl(currentImageDataUrl)

  const conversationalPrompt = `Adjust the lighting in this photograph to match these conditions: ${lightingPrompt}. Keep all structures, positions, and composition exactly the same. Only change the light quality, shadow direction and softness, and overall atmosphere. This should look like the same scene photographed at a different time of day with natural lighting.`

  console.log(`Using aspect ratio for lighting edit: ${aspectRatio}`)

  const config = {
    temperature: 0.5, // Lower temperature for more consistent lighting adjustments
    responseModalities: ['Image'] as string[],
    imageConfig: {
      aspectRatio: aspectRatio,
    },
  }

  const model = 'gemini-2.5-flash-image'

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
  tinyHomePosition: 'center' | 'left' | 'right' = 'center'
): Promise<{ imageUrl: string; prompt: string; modelSettings: any }> {
  const imageBase64 = await fileToBase64(uploadedImage.file)
  const tinyHomeImageBase64 = await fetchImageAsBase64(tinyHomeModel.imageUrl)
  const aspectRatio = await detectAspectRatio(uploadedImage.file)

  // Get tiny home dimensions
  const { length, width, height } = tinyHomeModel.dimensions

  // Generate random camera specs for variation
  const lenses = ['24-70mm f/2.8', '16-35mm f/4', '70-200mm f/2.8', '35mm f/1.4']
  const isos = ['100', '200', '400']
  const apertures = ['2.8', '4', '5.6', '8']
  const randomLens = lenses[Math.floor(Math.random() * lenses.length)]
  const randomISO = isos[Math.floor(Math.random() * isos.length)]
  const randomAperture = apertures[Math.floor(Math.random() * apertures.length)]

  // Position instructions based on user selection
  const positionInstructions: Record<string, string> = {
    center: 'Position the tiny home in the CENTER of the frame as the dominant focal point. Use center-weighted composition with the tiny home as the main subject.',
    left: 'Position the tiny home on the LEFT side of the frame (left third), allowing more environmental context, scenery, and breathing room on the right side. This creates visual balance and shows more of the property setting.',
    right: 'Position the tiny home on the RIGHT side of the frame (right third), allowing more environmental context, scenery, and breathing room on the left side. This creates visual balance and shows more of the property setting.'
  }

  // Create narrative, descriptive prompt following Google's best practices
  const prompt = customPrompt || `This is a professional real estate photograph showing the ${tinyHomeModel.name} tiny home (${length}m × ${width}m × ${height}m) placed on an actual property.

PHOTOGRAPHY SETUP:
Shot with ${randomLens} lens at ISO ${randomISO}, f/${randomAperture}. Natural daylight with soft, realistic shadows. ${lightingPrompt ? lightingPrompt + '. ' : ''}The image captures authentic depth of field with the tiny home in sharp focus while background elements show subtle natural blur.

SCENE COMPOSITION:
${positionInstructions[tinyHomePosition]} The tiny home sits on stable ground—a lawn, deck, patio, or gravel area. It's oriented parallel to existing features like fences or pathways. The composition uses the rule of thirds with natural leading lines drawing attention to the structure. Foreground shows property details, the tiny home anchors the middle distance, and the background provides environmental context.

SCALE AND PROPORTION:
Match the tiny home's ${length}m length to visible reference objects in the scene: standard doors (2m high), windows (1-1.5m), vehicles (4-5m long), people (1.7m tall). The tiny home must appear at correct real-world scale relative to these elements, accounting for perspective if placed at distance.

TINY HOME APPEARANCE:
Use the exact tiny home from the reference image without modifications. Keep the original exterior colors, materials, window placement, and architectural details. Add only subtle warm interior lighting visible through windows to suggest the space is lived-in. The exterior shows natural weathering and authentic material textures—slight variations in siding color, realistic wood grain, genuine metal finishes.

LIGHTING AND ATMOSPHERE:
Shadows fall naturally with soft edges typical of outdoor diffuse light. The color temperature matches the scene's existing lighting. Materials respond to light realistically—wood absorbs, metal reflects slightly, glass shows subtle reflections. Include atmospheric perspective with slight depth haze if the tiny home is distant.

The result is an authentic photograph—not a rendering—showing how this specific tiny home would actually appear on this property.`

  console.log(`Detected aspect ratio: ${aspectRatio}`)

  const config = {
    temperature: 0.5, // Lower temperature for more consistent and predictable results
    responseModalities: ['Image'] as string[],
    imageConfig: {
      aspectRatio: aspectRatio,
    },
  }

  const model = 'gemini-2.5-flash-image'

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
        topP: config.topP,
        aspectRatio: config.imageConfig.aspectRatio
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
  poolPosition: 'center' | 'left' | 'right' = 'center'
): Promise<{ imageUrl: string; prompt: string; modelSettings: any }> {
  const imageBase64 = await fileToBase64(uploadedImage.file)
  const poolImageBase64 = await fetchImageAsBase64(poolModel.imageUrl)
  const aspectRatio = await detectAspectRatio(uploadedImage.file)

  // Get pool dimensions
  const { length, width, depth } = poolModel.dimensions

  // Generate random camera specs for variation
  const lenses = ['24-70mm f/2.8', '16-35mm f/4', '70-200mm f/2.8', '35mm f/1.4']
  const isos = ['100', '200', '400']
  const apertures = ['2.8', '4', '5.6', '8']
  const randomLens = lenses[Math.floor(Math.random() * lenses.length)]
  const randomISO = isos[Math.floor(Math.random() * isos.length)]
  const randomAperture = apertures[Math.floor(Math.random() * apertures.length)]

  // Position instructions based on user selection
  const positionInstructions: Record<string, string> = {
    center: 'Position the pool in the CENTER of the frame as the dominant focal point. Use center-weighted composition with the pool as the main subject.',
    left: 'Position the pool on the LEFT side of the frame (left third), allowing more environmental context, scenery, and breathing room on the right side. This creates visual balance and shows more of the property setting.',
    right: 'Position the pool on the RIGHT side of the frame (right third), allowing more environmental context, scenery, and breathing room on the left side. This creates visual balance and shows more of the property setting.'
  }

  // Create narrative, descriptive prompt that emphasizes converting diagram to photorealistic pool
  // IMPORTANT: Reference images are sent in order: [0] = property photo, [1] = pool diagram
  const prompt = customPrompt || `You are creating a photorealistic pool visualization. 

REFERENCE IMAGE ANALYSIS:
The SECOND image (image [1]) is a pool diagram showing the EXACT shape you must replicate. Look at this diagram carefully:
- Study its outline, curves, corners, and angles
- Note the length-to-width ratio
- Identify any unique features (rounded ends, steps, curves, etc.)
- This is the SHAPE TEMPLATE you must follow EXACTLY

TASK: Convert diagram to photorealistic pool while preserving EXACT shape
1. Take the EXACT outline/shape from the second image (the pool diagram)
2. Trace that outline precisely - do not modify, simplify, or approximate
3. Fill that EXACT shape with photorealistic water and materials
4. Integrate it naturally into the first image (the property photo)

CRITICAL SHAPE RULES:
- The pool's perimeter MUST match the diagram's perimeter exactly
- Same curves, same corners, same angles - pixel-perfect shape match
- Same length-to-width ratio
- Same orientation/angle
- DO NOT simplify complex curves
- DO NOT round corners that aren't rounded in the diagram
- DO NOT add features not in the diagram
- ONLY change visual style (diagram → photorealistic), NOT the shape

This is a professional real estate photograph showing a swimming pool (${length}m × ${width}m × ${depth}m deep) integrated into an actual property.

PHOTOGRAPHY SETUP:
Shot with ${randomLens} lens at ISO ${randomISO}, f/${randomAperture}. Natural daylight with soft, realistic shadows. ${lightingPrompt ? lightingPrompt + '. ' : ''}The image captures authentic depth of field with the pool in sharp focus while background elements show subtle natural blur.

SCENE COMPOSITION:
${positionInstructions[poolPosition]} The pool is properly integrated into the property—sitting at ground level with natural landscaping, decking, or patio surrounding it.

ALIGNMENT WITH EXISTING STRUCTURES:
- Align the pool's edges parallel to nearby fences, deck edges, patios, or building foundations
- If there are visible fences, align the pool's longest edge parallel to the fence line
- If there are decks or patios, align the pool to complement their orientation and edges
- If there are pathways or driveways, orient the pool to respect their direction and layout
- Match the pool's orientation to the dominant geometric lines in the property (buildings, property boundaries, etc.)
- The pool should look intentionally placed, not randomly oriented—it should feel like it was designed to work with the existing property features

The composition uses the rule of thirds with natural leading lines drawing attention to the pool. Foreground shows property details, the pool anchors the middle distance, and the background provides environmental context.

SCALE AND PROPORTION:
Match the pool's ${length}m length to visible reference objects in the scene: standard doors (2m high), windows (1-1.5m), vehicles (4-5m long), people (1.7m tall), outdoor furniture. The pool must appear at correct real-world scale relative to these elements, accounting for perspective if placed at distance. CRITICAL: When scaling, maintain the EXACT shape proportions from the diagram - do not distort or change the shape.

POOL APPEARANCE:
The pool must have the IDENTICAL shape to the diagram (second image), rendered photorealistically:
- Shape: EXACT match to diagram outline - trace it precisely from the second image
- Water: realistic depth, transparency, natural color (turquoise/blue), subtle surface reflections
- Materials: realistic pool shell (concrete/fiberglass), coping/tile edges matching property style
- Details: proper water level, realistic edge treatments, natural integration
- Integration: landscaping around pool, proper ground level, natural shadows

LIGHTING AND ATMOSPHERE:
Shadows fall naturally with soft edges typical of outdoor diffuse light. The color temperature matches the scene's existing lighting. Water reflects the sky and surroundings realistically. Pool materials respond to light realistically—concrete/tile shows texture, water shows depth and transparency. Include atmospheric perspective with slight depth haze if the pool is distant.

VERIFICATION:
Before completing, verify: Does the pool shape match the diagram (second image) EXACTLY? The outline, curves, corners, and proportions must be identical. Only the visual style should differ (diagram → photorealistic), NOT the shape itself.

The result is an authentic photograph showing how this SPECIFIC pool design (with its EXACT shape from the diagram) would actually appear when built on this property.`

  console.log(`Detected aspect ratio: ${aspectRatio}`)

  const config = {
    temperature: 0.3, // Lower temperature for more consistent results and better shape adherence
    topP: 0.1, // Low topP focuses on the most probable outputs, minimizing diversity
    responseModalities: ['Image'] as string[],
    imageConfig: {
      aspectRatio: aspectRatio,
    },
  }

  const model = 'gemini-2.5-flash-image'

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
        aspectRatio: config.imageConfig.aspectRatio
      }
    }
  }

  const textResponse = response.candidates[0].content.parts
    .filter(part => part.text)
    .map(part => part.text)
    .join('')

  throw new Error(`No pool image generated. API Response: ${textResponse || 'No response text'}`)
}

/**
 * Map ratio value to closest Gemini-supported aspect ratio string
 * Supported: "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"
 */
function mapToAspectRatio(ratio: number): string {
  // Map to closest supported aspect ratio
  if (Math.abs(ratio - 1) < 0.1) return "1:1"
  if (Math.abs(ratio - 4/3) < 0.1) return "4:3"
  if (Math.abs(ratio - 3/4) < 0.1) return "3:4"
  if (Math.abs(ratio - 16/9) < 0.1) return "16:9"
  if (Math.abs(ratio - 9/16) < 0.1) return "9:16"
  if (Math.abs(ratio - 3/2) < 0.1) return "3:2"
  if (Math.abs(ratio - 2/3) < 0.1) return "2:3"
  if (Math.abs(ratio - 5/4) < 0.1) return "5:4"
  if (Math.abs(ratio - 4/5) < 0.1) return "4:5"
  if (Math.abs(ratio - 21/9) < 0.1) return "21:9"

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
  lightingPrompt?: string
): Promise<string> {
  const imageBase64 = await fileToBase64(uploadedImage.file)
  const modelImageBase64 = await fetchImageAsBase64(model.imageUrl)
  const wireframeBase64 = wireframeGuideDataUrl.includes('base64,')
    ? wireframeGuideDataUrl.split('base64,')[1]
    : wireframeGuideDataUrl
  const aspectRatio = await detectAspectRatio(uploadedImage.file)

  const modelType = isPoolModel(model) ? 'pool' : 'tiny home'
  const prompt = `This is a real estate photograph showing the ${model.name} ${modelType} placed on a property. Use the wireframe guide (third image) to position the ${modelType} exactly where indicated in the property photo (first image). Match the ${modelType}'s appearance from the reference (second image) while ensuring it looks naturally integrated with realistic shadows, lighting, and scale. ${isPoolModel(model) ? 'Convert the pool diagram into a photorealistic pool with realistic water, materials, and integration.' : 'Orient it parallel to visible features like fences or pathways.'} The result should be an authentic photograph.${lightingPrompt ? ` Use these lighting conditions: ${lightingPrompt}.` : ''}`

  console.log(`Using aspect ratio for wireframe guide: ${aspectRatio}`)

  const config = {
    temperature: 0.5, // Lower temperature for more consistent positioning
    responseModalities: ['Image'] as string[],
    imageConfig: {
      aspectRatio: aspectRatio,
    },
  }

  const modelName = 'gemini-2.5-flash-image'

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

export async function conversationalEdit(
  currentImageDataUrl: string,
  editPrompt: string,
  customConfig?: { temperature?: number; topP?: number; topK?: number }
): Promise<string> {
  const imageBase64 = currentImageDataUrl.includes('base64,')
    ? currentImageDataUrl.split('base64,')[1]
    : currentImageDataUrl

  const aspectRatio = await detectAspectRatioFromDataUrl(currentImageDataUrl)

  const prompt = `Make this specific change to the photograph: ${editPrompt}. Keep everything else in the scene exactly as it appears—same composition, positions, and lighting. Only modify what was requested. The result should look like a real photograph with the requested change naturally integrated.`

  console.log(`Using aspect ratio for conversational edit: ${aspectRatio}`)

  const config = {
    temperature: customConfig?.temperature ?? 0.2,
    ...(customConfig?.topP && { topP: customConfig.topP }),
    ...(customConfig?.topK && { topK: customConfig.topK }),
    responseModalities: ['Image'] as string[],
    imageConfig: {
      aspectRatio: aspectRatio,
    },
  }

  const model = 'gemini-2.5-flash-image'

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
