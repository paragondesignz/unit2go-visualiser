import { GoogleGenAI } from '@google/genai'
import { UploadedImage, TinyHomeModel, Position, VisualizationResult } from '../types'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''

if (!API_KEY) {
  console.error('Gemini API key is missing. Please add VITE_GEMINI_API_KEY to your .env file')
}

const ai = new GoogleGenAI({
  apiKey: API_KEY,
})

export async function processWithGemini(
  uploadedImage: UploadedImage,
  tinyHomeModel: TinyHomeModel,
  mode: 'initial' | 'adjust',
  command?: string,
  currentPosition?: Position,
  lightingPrompt?: string,
  currentResultImage?: string
): Promise<VisualizationResult> {

  if (!API_KEY) {
    throw new Error('Gemini API key is not configured. Please add your API key to the .env file.')
  }

  if (mode === 'initial') {
    const generatedImage = await generateImageWithTinyHome(uploadedImage, tinyHomeModel, undefined, lightingPrompt)

    return {
      imageUrl: generatedImage,
      position: {
        x: 50,
        y: 50,
        scale: 1,
        rotation: 0
      }
    }
  } else {
    const isLightingOnly = command?.toLowerCase().includes('change lighting only') || command?.toLowerCase().includes('maintain current position')

    if (isLightingOnly && currentResultImage && lightingPrompt) {
      const lightingAdjustedImage = await generateConversationalLightingEdit(currentResultImage, lightingPrompt)

      return {
        imageUrl: lightingAdjustedImage,
        position: currentPosition || { x: 50, y: 50, scale: 1, rotation: 0 }
      }
    } else {
      const newPosition = adjustPositionByCommand(command || '', currentPosition || {
        x: 50,
        y: 50,
        scale: 1,
        rotation: 0
      })

      const adjustedImage = await generateImageWithTinyHome(
        uploadedImage,
        tinyHomeModel,
        commandToPrompt(command || '', tinyHomeModel, lightingPrompt),
        lightingPrompt
      )

      return {
        imageUrl: adjustedImage,
        position: newPosition
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

  const conversationalPrompt = `Using the provided photograph, change only the lighting and atmosphere: ${lightingPrompt}. Keep everything else exactly the same - same positions, same structures, same composition. Only adjust lighting, shadows, and atmospheric conditions.`

  console.log(`Using aspect ratio for lighting edit: ${aspectRatio}`)

  const config = {
    temperature: 0.6, // Balanced temperature for creative yet consistent results
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

        ctx.globalAlpha = 0.4
        ctx.fillStyle = 'black'
        ctx.fillText('www.unit2go.co.nz', textX + 1, textY + 1)

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
  lightingPrompt?: string
): Promise<string> {
  const imageBase64 = await fileToBase64(uploadedImage.file)
  const tinyHomeImageBase64 = await fetchImageAsBase64(tinyHomeModel.imageUrl)
  const aspectRatio = await detectAspectRatio(uploadedImage.file)

  // Get tiny home dimensions
  const { length, width, height } = tinyHomeModel.dimensions

  // Create detailed, step-by-step prompt following Google's best practices
  const prompt = customPrompt || `You are an expert at photo composition and 3D placement. Analyze this scene and place the tiny home from the reference image into the property photo with PERFECT sizing and positioning.

🎯 CRITICAL TASK STEPS:

STEP 1: ANALYZE THE SCENE
- Identify ALL reference objects for scale (doors ~2m high, windows ~1-1.5m, chairs ~0.8m high, tables ~1.5m, railings ~1m, people ~1.7m, vehicles ~1.8m high, decking boards ~12-15cm wide)
- Determine if this is indoor or outdoor
- Identify the ground plane (deck, patio, lawn, gravel, concrete, etc.)
- Note the lighting direction, quality, and time of day (sun position, shadow angles)
- Identify the camera perspective and viewing angle

STEP 2: CALCULATE TINY HOME SIZE
This tiny home is EXACTLY ${length}m x ${width}m x ${height}m (length x width x height).
- Use identified reference objects to calculate the correct pixel size for the tiny home
- Ensure the tiny home appears at the EXACT real-world scale relative to all objects in the scene
- The tiny home must be proportionally accurate - not too large, not too small
- Consider perspective: objects further away appear smaller

STEP 3: DETERMINE BEST POSITION
Find the most logical and aesthetically pleasing position:
- Place on flat, stable ground (deck, patio, lawn, gravel pad, concrete)
- Ensure adequate clearance around the tiny home (~1m minimum on all sides for access)
- Follow good photographic composition (rule of thirds, visual balance)
- Avoid blocking important scene elements
- Orient the rectangular structure parallel to visible features like fences, paths, decks, or property boundaries
- Consider typical placement for tiny homes (not in the middle of a lawn, but on prepared surfaces)

STEP 4: MATCH THE ENVIRONMENT
- Match lighting precisely (shadows must fall correctly based on sun position and time of day)
- Match perspective (tiny home must follow scene's perspective lines and vanishing points)
- Integrate naturally (tiny home should look like it has always been part of this space)
- Add proper shadows that match the direction, length, and softness of existing shadows in the scene
- Add subtle reflections if there are reflective surfaces nearby
- Ensure the tiny home's materials reflect light realistically for the conditions
${lightingPrompt ? `- Lighting conditions: ${lightingPrompt}` : ''}

🏠 TINY HOME APPEARANCE REQUIREMENTS:

The ${tinyHomeModel.name} from the reference image must be reproduced EXACTLY:
✓ Copy the EXACT tiny home design, color, and texture from the reference
✓ Keep the same exterior cladding, roof style, windows, and door placement
✓ Preserve all surface details exactly as shown in the reference
✓ Maintain the architectural style and proportions

❌ DO NOT add any features not in the reference:
- NO additional windows, doors, or skylights (unless visible in reference)
- NO logos, signage, or text
- NO steps, decks, or accessories (unless in reference)
- NO modifications to the design

🎨 INTEGRATION REQUIREMENTS:

- Tiny home must cast appropriate shadows based on scene lighting (direction, length, softness)
- If there's sunlight, show directional shadows with correct angle and length
- Match the color temperature of the scene (warm sunset, cool overcast, etc.)
- Add atmospheric perspective if the tiny home is placed far from camera
- Integrate seamlessly - it should look like a professional architectural visualization
- Maintain photorealistic quality throughout

OUTPUT:
Generate the final composited image with the tiny home perfectly placed, sized, and integrated into the scene. The result should look like a professional real estate or marketing photograph where the tiny home has always been part of this property.`

  console.log(`Detected aspect ratio: ${aspectRatio}`)

  const config = {
    temperature: 0.6, // Balanced temperature for creative yet consistent placement
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
    return `data:${mimeType};base64,${data}`
  }

  const textResponse = response.candidates[0].content.parts
    .filter(part => part.text)
    .map(part => part.text)
    .join('')

  throw new Error(`No image generated. API Response: ${textResponse || 'No response text'}`)
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

function commandToPrompt(command: string, tinyHomeModel: TinyHomeModel, lightingPrompt?: string): string {
  const lowerCommand = command.toLowerCase()

  if (lowerCommand.includes('change lighting only') || lowerCommand.includes('maintain current position')) {
    return `Adjust only the lighting and atmospheric conditions: ${lightingPrompt}. Keep the tiny home and all other elements in their current positions.`
  }

  let prompt = `Reposition the ${tinyHomeModel.name} tiny home in this scene: `

  if (lowerCommand.includes('left')) prompt += 'move it to the left, '
  if (lowerCommand.includes('right')) prompt += 'move it to the right, '
  if (lowerCommand.includes('up') || lowerCommand.includes('back')) prompt += 'move it further back, '
  if (lowerCommand.includes('down') || lowerCommand.includes('forward')) prompt += 'move it closer, '

  prompt += 'keeping realistic proportions. Keep the property scene unchanged except for the tiny home position.'

  if (lightingPrompt) prompt += ` Lighting conditions: ${lightingPrompt}`

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
  tinyHomeModel: TinyHomeModel,
  wireframeGuideDataUrl: string,
  lightingPrompt?: string
): Promise<string> {
  const imageBase64 = await fileToBase64(uploadedImage.file)
  const tinyHomeImageBase64 = await fetchImageAsBase64(tinyHomeModel.imageUrl)
  const wireframeBase64 = wireframeGuideDataUrl.includes('base64,')
    ? wireframeGuideDataUrl.split('base64,')[1]
    : wireframeGuideDataUrl
  const aspectRatio = await detectAspectRatio(uploadedImage.file)

  const prompt = `Using the provided property photo, add only the ${tinyHomeModel.name} tiny home from the second image at the position shown in the wireframe guide (third image). Orient the rectangular structure parallel to visible features like fences, paths, decks, or property boundaries. Keep the property photo exactly the same - same lighting, same colors, same background. Only add the tiny home with realistic shadows and reflections matching the wireframe position.${lightingPrompt ? ` ${lightingPrompt}` : ''}`

  console.log(`Using aspect ratio for wireframe guide: ${aspectRatio}`)

  const config = {
    temperature: 0.6, // Balanced temperature for creative yet consistent results
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

  console.log('Sending wireframe-guided request to Gemini API with model:', model)

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
  editPrompt: string
): Promise<string> {
  const imageBase64 = currentImageDataUrl.includes('base64,')
    ? currentImageDataUrl.split('base64,')[1]
    : currentImageDataUrl

  const aspectRatio = await detectAspectRatioFromDataUrl(currentImageDataUrl)

  const prompt = `Using the provided photograph, change only: ${editPrompt}. Keep everything else exactly the same. Only modify what was specifically requested.`

  console.log(`Using aspect ratio for conversational edit: ${aspectRatio}`)

  const config = {
    temperature: 0.6, // Balanced temperature for creative yet consistent results
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
