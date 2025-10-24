import { GoogleGenAI } from '@google/genai'
import { UploadedImage, TinyHomeModel, Position, VisualizationResult } from '../types'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''

if (!API_KEY) {
  console.error('Gemini API key is missing. Please add VITE_GEMINI_API_KEY to your .env file')
}

const ai = new GoogleGenAI({
  apiKey: API_KEY,
})

// Supported Gemini aspect ratios
const SUPPORTED_ASPECT_RATIOS = [
  { ratio: '1:1', value: 1.0 },
  { ratio: '9:16', value: 0.5625 },  // Portrait mobile
  { ratio: '2:3', value: 0.667 },
  { ratio: '3:4', value: 0.75 },
  { ratio: '4:5', value: 0.8 },
  { ratio: '5:4', value: 1.25 },
  { ratio: '4:3', value: 1.333 },
  { ratio: '3:2', value: 1.5 },
  { ratio: '16:9', value: 1.777 },  // Landscape mobile
  { ratio: '21:9', value: 2.333 },
]

function getClosestAspectRatio(width: number, height: number): string {
  const inputRatio = width / height
  let closest = SUPPORTED_ASPECT_RATIOS[0]
  let minDiff = Math.abs(inputRatio - closest.value)

  for (const ar of SUPPORTED_ASPECT_RATIOS) {
    const diff = Math.abs(inputRatio - ar.value)
    if (diff < minDiff) {
      minDiff = diff
      closest = ar
    }
  }

  console.log(`Input dimensions: ${width}x${height} (ratio: ${inputRatio.toFixed(3)}) -> Using Gemini aspect ratio: ${closest.ratio}`)
  return closest.ratio
}

export async function processWithWireframeGuide(
  wireframeGuideImage: string,
  tinyHomeModel: TinyHomeModel,
  lightingPrompt?: string
): Promise<VisualizationResult> {
  const imageBase64 = wireframeGuideImage.includes('base64,')
    ? wireframeGuideImage.split('base64,')[1]
    : wireframeGuideImage

  // Get image dimensions from data URL
  const img = new Image()
  img.src = wireframeGuideImage
  await new Promise(resolve => img.onload = resolve)
  const imageWidth = img.width
  const imageHeight = img.height
  const aspectRatio = getClosestAspectRatio(imageWidth, imageHeight)

  const basePrompt = `WIREFRAME POSITIONING GUIDE:
The image shows a semi-transparent green box with green wireframe edges. This box indicates EXACTLY where to place the tiny home from the reference image:

CRITICAL INSTRUCTIONS:
- Place the tiny home precisely within the boundaries of this green wireframe box
- Match the rotation angle shown by the box orientation
- Match the scale - the tiny home should fill the box dimensions exactly
- The wireframe box represents ${tinyHomeModel.dimensions.length}m × ${tinyHomeModel.dimensions.width}m × ${tinyHomeModel.dimensions.height}m
- After placing the tiny home, REMOVE ALL TRACES of the green wireframe guide - it must not appear in the final output
- The tiny home must look IDENTICAL to the reference - same colors, materials, features
- Maintain photorealistic quality with proper lighting, shadows, and perspective${lightingPrompt ? `\n\n${lightingPrompt}` : ''}

Place only ONE tiny home exactly where the wireframe guide indicates.`

  // Load the tiny home reference image
  const tinyHomeImageBase64 = await fetchImageAsBase64(tinyHomeModel.imageUrl)

  const config = {
    responseModalities: ['Image'],
    imageConfig: {
      aspectRatio: aspectRatio,
    },
  }

  const model = 'gemini-2.5-flash-image-preview'

  const contents = [
    {
      role: 'user' as const,
      parts: [
        {
          text: basePrompt,
        },
        {
          inlineData: {
            mimeType: 'image/png',
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

  console.log('Sending wireframe guide request to Gemini API')

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
        console.log('Found image in wireframe guide response!')
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
    return {
      imageUrl: generatedImageData,
      position: {
        x: 50,
        y: 50,
        scale: 1,
        rotation: 0
      }
    }
  }

  throw new Error(`No image generated with wireframe guide. API Response: ${textResponse || 'No response text'}`)
}

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

  // Get current image dimensions from data URL
  const img = new Image()
  img.src = currentImageDataUrl
  await new Promise(resolve => img.onload = resolve)
  const currentWidth = img.width
  const currentHeight = img.height
  const aspectRatio = getClosestAspectRatio(currentWidth, currentHeight)

  const conversationalPrompt = `Adjust the lighting in this image. ${lightingPrompt}

CRITICAL: Keep the tiny home completely unchanged:
- Do NOT modify the tiny home's appearance, colors, materials, or features in any way
- Keep it at its current size (13m long), position, and perspective
- MAINTAIN THE EXACT SAME PERSPECTIVE and viewing angle - do not change the camera angle or perspective
- Keep it oriented to follow the natural lines of the property
- Only change lighting, shadows, and sky
- Do not add people`

  const config = {
    responseModalities: ['Image'],
    imageConfig: {
      aspectRatio: aspectRatio,
    },
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

export async function conversationalEdit(
  currentImageDataUrl: string,
  editPrompt: string
): Promise<string> {
  if (!API_KEY) {
    throw new Error('Gemini API key is not configured.')
  }

  const imageBase64 = currentImageDataUrl.includes('base64,')
    ? currentImageDataUrl.split('base64,')[1]
    : currentImageDataUrl

  // Get current image dimensions from data URL
  const img = new Image()
  img.src = currentImageDataUrl
  await new Promise(resolve => img.onload = resolve)
  const currentWidth = img.width
  const currentHeight = img.height
  const aspectRatio = getClosestAspectRatio(currentWidth, currentHeight)

  const prompt = `Make this edit to the image: ${editPrompt}

CRITICAL CONSTRAINTS:
- If this is a scale/size adjustment: ONLY change the size of the tiny home. Do NOT move its position, do NOT change its orientation or perspective, do NOT modify its appearance (colors, materials, features)
- If this is an environment edit: Do NOT modify the tiny home's appearance, colors, materials, features, or architectural details. Keep it at its current size and position
- ALWAYS maintain the tiny home's current position in the scene - do not shift it left, right, forward, or back
- ALWAYS maintain the tiny home's current orientation and alignment with fence lines/stone areas
- CRITICAL: MAINTAIN THE EXACT SAME PERSPECTIVE and camera angle - do not change the viewing angle or perspective of the tiny home
- Do not add people to the image
- Focus the edit precisely on what was requested and nothing else`

  const config = {
    responseModalities: ['Image'],
    imageConfig: {
      aspectRatio: aspectRatio,
    },
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
            mimeType: 'image/jpeg',
            data: imageBase64,
          },
        },
      ],
    },
  ]

  console.log('Sending conversational edit request to Gemini API')

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
        console.log('Found edited image in response!')
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

  throw new Error(`No image generated during conversational edit. API Response: ${textResponse || 'No response text'}`)
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

  // Get original image dimensions
  const img = await createImageBitmap(uploadedImage.file)
  const originalWidth = img.width
  const originalHeight = img.height
  const aspectRatio = getClosestAspectRatio(originalWidth, originalHeight)

  const basePrompt = customPrompt || `PHOTOREALISTIC COMPOSITE OBJECTIVE:
You are creating a professional real estate marketing photograph by compositing the tiny home from image 2 into the outdoor space shown in image 1. This must look like an actual photograph taken by a professional photographer - NOT a digital rendering or CGI.

CRITICAL PERSPECTIVE MATCHING:
Analyze the camera perspective and viewing angle of image 1:
- Identify the camera height (ground level, eye level, slightly elevated, etc.)
- Determine the viewing angle (straight on, slight angle, looking down, etc.)
- Note the vanishing points and perspective lines in the existing scene
- The tiny home MUST be rendered with EXACTLY the same perspective as image 1
- The tiny home's perspective must match the perspective of any existing buildings, fences, or structures in the scene
- If the scene shows ground-level perspective, the tiny home must be viewed from ground level
- If the scene shows eye-level perspective, the tiny home must be viewed from eye level
- The vanishing points of the tiny home must align with the vanishing points in the original scene
- This is CRITICAL: perspective mismatch will make the composite look unrealistic and fake

COMPOSITIONAL INTEGRATION:
Study image 1 carefully and identify all structural elements that define the property layout:
- Hard surfaces: concrete pads, stone areas, paved sections, gravel driveways, decking platforms
- Fence lines and property boundaries (wooden fences, wire fences, hedges)
- Pathways, driveways, or access routes
- Existing buildings, sheds, or permanent structures

The tiny home should be positioned to respect and align with these existing elements:
- If there's a concrete pad, stone area, or paved section, place the tiny home parallel to its edges and consider it as the placement area
- If fence lines define the property, orient the tiny home's long axis to run parallel with those fence lines
- If there's a driveway or pathway leading to a specific area, position the tiny home to face that natural access point
- If there are existing buildings, position the tiny home to complement their orientation and create visual coherence

This creates natural integration - the tiny home should look like it was intentionally planned as part of the property's existing layout, following the geometric logic of concrete pads, stone areas, fence lines, and other structural elements.

REFERENCE IMAGE USAGE - EXACT REPLICATION (CRITICAL):
Use the EXACT tiny home shown in image 2 without making ANY modifications whatsoever to its appearance:
- Do NOT add logos, branding, text, graphics, or any visual elements
- Do NOT modify the color, paint scheme, texture, material finish, shape, or architectural style
- Do NOT add windows, doors, decks, railings, or any features not in the reference image
- Do NOT change the roofline, siding, trim, or any exterior details
- Do NOT alter the appearance of existing windows, doors, or fixtures
- Keep the exact same perspective and viewing angle as shown in the reference
- The tiny home's exterior must be a pixel-perfect reproduction of image 2
- Think of this as copy-paste, not redesign - you are transferring the exact visual appearance into a new scene
- Any modification to the tiny home's appearance is a complete failure of this task

ACCURATE SIZING AND SCALE:
- This tiny home is EXACTLY ${tinyHomeModel.dimensions.length}m x ${tinyHomeModel.dimensions.width}m x ${tinyHomeModel.dimensions.height}m
- Use real-world references for accurate scale: standard doors are ~2m high, cars are ~4-5m long, people are ~1.7m tall
- The tiny home must be proportionally correct relative to any people, vehicles, trees, or objects in image 1
- This is a GROUND-LEVEL structure - it sits ON the ground surface

FINAL EXECUTION:
- Composite the exact tiny home from image 2 into the scene from image 1 WITHOUT changing its appearance
- The tiny home must look IDENTICAL to image 2 - same colors, same materials, same features, same everything
- MATCH THE PERSPECTIVE: Render the tiny home with the exact same camera angle, viewing height, and perspective as the scene in image 1
- Ensure accurate ${tinyHomeModel.dimensions.length}m x ${tinyHomeModel.dimensions.width}m x ${tinyHomeModel.dimensions.height}m scale
- Orient the tiny home to follow the natural lines of the property (parallel to fence lines/stone areas if present)
- The result must look like a genuine photograph with natural, harmonious integration - the perspective must be seamless
- Remove any people from the final image
- Place only ONE tiny home, and it must be visually identical to the reference in image 2${lightingPrompt ? `\n- ${lightingPrompt}` : ''}`

  const prompt = basePrompt

  const config = {
    responseModalities: ['Image'],
    imageConfig: {
      aspectRatio: aspectRatio,
    },
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
    return `Adjust lighting: ${lightingPrompt}

CRITICAL: Do NOT modify the tiny home's appearance, colors, materials, or features. Keep it at its exact size (${tinyHomeModel.dimensions.length}m long), position, and perspective. MAINTAIN THE EXACT SAME PERSPECTIVE and camera angle. Keep it oriented to follow the natural lines of the property. Only change lighting, shadows, and sky.`
  }

  // Handle position adjustments
  let prompt = `Reposition the tiny home in this image: `

  if (lowerCommand.includes('left')) prompt += 'Move it to the left. '
  if (lowerCommand.includes('right')) prompt += 'Move it to the right. '
  if (lowerCommand.includes('up') || lowerCommand.includes('back')) prompt += 'Move it back (further away). '
  if (lowerCommand.includes('down') || lowerCommand.includes('forward')) prompt += 'Move it forward (closer). '

  prompt += `

CRITICAL: Do NOT modify the tiny home's appearance, colors, materials, or architectural features. Maintain the tiny home at ${tinyHomeModel.dimensions.length}m x ${tinyHomeModel.dimensions.width}m x ${tinyHomeModel.dimensions.height}m (same size). MAINTAIN THE EXACT SAME PERSPECTIVE and camera angle as the existing scene - the viewing angle must remain consistent. Keep it oriented to follow the natural lines of the property - if fence lines or stone/concrete areas are visible, the tiny home's long axis should run parallel to create visual harmony with the property's existing geometry. Remove any people.`

  if (lightingPrompt) prompt += `\n\nLighting: ${lightingPrompt}`

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
