import * as fal from '@fal-ai/serverless-client'
import { FLUXGenerationOptions, TinyHomeModel, PlacementPreferences, DepthMapData } from '../types'

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
 * Build photorealistic prompt for FLUX based on placement preferences
 */
function buildFLUXPrompt(
  tinyHomeModel: TinyHomeModel,
  placementPreferences: PlacementPreferences,
  lightingPrompt?: string
): string {
  const horizontalDescriptions = {
    left: 'positioned toward the left side of the property',
    center: 'centrally positioned in the scene',
    right: 'positioned toward the right side of the property',
  }

  const depthDescriptions = {
    foreground: 'in the foreground, close to the camera with strong presence and clearly visible architectural details',
    midground: 'at mid-ground distance with balanced visibility showing both structure and surrounding context',
    background: 'in the background, integrated into the wider landscape with environmental context',
  }

  return `A photorealistic photograph of a ${tinyHomeModel.name} tiny home (${tinyHomeModel.dimensions.length}m × ${tinyHomeModel.dimensions.width}m × ${tinyHomeModel.dimensions.height}m) seamlessly integrated into an outdoor property. The tiny home is ${horizontalDescriptions[placementPreferences.horizontal]}, ${depthDescriptions[placementPreferences.depth]}.

CRITICAL PHOTOREALISM: Transform into a realistic outdoor structure with natural weathering - subtle dirt accumulation, minor color variations in materials, realistic surface imperfections, outdoor patina. Add very subtle water staining under roof edges from rain exposure. Materials show authentic texture variations with slight scratches and realistic wear.

Cast natural contact shadows with soft falloff - darker at ground contact, gradually softening at edges with realistic penumbra. Match exact lighting from the property photo - same shadow softness, reflection intensity, color temperature. Windows reflect the actual sky and environment. Soften edges slightly to match photographic lens characteristics.

Ground contact shows realistic terrain interaction - grass or dirt slightly displaced at foundation, natural settling. Match the color palette and atmospheric characteristics of the property photograph exactly. The result must be indistinguishable from a photograph where the tiny home was actually present.

Captured with 50mm lens at eye level (1.6m), natural depth of field, photographic grain matching the base image.${lightingPrompt ? ` ${lightingPrompt}` : ''}`
}

/**
 * Generate visualization using FLUX.1 with ControlNet depth guidance
 */
export async function generateWithFLUX(
  options: FLUXGenerationOptions,
  tinyHomeModel: TinyHomeModel
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
      tinyHomeModel,
      options.placementPreferences,
      options.lightingPrompt
    )

    console.log('Calling FLUX.1 ControlNet Inpainting API...')

    // Use FLUX dev with LoRA and ControlNet for inpainting
    const result = await fal.subscribe('fal-ai/flux-dev/lora/controlnet-inpaint', {
      input: {
        image_url: propertyImageDataUrl,
        prompt: prompt,
        control_image_url: depthMap.imageUrl,
        controlnet_conditioning_scale: options.controlnetStrength || 0.9,
        num_inference_steps: 28,
        guidance_scale: 3.5,
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
