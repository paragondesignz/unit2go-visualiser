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

  const conversationalPrompt = `CRITICAL LIGHTING-ONLY EDIT:

This image shows a user's uploaded photo with a tiny home already placed in it.

ABSOLUTE REQUIREMENTS:
1. The user's original photo MUST remain EXACTLY as is
   - DO NOT change proportions, perspective, or composition
   - DO NOT recreate or redraw the scene
   - PRESERVE all original details and framing

2. Keep EXACTLY ONE tiny home in its current position and appearance
   - NEVER add additional tiny homes
   - NEVER duplicate the existing tiny home
   - Keep the tiny home in its exact position

3. ONLY adjust lighting, shadows, and sky colors as specified:
   ${lightingPrompt}

CRITICAL: This is a lighting adjustment ONLY. Preserve everything else exactly. EXACTLY ONE tiny home, original photo composition unchanged.`

  const config = {
    responseModalities: ['IMAGE', 'TEXT'] as string[],
  }

  const model = 'gemini-2.5-flash-image-preview'

  const contents = [
    {
      role: 'user' as const,
      parts: [
        {
          text: conversationalPrompt,
        },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBase64,
          },
        },
      ],
    },
  ]

  console.log('Sending conversational lighting edit to Gemini API')

  const response = await ai.models.generateContentStream({
    model,
    config,
    contents,
  })

  let generatedImageData: string | null = null
  let textResponse = ''

  for await (const chunk of response) {
    if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
      continue
    }

    for (const part of chunk.candidates[0].content.parts) {
      if (part.inlineData) {
        console.log('Found lighting-edited image in response!')
        const { mimeType, data } = part.inlineData
        generatedImageData = `data:${mimeType};base64,${data}`
        break
      } else if (part.text) {
        textResponse += part.text
        console.log('Text response:', part.text)
      }
    }

    if (generatedImageData) break
  }

  if (generatedImageData) {
    return generatedImageData
  }

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

  const prompt = customPrompt || `ABSOLUTE CRITICAL REQUIREMENTS - READ CAREFULLY:

The FIRST image is the user's uploaded photo - this MUST remain EXACTLY as photographed.
The SECOND image shows the tiny home model to place into the scene.

YOUR TASK: Place/composite the tiny home FROM the second image INTO the first image.

CRITICAL RULES - DO NOT VIOLATE:
1. The first image (user's photo) MUST remain EXACTLY as uploaded
   - DO NOT change proportions, perspective, angle, or composition of the uploaded photo
   - DO NOT recreate or redraw the scene
   - DO NOT alter any existing elements in the uploaded photo
   - PRESERVE the exact framing, camera angle, and all original details

2. ONLY add the tiny home INTO this preserved scene:
   - Copy the tiny home's exact appearance from the second image
   - Place it naturally on the ground surface visible in the first image
   - The tiny home is ${tinyHomeModel.dimensions.length}m x ${tinyHomeModel.dimensions.width}m x ${tinyHomeModel.dimensions.height}m
   - Scale it accurately using objects in the scene (doors ~2m, people ~1.7m, cars ~4.5m)
   - Add realistic shadows beneath the tiny home to ground it in the scene
   - Ensure lighting matches the original photo's lighting conditions

3. Placement rules:
   - Place ONLY ONE tiny home
   - Position it on the ground (grass, gravel, concrete, dirt, etc.)
   - Make it look naturally integrated into the existing scene
   - Do not obstruct important elements unless naturally positioned there

CRITICAL: This is a COMPOSITING task - preserve the user's original image and add the tiny home into it. Do NOT regenerate or recreate the scene.${lightingPrompt ? ` Lighting adjustment: ${lightingPrompt}` : ''}`

  const config = {
    responseModalities: ['IMAGE', 'TEXT'] as string[],
  }

  const model = 'gemini-2.5-flash-image-preview'

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
            data: tinyHomeImageBase64,
          },
        },
      ],
    },
  ]

  console.log('Sending request to Gemini API with model:', model)

  const response = await ai.models.generateContentStream({
    model,
    config,
    contents,
  })

  let generatedImageData: string | null = null
  let textResponse = ''

  for await (const chunk of response) {
    if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
      continue
    }

    for (const part of chunk.candidates[0].content.parts) {
      if (part.inlineData) {
        console.log('Found image in response!')
        const { mimeType, data } = part.inlineData
        generatedImageData = `data:${mimeType};base64,${data}`
        break
      } else if (part.text) {
        textResponse += part.text
        console.log('Text response:', part.text)
      }
    }

    if (generatedImageData) break
  }

  if (generatedImageData) {
    return generatedImageData
  }

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
    return `CRITICAL: Change ONLY lighting. EXACTLY ONE tiny home must remain - NEVER add or duplicate tiny homes. Keep the user's original uploaded photo EXACTLY as is - only adjust lighting. Apply: ${lightingPrompt}`
  }

  let prompt = `CRITICAL COMPOSITING TASK:
- The user's uploaded photo MUST remain EXACTLY as photographed - preserve all proportions, perspective, and framing
- ONLY adjust the tiny home's position as requested below
- This is a GROUND-LEVEL tiny home (${tinyHomeModel.dimensions.length}m x ${tinyHomeModel.dimensions.width}m x ${tinyHomeModel.dimensions.height}m)
- Maintain proper scale using doors (~2m high), windows (~1-1.5m wide) as references

Position adjustment: `

  if (lowerCommand.includes('left')) prompt += 'Move tiny home left. '
  if (lowerCommand.includes('right')) prompt += 'Move tiny home right. '
  if (lowerCommand.includes('up') || lowerCommand.includes('back')) prompt += 'Move tiny home back. '
  if (lowerCommand.includes('down') || lowerCommand.includes('forward')) prompt += 'Move tiny home forward. '

  prompt += '\n\nCRITICAL: DO NOT recreate the scene. Preserve the user\'s original photo exactly and only move the tiny home.'

  if (lightingPrompt) prompt += ` Lighting: ${lightingPrompt}`

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
