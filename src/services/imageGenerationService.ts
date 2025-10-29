import { UploadedImage, TinyHomeModel, ImageModelProvider } from '../types'
import { processWithGemini } from './geminiService'
import { generateWithFLUX } from './fluxService'

// Get the configured model provider from environment
const MODEL_PROVIDER = (import.meta.env.VITE_IMAGE_MODEL_PROVIDER || 'gemini') as ImageModelProvider

console.log(`Image generation model provider: ${MODEL_PROVIDER}`)

export function getModelProvider(): ImageModelProvider {
  return MODEL_PROVIDER
}

/**
 * Unified interface for image generation
 * Routes to appropriate service based on MODEL_PROVIDER configuration
 */
export async function generateVisualization(
  uploadedImage: UploadedImage,
  tinyHomeModel: TinyHomeModel,
  lightingPrompt?: string,
  tinyHomePosition?: 'center' | 'left' | 'right'
): Promise<string> {
  if (MODEL_PROVIDER === 'flux') {
    console.log('Using FLUX.1 for image generation...')

    try {
      const imageUrl = await generateWithFLUX(
        {
          propertyImage: uploadedImage.file,
          tinyHomeImageUrl: tinyHomeModel.imageUrl,
          lightingPrompt,
          controlnetStrength: 0.9,
        },
        tinyHomeModel
      )

      return imageUrl
    } catch (error) {
      console.error('FLUX generation failed, falling back to Gemini:', error)
      // Fallback to Gemini if FLUX fails
      return generateWithGemini(uploadedImage, tinyHomeModel, lightingPrompt, tinyHomePosition)
    }
  } else {
    console.log('Using Gemini 2.5 Flash Image for generation...')
    return generateWithGemini(uploadedImage, tinyHomeModel, lightingPrompt, tinyHomePosition)
  }
}

/**
 * Generate with Gemini (natural placement)
 */
async function generateWithGemini(
  uploadedImage: UploadedImage,
  tinyHomeModel: TinyHomeModel,
  lightingPrompt?: string,
  tinyHomePosition?: 'center' | 'left' | 'right'
): Promise<string> {
  // Use existing Gemini service with natural placement
  const result = await processWithGemini(
    uploadedImage,
    tinyHomeModel,
    'initial',
    undefined,
    undefined,
    lightingPrompt,
    undefined,
    tinyHomePosition
  )

  return result.imageUrl
}
