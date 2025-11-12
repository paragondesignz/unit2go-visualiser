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

    // Recommended parameters for shape adherence (pools)
    const poolParams = {
      reference_strength: 2.0, // Maximum for shape preservation
      strength: 0.30, // Low to preserve base image while allowing compositing
      num_inference_steps: 35, // Good balance of quality and speed
      guidance_scale: 5.0, // Higher guidance for prompt adherence
      controlnet_conditioning_scale: 0.9, // Standard ControlNet influence
    }
    
    const tinyHomeParams = {
      reference_strength: 0.95,
      strength: 0.30,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      controlnet_conditioning_scale: 0.9,
    }
    
    const params = isPoolModel(model) ? poolParams : tinyHomeParams

    console.log('Calling FLUX Pro Kontext for compositing...')
    console.log(`FLUX Parameters - Model: ${isPoolModel(model) ? 'POOL' : 'Tiny Home'}, Control Type: ${controlType}`)
    console.log(`  Reference Strength: ${params.reference_strength}, Strength: ${params.strength}, Guidance: ${params.guidance_scale}`)
    console.log(`  Steps: ${params.num_inference_steps}, ControlNet Scale: ${params.controlnet_conditioning_scale}`)

    // Try FLUX Pro Kontext - it may have different parameter support
    // First attempt with all parameters, fallback if some aren't supported
    try {
      const result = await fal.subscribe('fal-ai/flux-pro/kontext', {
        input: {
          image_url: propertyImageDataUrl,
          prompt: prompt,
          negative_prompt: negativePrompt,
          // Reference image: preserve design 100% (especially important for pool shape)
          reference_image_url: options.tinyHomeImageUrl,
          reference_strength: params.reference_strength,
          // ControlNet: use edge map for pools (shape preservation), depth map for positioning
          control_image_url: controlImage,
          controlnet_conditioning_scale: params.controlnet_conditioning_scale,
          // Ultra-low strength for pools: minimal transformation, maximum preservation
          strength: params.strength, // Lower = preserve more of base image (0.0 = no change, 1.0 = complete remake)
          num_inference_steps: params.num_inference_steps, // More steps = better shape adherence and refinement
          guidance_scale: params.guidance_scale, // Higher = stricter prompt adherence
          seed: Math.floor(Math.random() * 1000000),
          enable_safety_checker: true,
        },
      }) as { images: Array<{ url: string }> }
      
      if (!result.images || result.images.length === 0) {
        throw new Error('No images generated by FLUX Pro Kontext API')
      }

      console.log('FLUX Pro Kontext generation successful!')
      return result.images[0].url
    } catch (error: any) {
      // If kontext doesn't support all parameters, fallback to flux-general
      console.warn('FLUX Pro Kontext failed or doesn\'t support all parameters, falling back to flux-general:', error.message)
      
      const result = await fal.subscribe('fal-ai/flux-general/image-to-image', {
        input: {
          image_url: propertyImageDataUrl,
          prompt: prompt,
          negative_prompt: negativePrompt,
          // Reference image: preserve design 100% (especially important for pool shape)
          reference_image_url: options.tinyHomeImageUrl,
          reference_strength: params.reference_strength,
          // ControlNet: use edge map for pools (shape preservation), depth map for positioning
          control_image_url: controlImage,
          controlnet_conditioning_scale: params.controlnet_conditioning_scale,
          // Ultra-low strength for pools: minimal transformation, maximum preservation
          strength: params.strength, // Lower = preserve more of base image (0.0 = no change, 1.0 = complete remake)
          num_inference_steps: params.num_inference_steps, // More steps = better shape adherence and refinement
          guidance_scale: params.guidance_scale, // Higher = stricter prompt adherence
          seed: Math.floor(Math.random() * 1000000),
          enable_safety_checker: true,
        },
      }) as { images: Array<{ url: string }> }
      
      if (!result.images || result.images.length === 0) {
        throw new Error('No images generated by FLUX API')
      }

      console.log('FLUX general generation successful!')
      return result.images[0].url
    }
  } catch (error) {
    console.error('Error generating with FLUX:', error)
    throw error
  }
}

/**
 * Generate visualization using Qwen Image Edit Plus LoRA - Integrate Product
 * This model is specifically designed for product integration with automatic
 * perspective and lighting correction, providing excellent product adherence.
 */
export async function generateWithQwenIntegrateProduct(
  options: FLUXGenerationOptions,
  model: VisualizationModel
): Promise<string> {
  try {
    if (!FAL_API_KEY) {
      throw new Error('FAL API key is not configured. Please add your API key to the .env file.')
    }

    console.log('Using Qwen Integrate Product model for enhanced product adherence...')
    console.log(`Model type: ${isPoolModel(model) ? 'POOL' : 'Tiny Home'}`)

    // Convert property image to data URL
    console.log('Converting property image to data URL...')
    const propertyImageDataUrl = await fileToDataUrl(options.propertyImage)

    // Fetch product image (tiny home or pool) as data URL
    console.log('Fetching product image...')
    const productImageDataUrl = await fetchImageAsDataUrl(options.tinyHomeImageUrl)

    // Build integration prompt
    const prompt = buildQwenIntegrationPrompt(model, options.lightingPrompt)

    // Use API default negative prompt
    const negativePrompt = ' '

    // Adjusted settings for natural integration and transformation
    // Lower lora_scale allows more transformation/blending
    // Higher guidance_scale ensures prompt is followed
    // More inference steps improve blending quality
    const params = {
      lora_scale: isPoolModel(model) ? 0.7 : 1.0, // Lower for pools (0.7) to allow transformation, default for tiny homes
      guidance_scale: isPoolModel(model) ? 2.0 : 1.0, // Higher for pools (2.0) to ensure transformation prompt is followed, default for tiny homes
      num_inference_steps: isPoolModel(model) ? 10 : 6, // More steps for pools (10) for better blending, default for tiny homes
      enable_safety_checker: true, // Default value
      output_format: 'png' as const, // Default value
      num_images: 1, // Default value
      acceleration: 'regular' as const, // Default value
    }

    console.log('Calling Qwen Integrate Product model...')
    console.log(`Qwen Parameters - Model: ${isPoolModel(model) ? 'POOL' : 'Tiny Home'}`)
    console.log(`  LoRA Scale: ${params.lora_scale} (${isPoolModel(model) ? 'lowered for transformation' : 'default'})`)
    console.log(`  Guidance Scale: ${params.guidance_scale} (${isPoolModel(model) ? 'increased for prompt adherence' : 'default'})`)
    console.log(`  Inference Steps: ${params.num_inference_steps} (${isPoolModel(model) ? 'increased for blending' : 'default'})`)
    console.log(`  Acceleration: ${params.acceleration}`)

    // The model expects image_urls as an array: [background_image, product_image]
    const result = await fal.subscribe('fal-ai/qwen-image-edit-plus-lora-gallery/integrate-product', {
      input: {
        image_urls: [propertyImageDataUrl, productImageDataUrl],
        prompt: prompt,
        negative_prompt: negativePrompt,
        lora_scale: params.lora_scale,
        guidance_scale: params.guidance_scale,
        num_inference_steps: params.num_inference_steps,
        enable_safety_checker: params.enable_safety_checker,
        output_format: params.output_format,
        num_images: params.num_images,
        acceleration: params.acceleration,
      },
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === 'IN_PROGRESS') {
          update.logs?.map((log: any) => log.message).forEach(console.log)
        }
      },
    }) as any

    // Handle different possible response formats
    let imageUrl: string | undefined
    
    if (result.images && Array.isArray(result.images) && result.images.length > 0) {
      imageUrl = result.images[0].url
    } else if (result.data?.images && Array.isArray(result.data.images) && result.data.images.length > 0) {
      imageUrl = result.data.images[0].url
    } else if (result.image?.url) {
      imageUrl = result.image.url
    } else if (result.data?.image?.url) {
      imageUrl = result.data.image.url
    }

    if (!imageUrl) {
      console.error('Unexpected response format from Qwen Integrate Product:', result)
      throw new Error('No images generated by Qwen Integrate Product API - unexpected response format')
    }

    console.log('Qwen Integrate Product generation successful!')
    return imageUrl
  } catch (error) {
    console.error('Error generating with Qwen Integrate Product:', error)
    throw error
  }
}

/**
 * Build integration-focused prompt for Qwen Integrate Product model
 * This model automatically handles perspective and lighting, so we focus on
 * integration quality and product preservation
 */
function buildQwenIntegrationPrompt(
  model: VisualizationModel,
  lightingPrompt?: string
): string {
  if (isPoolModel(model)) {
    // Explicit prompt for transformation and blending
    return `Transform and blend the swimming pool from the product image into the background property image. 

Automatically correct the pool's perspective to match the background's camera angle and ground plane. Transform the pool's orientation, scale, and proportions to align naturally with the background. The pool must appear naturally excavated into the ground with realistic shadows, terrain interaction, and seamless blending - not just overlaid on top.${lightingPrompt ? ` ${lightingPrompt}` : ''}`
  }

  return `Seamlessly integrate the tiny home from the product image into the property background with maximum product adherence and natural positioning.

CRITICAL PRODUCT ADHERENCE:
- Preserve the EXACT tiny home design, dimensions, architectural features, and proportions from the product image
- Do NOT modify, simplify, or adjust any part of the structure's design or appearance
- Maintain precise architectural details, window placement, materials, and colors exactly as shown
- Keep all structural elements, proportions, and design features identical to the product image

NATURAL POSITIONING & INTEGRATION:
- Position the tiny home naturally within the property, respecting terrain, pathways, and existing features
- Create realistic foundation and ground interaction with proper contact shadows and terrain adaptation
- Ensure the tiny home appears naturally placed on the property, not floating or artificially positioned
- Match the property's natural lighting conditions with accurate shadows, highlights, and ambient light
- Automatically correct perspective to match the property's camera angle
- Match window reflections to the sky and environment for photorealistic appearance
- Maintain architectural integrity while ensuring natural integration with surroundings

The result should look like a professional photograph of this exact tiny home physically placed on this property, with perfect product adherence and natural integration.${lightingPrompt ? ` ${lightingPrompt}` : ''}`
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
