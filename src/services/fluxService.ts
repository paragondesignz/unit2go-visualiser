import * as fal from '@fal-ai/serverless-client'
import { FLUXGenerationOptions, VisualizationModel, DepthMapData, isPoolModel } from '../types'

const FAL_API_KEY = import.meta.env.VITE_FAL_API_KEY || ''

if (!FAL_API_KEY) {
  console.error('FAL API key is missing. Please add VITE_FAL_API_KEY to your .env file')
}

// Configure fal client
fal.config({
  credentials: FAL_API_KEY,
})

/**
 * Generate a depth map from an image using MiDaS
 */
export async function generateDepthMap(imageDataUrl: string): Promise<DepthMapData> {
  try {
    console.log('Generating depth map with MiDaS...')

    const result = await fal.subscribe('fal-ai/imageutils/depth', {
      input: {
        image_url: imageDataUrl,
      },
    }) as { image: { url: string; width: number; height: number } }

    console.log('Depth map generated successfully')

    return {
      imageUrl: result.image.url,
      width: result.image.width,
      height: result.image.height,
    }
  } catch (error) {
    console.error('Error generating depth map:', error)
    throw new Error('Failed to generate depth map')
  }
}

/**
 * Convert File to base64 data URL
 */
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Build compositing-focused prompt for FLUX
 * Natural placement, focus on integration elements
 */
function buildFLUXPrompt(
  model: VisualizationModel,
  lightingPrompt?: string
): string {
  if (isPoolModel(model)) {
    return `Convert the pool diagram from the reference image into a photorealistic swimming pool and composite it naturally onto this property.

CRITICAL: Preserve the EXACT shape from the reference diagram. The pool outline, curves, and proportions must match the reference image precisely.

Preserve both the property photo and pool shape exactly. Only add these integration elements:
- Natural contact shadows beneath the pool edges
- Ground interaction where the pool meets terrain
- Realistic water appearance (transparent, blue-turquoise, with depth and reflections)
- Pool materials (concrete/fiberglass shell, coping/tile edges)
- Lighting adjustments to match the property photo
- Natural landscaping around the pool

The pool should appear as if it was physically built on this property when the photo was taken.${lightingPrompt ? ` ${lightingPrompt}` : ''}`
  }
  
  return `Composite the tiny home from the reference image naturally onto this property where it looks most realistic given the terrain and available space.

Preserve both the property photo and tiny home design exactly. Only add these integration elements:
- Natural contact shadows beneath the tiny home
- Ground interaction where the foundation meets terrain
- Lighting adjustments to match the property photo
- Window reflections matching the sky/environment

The tiny home should appear as if it was physically present when the property photo was taken.${lightingPrompt ? ` ${lightingPrompt}` : ''}`
}

/**
 * Generate visualization using FLUX.1 with ControlNet depth guidance
 */
export async function generateWithFLUX(
  options: FLUXGenerationOptions,
  model: VisualizationModel
): Promise<string> {
  try {
    if (!FAL_API_KEY) {
      throw new Error('FAL API key is not configured. Please add your API key to the .env file.')
    }

    console.log('Converting property image to data URL...')
    const propertyImageDataUrl = await fileToDataUrl(options.propertyImage)

    // Generate depth map from property image for better positioning control
    console.log('Generating depth map for positioning control...')
    const depthMap = await generateDepthMap(propertyImageDataUrl)

    // Build the prompt
    const prompt = buildFLUXPrompt(
      model,
      options.lightingPrompt
    )

    console.log('Calling FLUX.1 image-to-image with ControlNet for compositing...')
    console.log(`FLUX Parameters - Model: ${isPoolModel(model) ? 'POOL' : 'Tiny Home'}, Reference Strength: ${isPoolModel(model) ? 2.0 : 0.95}, Strength: ${isPoolModel(model) ? 0.2 : 0.30}, Guidance: ${isPoolModel(model) ? 5.0 : 3.5}`)

    // Use FLUX image-to-image for compositing (preserving both images, only adding integration)
    const result = await fal.subscribe('fal-ai/flux-general/image-to-image', {
      input: {
        image_url: propertyImageDataUrl,
        prompt: prompt,
        // Reference image: preserve design 100% (especially important for pool shape)
        reference_image_url: options.tinyHomeImageUrl,
        reference_strength: isPoolModel(model) ? 2.0 : 0.95, // Increased to 2.0 for pools (max safe value) to maximize shape preservation
        // ControlNet depth: guide spatial positioning
        control_image_url: depthMap.imageUrl,
        controlnet_conditioning_scale: options.controlnetStrength || 0.9,
        // Low strength: minimal transformation, focus on compositing
        strength: isPoolModel(model) ? 0.2 : 0.30, // Even lower for pools (0.2) to preserve base image better
        num_inference_steps: 28,
        guidance_scale: isPoolModel(model) ? 5.0 : 3.5, // Higher guidance for pools to enforce shape preservation prompt
        seed: Math.floor(Math.random() * 1000000),
        enable_safety_checker: true,
      },
    }) as { images: Array<{ url: string }> }

    if (!result.images || result.images.length === 0) {
      throw new Error('No images generated by FLUX API')
    }

    console.log('FLUX generation successful!')
    return result.images[0].url
  } catch (error) {
    console.error('Error generating with FLUX:', error)
    throw error
  }
}

/**
 * Simple text-to-image generation with FLUX (for reference/testing)
 */
export async function generateSimpleFLUX(
  prompt: string,
  imageSize: { width: number; height: number } = { width: 1024, height: 768 }
): Promise<string> {
  try {
    console.log('Generating with FLUX text-to-image...')

    const result = await fal.subscribe('fal-ai/flux/dev', {
      input: {
        prompt: prompt,
        image_size: imageSize,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        enable_safety_checker: true,
      },
    }) as { images: Array<{ url: string }> }

    if (!result.images || result.images.length === 0) {
      throw new Error('No images generated')
    }

    return result.images[0].url
  } catch (error) {
    console.error('Error with simple FLUX generation:', error)
    throw error
  }
}
