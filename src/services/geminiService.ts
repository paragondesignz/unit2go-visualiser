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

  const conversationalPrompt = `Modify this photograph by adjusting only the lighting and atmospheric conditions according to these specifications: ${lightingPrompt}. Preserve everything else in the image exactly as it appears, maintaining identical positions, structures, architectural elements, and overall composition. Only change the lighting quality, shadow characteristics, and atmospheric mood to match the requested conditions while keeping all physical elements unchanged.`

  console.log(`Using aspect ratio for lighting edit: ${aspectRatio}`)

  const config = {
    temperature: 0.2, // Low temperature for highly consistent and deterministic results
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
  lightingPrompt?: string
): Promise<string> {
  const imageBase64 = await fileToBase64(uploadedImage.file)
  const tinyHomeImageBase64 = await fetchImageAsBase64(tinyHomeModel.imageUrl)
  const aspectRatio = await detectAspectRatio(uploadedImage.file)

  // Get tiny home dimensions
  const { length, width, height } = tinyHomeModel.dimensions

  // Create narrative, descriptive prompt following Google's best practices
  const prompt = customPrompt || `Create a photorealistic architectural visualization showing the ${tinyHomeModel.name} tiny home from the second reference image seamlessly integrated into the property scene from the first image. This is for professional real estate marketing purposes.

First, carefully analyze the scene to understand the environment. Look for reference objects that establish scale, such as doors which are typically 2 meters high, windows around 1 to 1.5 meters, chairs about 0.8 meters high, tables roughly 1.5 meters wide, railings at 1 meter height, people approximately 1.7 meters tall, and vehicles around 1.8 meters high. If there are decking boards visible, they are usually 12 to 15 centimeters wide. Determine whether this is an indoor or outdoor setting and identify the ground plane, whether it is decking, patio, lawn, gravel, or concrete. Observe the lighting carefully, noting the direction of sunlight, the quality of light, time of day indicators, and the angles of any existing shadows in the scene. Study the camera perspective and viewing angle to understand the lens characteristics and vanishing points.

The tiny home you are placing measures exactly ${length} meters in length by ${width} meters in width by ${height} meters in height. Using the reference objects you identified, calculate the correct pixel dimensions so the tiny home appears at its true real-world scale relative to everything else in the scene. The proportions must be accurate, neither too large nor too small, and should account for perspective diminishment if placed further from the camera.

Position the tiny home in the most logical and aesthetically pleasing location within the scene. Place it on flat, stable ground such as an existing deck, patio area, lawn, gravel pad, or concrete surface. Ensure there is adequate clearance of approximately 1 meter minimum on all accessible sides. Follow principles of good photographic composition including the rule of thirds and visual balance. Avoid blocking important architectural features or focal points in the original scene. Orient the rectangular structure so it aligns parallel to visible features like fences, pathways, deck edges, or property boundaries. Consider realistic placement typical for tiny homes, favoring prepared surfaces rather than random lawn positions.

The ${tinyHomeModel.name} from the reference image must be reproduced with complete accuracy. Copy the exact design, color palette, and texture details. Preserve the exterior cladding material and finish, the roof style and material, all window placements and styles, and door locations exactly as shown. Maintain every surface detail and the complete architectural style and proportions. Do not add any features not present in the reference such as additional windows, doors, skylights, logos, signage, text, steps, decks, or accessories unless they are clearly visible in the original reference image. Do not modify the design in any way.

Integration with the environment must be seamless and photorealistic. The tiny home should cast shadows that precisely match the direction, length, and softness of existing shadows in the scene based on the sun position and lighting conditions. If the scene shows strong directional sunlight, render crisp directional shadows at the correct angle and length. Match the overall color temperature of the scene, whether it is warm golden hour light, cool overcast conditions, or neutral daylight. The materials of the tiny home should reflect light realistically according to the lighting conditions. Add subtle reflections on any reflective surfaces if appropriate. If the tiny home is placed at a distance from the camera, incorporate atmospheric perspective with slight haziness. ${lightingPrompt ? `Adjust the lighting and atmosphere according to these specific conditions: ${lightingPrompt}. ` : ''}The final result should appear as though the tiny home has always been part of this property, indistinguishable from a photograph taken with professional architectural photography equipment.`

  console.log(`Detected aspect ratio: ${aspectRatio}`)

  const config = {
    temperature: 0.2, // Low temperature for highly consistent and deterministic placement
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
    return `Modify this image by adjusting only the lighting and atmospheric conditions according to these specifications: ${lightingPrompt}. Preserve the tiny home and all other elements in their exact current positions, maintaining the same composition and spatial relationships.`
  }

  let prompt = `Reposition the ${tinyHomeModel.name} tiny home in this scene by making the following adjustments: `

  if (lowerCommand.includes('left')) prompt += 'move the structure to the left side of the scene, '
  if (lowerCommand.includes('right')) prompt += 'move the structure to the right side of the scene, '
  if (lowerCommand.includes('up') || lowerCommand.includes('back')) prompt += 'move the structure further back creating more distance from the camera viewpoint, '
  if (lowerCommand.includes('down') || lowerCommand.includes('forward')) prompt += 'move the structure closer to the camera viewpoint, '

  prompt += 'while maintaining realistic proportions and scale. Preserve the property scene exactly as shown, changing only the position of the tiny home structure.'

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

  const prompt = `Create a photorealistic composite by integrating the ${tinyHomeModel.name} tiny home from the second reference image into the property scene from the first image, following the exact position and placement indicated in the wireframe guide provided in the third image. Orient the rectangular structure parallel to visible features like fences, pathways, deck edges, or property boundaries to ensure natural alignment. Preserve the property photograph exactly as shown, maintaining identical lighting quality, color palette, and background elements. Add only the tiny home structure with realistic shadow casting and reflections that match the existing lighting conditions and the position specified in the wireframe guide.${lightingPrompt ? ` Adjust the lighting and atmosphere according to these conditions: ${lightingPrompt}.` : ''}`

  console.log(`Using aspect ratio for wireframe guide: ${aspectRatio}`)

  const config = {
    temperature: 0.2, // Low temperature for highly consistent and deterministic results
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
  editPrompt: string,
  customConfig?: { temperature?: number; topP?: number; topK?: number }
): Promise<string> {
  const imageBase64 = currentImageDataUrl.includes('base64,')
    ? currentImageDataUrl.split('base64,')[1]
    : currentImageDataUrl

  const aspectRatio = await detectAspectRatioFromDataUrl(currentImageDataUrl)

  const prompt = `Modify this photograph by making only these specific changes: ${editPrompt}. Preserve all other elements in the image exactly as they appear, maintaining identical composition, positioning, and details for everything not explicitly mentioned in the modification request. Only alter what has been specifically requested while keeping the rest of the image unchanged.`

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
