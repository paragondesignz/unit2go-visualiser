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
    temperature: 1.0, // Higher temperature for natural photographic lighting variation
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

  // Generate random camera specs for variation
  const lenses = ['24-70mm f/2.8', '16-35mm f/4', '70-200mm f/2.8', '35mm f/1.4']
  const isos = ['100', '200', '400']
  const apertures = ['2.8', '4', '5.6', '8']
  const randomLens = lenses[Math.floor(Math.random() * lenses.length)]
  const randomISO = isos[Math.floor(Math.random() * isos.length)]
  const randomAperture = apertures[Math.floor(Math.random() * apertures.length)]

  // Create narrative, descriptive prompt following Google's best practices with photography focus
  const prompt = customPrompt || `PHOTOREALISTIC PHOTOGRAPHY OBJECTIVE:
You are creating a professional real estate marketing photograph. This must look like an actual photograph taken by a professional photographer with high-end camera equipment - NOT a digital rendering or CGI. The image should be indistinguishable from a real photograph.

PHOTOGRAPHY SPECIFICATIONS:
Camera: Professional DSLR with full-frame sensor
Lens: ${randomLens}
ISO: ${randomISO}
Aperture: f/${randomAperture}
White Balance: Natural daylight, accurate color temperature
Dynamic Range: High dynamic range with preserved highlights and shadows
Focus: Tack-sharp focus with natural depth of field creating subtle background blur where appropriate

PHOTOREALISTIC ELEMENTS REQUIRED:
- Natural imperfections: slight color variations in materials, organic weathering, authentic textures
- Realistic shadows with proper soft edges from natural light diffusion
- Accurate light behavior: natural fall-off, ambient occlusion, soft global illumination
- Atmospheric perspective: subtle haze in distant elements
- Natural color grading: realistic saturation levels, authentic color relationships
- Real-world scale and proportions
- Genuine environmental integration: the tiny home must look like it truly exists in this space
- Organic details: natural ground textures, authentic surfaces, real weather effects

SCENE ANALYSIS AND SCALE:
Carefully analyze the property photograph to understand the environment. Look for reference objects that establish scale: doors are typically 2 meters high, windows 1 to 1.5 meters, chairs 0.8 meters high, tables 1.5 meters wide, railings 1 meter height, people 1.7 meters tall, vehicles 4-5 meters long. If decking boards are visible, they are usually 12-15 centimeters wide.

TINY HOME SPECIFICATIONS:
The ${tinyHomeModel.name} measures exactly ${length}m × ${width}m × ${height}m. Using the reference objects identified, ensure the tiny home appears at its true real-world scale relative to everything in the scene. Proportions must be accurate, accounting for perspective diminishment if placed further from the camera.

COMPOSITION AND PLACEMENT:
Position the tiny home using professional real estate photography techniques. Apply the rule of thirds for visual interest, with natural leading lines such as pathways, fencing, or terrain features drawing the eye toward the structure. Place it on flat, stable ground: existing deck, patio area, lawn, gravel pad, or concrete surface. Ensure adequate clearance of approximately 1 meter minimum on accessible sides. Orient the structure parallel to visible features like fences, pathways, or deck edges. The composition should create depth through layered elements: foreground details, the tiny home as midground focal point, and detailed background.

EXACT TINY HOME REPLICATION:
Use the EXACT tiny home from the second reference image without ANY modifications:
- Do NOT add logos, branding, text, or graphics
- Do NOT add extra features: no additional windows, doors, decks, or architectural elements not in reference
- Do NOT modify color, texture, material, shape, or size
- The ONLY change allowed: Add subtle warm interior lighting glowing through windows to suggest occupancy
- Exterior siding, roofing, windows, doors must remain pixel-perfect to the reference

PHOTOREALISTIC INTEGRATION:
The tiny home's exterior materials must show authentic texture and subtle weathering appropriate for the environment. ${lightingPrompt ? `Lighting: ${lightingPrompt}. ` : ''}Shadows are soft-edged and realistic, falling naturally across the scene based on sun position and lighting conditions. Match the color temperature of the scene whether warm golden hour, cool overcast, or neutral daylight. Materials reflect light realistically. Add subtle reflections on reflective surfaces if appropriate. Include atmospheric perspective with slight depth haze on distant features if the tiny home is placed at distance.

PROFESSIONAL REAL ESTATE RESULT:
The final image must be indistinguishable from a genuine photograph captured by a skilled architectural photographer with professional DSLR equipment. The environment and composition are natural. The tiny home remains pixel-perfect to the reference. This is a real photograph, not a rendering.`

  console.log(`Detected aspect ratio: ${aspectRatio}`)

  const config = {
    temperature: 1.0, // Higher temperature for natural photographic variation and realism
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
    temperature: 1.0, // Higher temperature for natural photographic variation
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
