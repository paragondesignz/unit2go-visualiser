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

This image shows the user's photo with a tiny home already composited into it.

OUTPUT REQUIREMENTS - VIOLATION WILL FAIL:
1. Output dimensions MUST match the input image EXACTLY
   - DO NOT change image size, aspect ratio, or resolution
   - This is the SAME image with lighting adjusted

2. PRESERVE the user's original photo COMPLETELY:
   - DO NOT change proportions, perspective, or composition
   - DO NOT recreate or redraw anything
   - PRESERVE all original details, framing, and the existing tiny home

3. Keep EXACTLY ONE tiny home in its current position:
   - NEVER add, duplicate, or remove the tiny home
   - Keep it in EXACT same position and appearance

4. ONLY adjust lighting, shadows, and sky colors:
   ${lightingPrompt}

CRITICAL: This is lighting adjustment ONLY on the EXISTING composite image. Same dimensions, same scene, same tiny home position - ONLY lighting changes.`

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

  const prompt = customPrompt || `ABSOLUTE CRITICAL COMPOSITING TASK:

IMAGE 1 (User's Photo): This is the BASE image. The output MUST be the SAME SIZE and preserve this EXACTLY.
IMAGE 2 (Tiny Home Reference): This shows what tiny home to add INTO Image 1.

OUTPUT REQUIREMENTS - VIOLATION WILL FAIL:
1. Output image dimensions MUST match Image 1 (user's photo) EXACTLY
   - DO NOT use Image 2 (tiny home) dimensions for output
   - DO NOT change the aspect ratio, resolution, or size of the user's photo
   - The output is Image 1 WITH tiny home added, NOT a new image

2. PRESERVE Image 1 (user's photo) COMPLETELY:
   - DO NOT regenerate, redraw, or recreate the scene
   - DO NOT change composition, framing, perspective, or camera angle
   - DO NOT alter background, landscape, buildings, or any existing elements
   - Keep the EXACT scene from the user's photo - ONLY add tiny home to it

3. ADD tiny home FROM Image 2 INTO Image 1:
   - Take the tiny home appearance from Image 2
   - Place it INTO the scene from Image 1
   - Size: ${tinyHomeModel.dimensions.length}m × ${tinyHomeModel.dimensions.width}m × ${tinyHomeModel.dimensions.height}m
   - Use existing objects in Image 1 for scale (doors ~2m, people ~1.7m, cars ~4.5m)
   - Add natural shadows to integrate it into the scene
   - Match lighting from Image 1

4. This is COMPOSITING (like Photoshop):
   - Start with Image 1 as the base layer
   - Add tiny home as a new layer on top
   - Blend it naturally into the scene
   - Final output = Image 1 + tiny home overlay

CRITICAL: Output dimensions and scene MUST match Image 1. You are ADDING a tiny home TO the user's photo, NOT creating a new image.${lightingPrompt ? ` ${lightingPrompt}` : ''}`

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
    return `CRITICAL LIGHTING-ONLY: Output dimensions MUST match input. Keep EXACTLY ONE tiny home, same position. Keep user's photo scene EXACTLY as is. ONLY adjust lighting: ${lightingPrompt}`
  }

  let prompt = `CRITICAL POSITION ADJUSTMENT:

OUTPUT REQUIREMENTS:
1. Output dimensions MUST match the input image (user's photo with tiny home) EXACTLY
2. PRESERVE user's photo scene COMPLETELY - same composition, framing, perspective
3. Keep EXACTLY ONE tiny home - ONLY change its position as requested
4. Tiny home size: ${tinyHomeModel.dimensions.length}m × ${tinyHomeModel.dimensions.width}m × ${tinyHomeModel.dimensions.height}m
5. Use objects in scene for scale (doors ~2m, people ~1.7m, cars ~4.5m)

Position adjustment requested: `

  if (lowerCommand.includes('left')) prompt += 'Move the tiny home left in the scene. '
  if (lowerCommand.includes('right')) prompt += 'Move the tiny home right in the scene. '
  if (lowerCommand.includes('up') || lowerCommand.includes('back')) prompt += 'Move the tiny home back (further away). '
  if (lowerCommand.includes('down') || lowerCommand.includes('forward')) prompt += 'Move the tiny home forward (closer). '

  prompt += '\n\nCRITICAL: Same image dimensions. Same scene. ONLY the tiny home position changes. DO NOT recreate anything.'

  if (lightingPrompt) prompt += ` ${lightingPrompt}`

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
