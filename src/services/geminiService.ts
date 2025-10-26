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

  const conversationalPrompt = `This photograph shows a property with a tiny home already placed on it. Apply a lighting and atmospheric adjustment to this existing scene.

${lightingPrompt}

Adjust the lighting, shadows, sky colors, and atmospheric conditions throughout the entire scene to match the requested conditions. The tiny home and all elements remain in their current positions with the same composition and framing.

Update the sun angle, shadow direction and intensity, sky appearance, color temperature, and ambient lighting to create the requested atmosphere. Maintain realistic photographic quality with natural light behavior, accurate shadow casting, and appropriate color grading for the time of day or weather conditions.

The output should preserve the exact dimensions, composition, and positioning of all elements from the input photograph, with only the lighting and atmospheric qualities transformed.`

  const config = {
    responseModalities: ['IMAGE', 'TEXT'] as string[],
  }

  const model = 'gemini-2.5-flash-image-preview'

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

  const prompt = customPrompt || `You are creating a photorealistic architectural visualization by compositing a tiny home into an existing property photograph. This must look like an authentic photograph taken on location, not a digital composite.

The first image shows the customer's property as photographed - this is your base canvas that preserves the exact scene, lighting, and atmosphere. The second image shows the ${tinyHomeModel.name} tiny home model (${tinyHomeModel.dimensions.length}m long × ${tinyHomeModel.dimensions.width}m wide × ${tinyHomeModel.dimensions.height}m tall) as a design reference - transform this pristine render into a realistic, naturally weathered outdoor structure that belongs in the property photograph.

Create a seamless composite photograph where the tiny home appears naturally placed on the property, as if it was present when the original photo was taken. Photograph this from a standard architectural photography perspective using a 50mm equivalent lens at eye level (approximately 1.6 meters above ground), maintaining the same camera position and angle as the original property photograph.

Position the tiny home at an appropriate mid-ground distance where it appears clearly visible and properly scaled within the scene. The structure measures ${tinyHomeModel.dimensions.length} meters in length - ensure this appears proportionally accurate by comparing to visible reference objects: standard residential doors are 2 meters tall, average human height is 1.7 meters, cars are approximately 4.5 meters long, and fence posts typically stand 1.8-2 meters high. The tiny home should appear neither oversized nor undersized relative to these environmental elements.

CRITICAL PHOTOREALISM - Transform the reference render into a real outdoor structure:

WEATHERING & REALISM: The tiny home should look like a real structure that has been sitting outdoors, not a pristine 3D render. Add subtle natural weathering: slight dirt accumulation on lower sections, very subtle dust on surfaces, minor color variations in materials showing age, realistic surface imperfections, and natural outdoor patina. The exterior cladding should show realistic material texture with subtle variations - not perfect CG smoothness. Add very subtle water staining under roof edges and around windows from rain exposure.

LIGHTING INTEGRATION: Match the exact lighting quality, direction, and color temperature from the property photograph. If the photo shows overcast conditions, the tiny home should have soft, diffused lighting with no harsh shadows. If sunny, create crisp directional shadows matching the sun angle precisely. The tiny home's materials should respond to light exactly like the surrounding structures in the photo - same reflection intensity, same shadow softness, same highlight characteristics.

SHADOW REALISM: Cast natural contact shadows with realistic falloff - not hard CG edges. Shadows should be softest at the edges, darker where surfaces are closest to the ground, with subtle ambient light bleeding in from surrounding surfaces. Shadow color should match the ambient environment (slightly blue in shade on sunny days, neutral in overcast). Add subtle occlusion shadows in corners and under eaves.

EDGE INTEGRATION: Soften edges very slightly where the structure meets the sky or background to match the natural edge characteristics of other buildings in the photograph. Avoid razor-sharp CG edges - real photographs have subtle edge softness from lens characteristics and atmospheric scattering.

MATERIAL REALISM: Render materials with photographic authenticity. Metal roofing should show subtle surface variations, minor scratches, realistic specular highlights. Windows should reflect the actual sky and environment from the property photo - not generic reflections. Cladding materials should show realistic texture variation, subtle color differences between panels, natural outdoor exposure. Add very subtle dust, pollen, or dirt that naturally accumulates on outdoor structures.

COLOR & TONE MATCHING: Match the color palette and tonal range of the property photograph exactly. If the photo has warm tones, the tiny home should match. If cool/blue tones, match those. Apply the same color grading that appears in the base photograph. Add subtle color casts from surrounding surfaces - grass reflects green light upward, sky adds blue from above.

ATMOSPHERIC INTEGRATION: Match the image grain, noise, and compression artifacts visible in the property photograph. If the photo shows slight haze or atmospheric perspective, apply equivalent effects to the tiny home. The structure should have the same sharpness characteristics as other objects at similar distances in the photograph.

GROUND CONTACT: The foundation sits firmly on the ground with realistic interaction - grass or dirt slightly displaced where it meets the base, subtle settling, natural ground texture variations around the perimeter. Shadows beneath the structure are strongest and darkest directly under the building, gradually softening and lightening toward the edges with realistic penumbra.

DEPTH & FOCUS: Integrate into the scene's depth with proper atmospheric perspective. The tiny home should have identical focus characteristics to other objects at the same distance in the photograph. If background elements show depth of field softness, apply proportional softness to the tiny home's background-side elements.

The final result must be indistinguishable from a photograph where the tiny home was actually present when the original image was captured. No viewer should be able to identify this as a digital composite.

Output the final composite as a single cohesive photograph matching the exact dimensions and aspect ratio of the original property image.${lightingPrompt ? ` Lighting conditions: ${lightingPrompt}` : ''}`

  const config = {
    responseModalities: ['IMAGE', 'TEXT'] as string[],
  }

  const model = 'gemini-2.5-flash-image-preview'

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
    return `This photograph shows a property with a tiny home. Adjust only the lighting and atmospheric conditions: ${lightingPrompt}. The tiny home and all other elements remain in their current positions with the same composition.`
  }

  let prompt = `This photograph shows a property with a ${tinyHomeModel.name} tiny home (${tinyHomeModel.dimensions.length}m × ${tinyHomeModel.dimensions.width}m × ${tinyHomeModel.dimensions.height}m) placed on it. Reposition the tiny home in the scene as follows: `

  if (lowerCommand.includes('left')) prompt += 'move the tiny home to the left within the property scene, '
  if (lowerCommand.includes('right')) prompt += 'move the tiny home to the right within the property scene, '
  if (lowerCommand.includes('up') || lowerCommand.includes('back')) prompt += 'move the tiny home further back (away from the camera), '
  if (lowerCommand.includes('down') || lowerCommand.includes('forward')) prompt += 'move the tiny home closer (toward the camera), '

  prompt += 'maintaining realistic proportions using visible objects for scale reference (doors ~2m, people ~1.7m, cars ~4.5m). The property scene, composition, and framing remain unchanged with only the tiny home repositioned. Apply natural shadows and lighting integration for the new position.'

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

  const prompt = `You are creating a precision architectural visualization by compositing a tiny home into a property photograph using exact positioning guidance. This must look like an authentic photograph taken on location, not a digital composite.

The first image shows the customer's property photograph - your base canvas preserving the exact scene. The second image shows the ${tinyHomeModel.name} tiny home model (${tinyHomeModel.dimensions.length}m × ${tinyHomeModel.dimensions.width}m × ${tinyHomeModel.dimensions.height}m) as a design reference - transform this pristine render into a realistic, naturally weathered outdoor structure. The third image shows a wireframe overlay indicating the precise position, rotation, scale, and perspective for placement.

Create a photorealistic composite photographed from a standard architectural perspective using a 50mm equivalent lens at eye level (approximately 1.6 meters above ground). The tiny home must match the exact position, angle, and scale indicated by the wireframe guide. The wireframe demonstrates the specific placement, orientation, and proportions - replicate this positioning precisely while transforming the reference render into a believable outdoor structure that belongs in the property photograph.

Ensure the ${tinyHomeModel.dimensions.length}-meter structure appears proportionally accurate relative to environmental reference objects visible in the scene: doors (2m tall), people (1.7m average), cars (4.5m long), fence posts (1.8-2m). The wireframe provides the spatial template - apply photorealistic weathering, realistic materials, and natural outdoor characteristics.

CRITICAL PHOTOREALISM - Transform the reference into a real outdoor structure:
Add subtle natural weathering (slight dirt, dust, minor color variations, realistic surface imperfections, outdoor patina). Match exact lighting quality from the property photo - same shadow softness, reflection intensity, color temperature. Cast natural shadows with realistic soft falloff, not hard CG edges. Soften edges slightly to match photographic characteristics. Render materials with authentic texture variations, subtle scratches, realistic specular highlights. Windows reflect the actual environment from the photo. Match color palette and tonal range exactly. Apply same image grain and atmospheric characteristics as the property photograph. Ground contact shows realistic interaction with terrain. The result must be indistinguishable from a photograph where the tiny home was actually present.

Output the final composite as a single cohesive photograph matching the exact dimensions and aspect ratio of the original property image.${lightingPrompt ? ` Lighting conditions: ${lightingPrompt}` : ''}`

  const config = {
    responseModalities: ['IMAGE', 'TEXT'] as string[],
  }

  const model = 'gemini-2.5-flash-image-preview'

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
        console.log('Found image in wireframe-guided response!')
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

  throw new Error(`No image generated with wireframe guide. API Response: ${textResponse || 'No response text'}`)
}

export async function conversationalEdit(
  currentImageDataUrl: string,
  editPrompt: string
): Promise<string> {
  const imageBase64 = currentImageDataUrl.includes('base64,')
    ? currentImageDataUrl.split('base64,')[1]
    : currentImageDataUrl

  const prompt = `This photograph shows a property with a tiny home placed on it. Apply the following modification to the scene:

${editPrompt}

Interpret this request naturally and apply the changes with photographic realism. If the request involves lighting, weather, or atmospheric changes, adjust the sun angle, shadows, sky appearance, and color temperature throughout the scene. If the request involves repositioning or modifying the tiny home, make those spatial adjustments while maintaining realistic proportions and natural integration with the property.

Elements not mentioned in the request should remain consistent with the input photograph. Maintain realistic photographic quality with natural lighting behavior, accurate shadows, proper depth of field, and cohesive composition.

Output the modified photograph preserving the exact dimensions and aspect ratio of the input image.`

  const config = {
    responseModalities: ['IMAGE', 'TEXT'] as string[],
  }

  const model = 'gemini-2.5-flash-image-preview'

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
        console.log('Found image in conversational edit response!')
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

  throw new Error(`No image generated for conversational edit. API Response: ${textResponse || 'No response text'}`)
}
