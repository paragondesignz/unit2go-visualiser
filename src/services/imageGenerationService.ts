import { UploadedImage, VisualizationModel, ImageModelProvider, isPoolModel } from '../types'
import { processWithGemini } from './geminiService'
import { generateWithFLUX, generateWithQwenIntegrateProduct } from './fluxService'

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
  model: VisualizationModel,
  lightingPrompt?: string,
  position?: 'center' | 'left' | 'right'
): Promise<{ imageUrl: string; prompt?: string; modelSettings?: any }> {
  if (MODEL_PROVIDER === 'flux') {
    console.log('Using Qwen Integrate Product model for enhanced product adherence...')
    console.log(`Model type: ${isPoolModel(model) ? 'POOL' : 'Tiny Home'}`)
    
    try {
      // Use Qwen Integrate Product model for superior product adherence
      // This model automatically handles perspective and lighting correction
      const imageUrl = await generateWithQwenIntegrateProduct(
        {
          propertyImage: uploadedImage.file,
          tinyHomeImageUrl: model.imageUrl,
          lightingPrompt,
          controlnetStrength: 0.9,
        },
        model
      )

      return { 
        imageUrl, 
        prompt: 'Qwen Integrate Product generation (prompt optimized for product adherence)',
        modelSettings: {
          model: 'qwen-image-edit-plus-lora-gallery/integrate-product',
          provider: 'fal-ai',
          lora_scale: isPoolModel(model) ? 1.0 : 1.0,
          guidance_scale: isPoolModel(model) ? 2.0 : 1.0,
          num_inference_steps: isPoolModel(model) ? 12 : 6,
          acceleration: 'regular',
        }
      }
    } catch (error) {
      console.error('Qwen Integrate Product generation failed, falling back to FLUX:', error)
      // Fallback to FLUX if Qwen fails
      try {
        const imageUrl = await generateWithFLUX(
          {
            propertyImage: uploadedImage.file,
            tinyHomeImageUrl: model.imageUrl,
            lightingPrompt,
            controlnetStrength: 0.9,
          },
          model
        )

        return { 
          imageUrl, 
          prompt: 'FLUX generation (fallback)',
          modelSettings: {
            model: 'FLUX.1',
            provider: 'flux'
          }
        }
      } catch (fluxError) {
        console.error('FLUX generation also failed, falling back to Gemini:', fluxError)
        // Final fallback to Gemini
        return generateWithGemini(uploadedImage, model, lightingPrompt, position)
      }
    }
  } else {
    console.log('Using Gemini 2.5 Flash Image for generation...')
    return generateWithGemini(uploadedImage, model, lightingPrompt, position)
  }
}

/**
 * Generate with Gemini (natural placement)
 */
async function generateWithGemini(
  uploadedImage: UploadedImage,
  model: VisualizationModel,
  lightingPrompt?: string,
  position?: 'center' | 'left' | 'right'
): Promise<{ imageUrl: string; prompt?: string; modelSettings?: any }> {
  // Use existing Gemini service with natural placement
  const result = await processWithGemini(
    uploadedImage,
    model,
    'initial',
    undefined,
    undefined,
    lightingPrompt,
    undefined,
    position
  )

  return { imageUrl: result.imageUrl, prompt: result.prompt, modelSettings: result.modelSettings }
}
