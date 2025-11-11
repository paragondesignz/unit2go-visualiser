import { ARCaptureData, ARGenerationResult } from '../types/ar'
import { GoogleGenAI } from '@google/genai'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''

if (!API_KEY) {
  console.error('Gemini API key is missing. Please add VITE_GEMINI_API_KEY to your .env file')
}

const ai = new GoogleGenAI({
  apiKey: API_KEY,
})

/**
 * Generate photorealistic pool visualization from AR capture data
 * Uses mask-based inpainting approach
 */
export async function generateARVisualization(
  captureData: ARCaptureData
): Promise<ARGenerationResult> {
  if (!API_KEY) {
    return {
      success: false,
      error: 'Gemini API key is not configured. Please add your API key to the .env file.'
    }
  }

  try {
    // Convert base64 images to proper format
    const baseImageBase64 = captureData.baseImage.includes('base64,')
      ? captureData.baseImage.split('base64,')[1]
      : captureData.baseImage

    const maskImageBase64 = captureData.maskImage.includes('base64,')
      ? captureData.maskImage.split('base64,')[1]
      : captureData.maskImage

    // Detect aspect ratio from base image
    const aspectRatio = await detectAspectRatioFromDataUrl(captureData.baseImage)

    // Create inpainting prompt
    const prompt = `PRIMARY DIRECTIVE: SHAPE FIDELITY IS THE ONLY GOAL.

You are performing a precise, image-to-image visualization using mask-based inpainting.

Inputs:
- Image [0]: The backyard / property scene (base image)
- Image [1]: A mask image showing where the pool should be placed (white area = pool location, black = background)

UNBREAKABLE RULES: SHAPE & FEATURE MATCH

Your ONLY critical task is to fill the white area in the mask (Image [1]) with a photorealistic swimming pool that matches the exact shape shown in the mask.

NO ADDED FEATURES: You MUST NOT add any features that are not in the mask shape.
NO STEPS: If the mask does not show steps, the final pool MUST NOT have steps.
NO CURVES: If the mask has straight edges, the final pool MUST have straight edges.
NO CUTOUTS: Do not add ledges, alcoves, or cutouts of any kind unless they are explicitly visible in the mask.

PERFECT OUTLINE: The final pool's outline and perimeter must perfectly match the white area in the mask. Do not "improve" or "adjust" the shape.

This is a logical, geometric task, not a creative one. Prioritize the exact shape from the mask above all other instructions.

Secondary Task: Photorealistic Integration

After you have guaranteed the shape is 100% identical to the mask:

- Scale: The pool is ${captureData.dimensions.length}m long. Scale it realistically relative to the house/fences in Image [0].
- Lighting: Adjust the pool's lighting, shadows, and reflections to perfectly match the natural lighting already in Image [0].
- Integration: Blend the pool's edge (coping, tiles) to sit naturally in the grass or patio of Image [0].
- Water: Fill the pool shape with realistic turquoise/blue water with proper depth and transparency.

FINAL VERIFICATION: Before you finish, check: "Does the pool shape perfectly match the white area in the mask?" If not, you have failed. The shape must be identical.`

    const config = {
      temperature: 0.3,
      topP: 0.1,
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
              mimeType: 'image/jpeg',
              data: baseImageBase64,
            },
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: maskImageBase64,
            },
          },
        ],
      },
    ]

    console.log('Sending AR visualization request to Gemini API with model:', model)

    const response = await ai.models.generateContent({
      model,
      config,
      contents,
    })

    if (!response.candidates || !response.candidates[0].content || !response.candidates[0].content.parts) {
      return {
        success: false,
        error: 'No response from Gemini API'
      }
    }

    const imagePart = response.candidates[0].content.parts.find(part => part.inlineData)

    if (imagePart?.inlineData) {
      console.log('Found AR visualization image in response!')
      const { mimeType, data } = imagePart.inlineData
      return {
        success: true,
        imageUrl: `data:${mimeType};base64,${data}`
      }
    }

    const textResponse = response.candidates[0].content.parts
      .filter(part => part.text)
      .map(part => part.text)
      .join('')

    return {
      success: false,
      error: `No image generated. API Response: ${textResponse || 'No response text'}`
    }
  } catch (error) {
    console.error('AR visualization error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
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

/**
 * Map ratio value to closest Gemini-supported aspect ratio string
 */
function mapToAspectRatio(ratio: number): string {
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

