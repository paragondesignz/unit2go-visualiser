import { UploadedImage, TinyHomeModel, PlacementPreferences, ImageModelProvider } from '../types'
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
  placementPreferences: PlacementPreferences,
  lightingPrompt?: string
): Promise<string> {
  if (MODEL_PROVIDER === 'flux') {
    console.log('Using FLUX.1 for image generation...')

    try {
      const imageUrl = await generateWithFLUX(
        {
          propertyImage: uploadedImage.file,
          tinyHomeImageUrl: tinyHomeModel.imageUrl,
          placementPreferences,
          lightingPrompt,
          controlnetStrength: 0.9,
        },
        tinyHomeModel
      )

      return imageUrl
    } catch (error) {
      console.error('FLUX generation failed, falling back to Gemini:', error)
      // Fallback to Gemini if FLUX fails
      return generateWithGemini(uploadedImage, tinyHomeModel, placementPreferences, lightingPrompt)
    }
  } else {
    console.log('Using Gemini 2.5 Flash Image for generation...')
    return generateWithGemini(uploadedImage, tinyHomeModel, placementPreferences, lightingPrompt)
  }
}

/**
 * Generate with Gemini (current implementation)
 */
async function generateWithGemini(
  uploadedImage: UploadedImage,
  tinyHomeModel: TinyHomeModel,
  placementPreferences: PlacementPreferences,
  lightingPrompt?: string
): Promise<string> {
  // Build placement prompt
  const horizontalDescriptions = {
    left: 'Position the tiny home toward the left side of the frame, occupying the left third of the composition',
    center: 'Position the tiny home in the center of the frame, creating a balanced, centrally-aligned composition',
    right: 'Position the tiny home toward the right side of the frame, occupying the right third of the composition'
  }

  const depthDescriptions = {
    foreground: 'Place the tiny home in the foreground of the scene, closer to the camera position. The structure should appear larger in scale with stronger presence, positioned at a distance where architectural details are clearly visible and prominent in the frame',
    midground: 'Place the tiny home at mid-ground distance from the camera. The structure should be clearly visible with good detail, positioned at a comfortable viewing distance that balances presence with context, showing both the structure and surrounding property clearly',
    background: 'Place the tiny home in the background of the scene, further from the camera position. The structure should appear smaller in scale, positioned at a distance that shows how it integrates into the wider property landscape, with more environmental context visible around it'
  }

  const placementPrompt = `

PLACEMENT PREFERENCES:
${horizontalDescriptions[placementPreferences.horizontal]}. ${depthDescriptions[placementPreferences.depth]}.`

  const combinedPrompt = (lightingPrompt || '') + placementPrompt

  // Use existing Gemini service
  const result = await processWithGemini(
    uploadedImage,
    tinyHomeModel,
    'initial',
    undefined,
    undefined,
    combinedPrompt
  )

  return result.imageUrl
}
