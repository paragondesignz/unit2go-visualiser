import { UploadedImage, VisualizationModel, NanoBananaProOptions } from '../types'
import { processWithGemini } from './geminiService'

console.log('Using Nano Banana Pro (Gemini 3 Pro Image) for generation...')

/**
 * Generate visualization using Gemini 3 Pro Image
 */
export async function generateVisualization(
  uploadedImage: UploadedImage,
  model: VisualizationModel,
  lightingPrompt?: string,
  nanoBananaOptions?: NanoBananaProOptions
): Promise<{ imageUrl: string; prompt?: string; modelSettings?: any }> {
  // Use Gemini service for all image generation
  const result = await processWithGemini(
    uploadedImage,
    model,
    'initial',
    undefined,
    undefined,
    lightingPrompt,
    undefined,
    undefined,
    nanoBananaOptions
  )

  return { imageUrl: result.imageUrl, prompt: result.prompt, modelSettings: result.modelSettings }
}
