import * as fal from '@fal-ai/serverless-client'

const FAL_API_KEY = import.meta.env.VITE_FAL_API_KEY || ''

if (!FAL_API_KEY) {
    console.error('FAL API key is missing. Please add VITE_FAL_API_KEY to your .env file')
}

// Configure fal client
fal.config({
    credentials: FAL_API_KEY,
})

/**
 * Removes an object from an image using professional inpainting.
 * Uses FAL.AI's Fooocus inpainting model which is specifically optimized
 * for object removal and background completion.
 */
export async function removeObjectFromImage(
    imageDataUrl: string,
    maskDataUrl: string,
    prompt: string = 'Remove the masked object and fill in the background naturally to match the surrounding scene.'
): Promise<string> {
    if (!FAL_API_KEY) {
        throw new Error('FAL API key is not configured. Please add VITE_FAL_API_KEY to your .env file.')
    }

    console.log('Sending inpainting request to FAL.AI Fooocus...')

    try {
        // Convert data URLs to proper format for FAL.AI
        const imageFile = dataUrlToFile(imageDataUrl, 'image.png')
        const maskFile = dataUrlToFile(maskDataUrl, 'mask.png')

        const result = await fal.subscribe('fal-ai/fooocus/inpaint', {
            input: {
                image_url: imageFile,
                mask_url: maskFile,
                prompt: prompt,
                inpaint_additional_prompt: 'high quality, natural lighting, seamless background',
                negative_prompt: 'low quality, blurry, artifacts, distorted, unnatural',
                mixing_image_prompt_and_inpaint_prompt: 1.0,
                mixing_image_prompt_and_vary_prompt: 0.0,
                sharpness: 2.0,
                guidance_scale: 4.0,
                adm_scaler_positive: 1.5,
                adm_scaler_negative: 0.8,
                adm_scaler_end: 0.3,
                refiner_switch: 0.5,
                inpaint_engine: 'v2.6',
                performance_selection: 'Quality',
                aspect_ratios_selection: 'auto'
            },
        }) as { images: Array<{ url: string }> }

        if (!result.images || result.images.length === 0) {
            throw new Error('No image generated during inpainting')
        }

        console.log('Inpainting successful with FAL.AI!')

        // Convert the result URL back to a data URL for consistency
        const resultImageUrl = result.images[0].url
        const imageResponse = await fetch(resultImageUrl)
        const imageBlob = await imageResponse.blob()

        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(imageBlob)
        })

    } catch (error) {
        console.error('FAL.AI inpainting failed:', error)
        throw new Error(`Inpainting failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
}

/**
 * Convert a data URL to a File object for FAL.AI upload
 */
function dataUrlToFile(dataUrl: string, filename: string): File {
    const arr = dataUrl.split(',')
    const mime = arr[0].match(/:(.*?);/)![1]
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n)
    }
    return new File([u8arr], filename, { type: mime })
}
