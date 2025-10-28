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

  const conversationalPrompt = `This photograph shows a property with a tiny home on it. Adjust the lighting and atmosphere: ${lightingPrompt}

Keep all elements in their current positions. Only change the lighting, shadows, sky colors, and atmospheric conditions to match the request.`

  const config = {
    responseModalities: ['IMAGE', 'TEXT'] as string[],
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

  if (!response.candidates || !response.candidates[0].content) {
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

  const prompt = customPrompt || `Take the property photo from the first image and the ${tinyHomeModel.name} tiny home (${tinyHomeModel.dimensions.length}m × ${tinyHomeModel.dimensions.width}m × ${tinyHomeModel.dimensions.height}m) from the second image.

Composite the tiny home onto the property so it looks like it was there when the photo was taken. Make it appear as a realistic outdoor structure with natural weathering, realistic shadows beneath it, and windows that reflect the sky from the property photo. Match the lighting direction and color temperature from the property photo exactly.

Keep the property photo unchanged except where the tiny home is placed. The tiny home should be properly scaled - use visible objects for reference (doors are 2m tall, cars are 4.5m long).${lightingPrompt ? ` Lighting conditions: ${lightingPrompt}` : ''}`

  const config = {
    responseModalities: ['IMAGE', 'TEXT'] as string[],
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

  if (!response.candidates || !response.candidates[0].content) {
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

  const prompt = `Take the property photo from the first image, the ${tinyHomeModel.name} tiny home (${tinyHomeModel.dimensions.length}m × ${tinyHomeModel.dimensions.width}m × ${tinyHomeModel.dimensions.height}m) from the second image, and the wireframe positioning guide from the third image.

Composite the tiny home onto the property matching the exact position, angle, and scale shown in the wireframe. Make it look like a realistic outdoor structure with natural weathering, realistic shadows, and windows reflecting the sky. Match the lighting from the property photo exactly.

Keep the property photo unchanged except where the tiny home is placed.${lightingPrompt ? ` Lighting conditions: ${lightingPrompt}` : ''}`

  const config = {
    responseModalities: ['IMAGE', 'TEXT'] as string[],
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

  if (!response.candidates || !response.candidates[0].content) {
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

  const prompt = `This photograph shows a property with a tiny home on it. Make this change: ${editPrompt}

Apply the change naturally with photographic realism. Keep elements not mentioned in the request unchanged from the input photograph.`

  const config = {
    responseModalities: ['IMAGE', 'TEXT'] as string[],
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

  if (!response.candidates || !response.candidates[0].content) {
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
