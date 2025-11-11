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
 * Generate an edge map (Canny) from an image for shape preservation
 */
export async function generateEdgeMap(imageDataUrl: string): Promise<DepthMapData> {
  try {
    console.log('Generating edge map with Canny edge detection...')

    const result = await fal.subscribe('fal-ai/imageutils/canny', {
      input: {
        image_url: imageDataUrl,
      },
    }) as { image: { url: string; width: number; height: number } }

    console.log('Edge map generated successfully')

    return {
      imageUrl: result.image.url,
      width: result.image.width,
      height: result.image.height,
    }
  } catch (error) {
    console.error('Error generating edge map:', error)
    throw new Error('Failed to generate edge map')
  }
}

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
 * Fetch image as data URL from URL
 */
async function fetchImageAsDataUrl(imageUrl: string): Promise<string> {
  try {
    const response = await fetch(imageUrl)
    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    throw new Error(`Failed to fetch image: ${error}`)
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

CRITICAL SHAPE PRESERVATION RULES:
- The pool outline MUST match the reference diagram EXACTLY - trace it pixel by pixel
- Every curve, corner, angle, and edge must be identical to the reference
- The length-to-width ratio must be preserved precisely
- Do NOT simplify, round, or modify any part of the shape
- Do NOT add features not present in the reference diagram
- The shape is a TEMPLATE - copy it exactly, only change the visual style (diagram → photorealistic)

PRESERVATION REQUIREMENTS:
- Preserve the property photo exactly as-is
- Preserve the pool shape from the reference diagram exactly as-is
- Only add these minimal integration elements:
  * Natural contact shadows beneath the pool edges
  * Ground interaction where the pool meets terrain
  * Realistic water appearance (transparent, blue-turquoise, with depth and reflections)
  * Pool materials (concrete/fiberglass shell, coping/tile edges matching property style)
  * Lighting adjustments to match the property photo
  * Natural landscaping around the pool

VERIFICATION CHECKLIST:
Before completing, verify:
✓ Pool outline matches reference diagram exactly
✓ All curves match reference diagram exactly
✓ All corners match reference diagram exactly
✓ Proportions match reference diagram exactly
✓ Only visual style changed (diagram → photorealistic), NOT the shape

The pool should appear as if it was physically built on this property when the photo was taken, with the EXACT shape from the reference diagram.${lightingPrompt ? ` ${lightingPrompt}` : ''}`
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

    // For pools, generate edge map from pool diagram to preserve shape better
    let poolEdgeMap: DepthMapData | null = null
    if (isPoolModel(model)) {
      try {
        console.log('Generating edge map from pool diagram for shape preservation...')
        const poolImageDataUrl = await fetchImageAsDataUrl(model.imageUrl)
        poolEdgeMap = await generateEdgeMap(poolImageDataUrl)
        console.log('Pool edge map generated successfully')
      } catch (error) {
        console.warn('Failed to generate pool edge map, falling back to depth map:', error)
      }
    }

    // Generate depth map from property image for better positioning control
    console.log('Generating depth map for positioning control...')
    const depthMap = await generateDepthMap(propertyImageDataUrl)

    // Build the prompt
    const prompt = buildFLUXPrompt(
      model,
      options.lightingPrompt
    )

    // For pools, use edge map if available for better shape preservation, otherwise use depth map
    const controlImage = (isPoolModel(model) && poolEdgeMap) ? poolEdgeMap.imageUrl : depthMap.imageUrl
    const controlType = (isPoolModel(model) && poolEdgeMap) ? 'edge' : 'depth'
    
    // Negative prompt to prevent unwanted shape modifications
    const negativePrompt = isPoolModel(model) 
      ? 'distorted shape, wrong proportions, modified outline, simplified curves, rounded corners, changed angles, different shape, incorrect dimensions, shape mismatch'
      : 'distorted proportions, wrong scale, unrealistic placement'

    console.log('Calling FLUX.1 image-to-image with ControlNet for compositing...')
    console.log(`FLUX Parameters - Model: ${isPoolModel(model) ? 'POOL' : 'Tiny Home'}, Control Type: ${controlType}, Reference Strength: ${isPoolModel(model) ? 2.0 : 0.95}, Strength: 0.30, Guidance: ${isPoolModel(model) ? 5.0 : 3.5}, Steps: ${isPoolModel(model) ? 35 : 28}`)

    // Use FLUX image-to-image for compositing (preserving both images, only adding integration)
    const result = await fal.subscribe('fal-ai/flux-general/image-to-image', {
      input: {
        image_url: propertyImageDataUrl,
        prompt: prompt,
        negative_prompt: negativePrompt,
        // Reference image: preserve design 100% (especially important for pool shape)
        reference_image_url: options.tinyHomeImageUrl,
        reference_strength: isPoolModel(model) ? 2.0 : 0.95, // Increased to 2.0 for pools (max safe value) to maximize shape preservation
        // ControlNet: use edge map for pools (shape preservation), depth map for positioning
        control_image_url: controlImage,
        controlnet_conditioning_scale: options.controlnetStrength || 0.9,
        // Low strength: minimal transformation, focus on compositing
        strength: 0.30, // Very low = preserve base image, only composite (0.0 = no change, 1.0 = complete remake)
        num_inference_steps: isPoolModel(model) ? 35 : 28, // More steps for pools = better shape adherence
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
