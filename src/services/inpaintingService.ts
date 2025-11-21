import { GoogleGenAI } from '@google/genai'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''

const ai = new GoogleGenAI({
    apiKey: API_KEY,
})

/**
 * Removes an object from an image using inpainting.
 * Uses Gemini 2.5 Flash Image (or Imagen 3 if available via specific endpoint)
 * to fill in the masked area.
 */
export async function removeObjectFromImage(
    imageDataUrl: string,
    maskDataUrl: string,
    prompt: string = 'Remove the masked object and fill in the background naturally to match the surrounding scene.'
): Promise<string> {
    if (!API_KEY) {
        throw new Error('Gemini API key is not configured.')
    }

    const imageBase64 = imageDataUrl.split(',')[1]
    const maskBase64 = maskDataUrl.split(',')[1]

    // Using gemini-2.5-flash-image for editing/inpainting
    const model = 'gemini-2.5-flash-image'

    const config = {
        temperature: 0.4,
        responseModalities: ['Image'] as string[],
    }

    const contents = [
        {
            role: 'user' as const,
            parts: [
                {
                    text: prompt,
                },
                {
                    inlineData: {
                        mimeType: 'image/png',
                        data: imageBase64,
                    },
                },
                // Note: Gemini API for editing typically takes the mask as a separate input 
                // or expects the prompt to describe the change if no explicit mask support 
                // is available in the generic generateContent. 
                // However, for true inpainting, we often pass the mask image.
                // If the current SDK version supports multi-image input where one is a mask, we do this:
                {
                    inlineData: {
                        mimeType: 'image/png',
                        data: maskBase64,
                    },
                },
            ],
        },
    ]

    console.log('Sending inpainting request to Gemini...')

    try {
        const response = await ai.models.generateContent({
            model,
            config,
            contents,
        })

        if (!response.candidates || !response.candidates[0].content || !response.candidates[0].content.parts) {
            throw new Error('No response from Gemini API')
        }

        const imagePart = response.candidates[0].content.parts.find(part => part.inlineData)

        if (imagePart?.inlineData) {
            console.log('Inpainting successful!')
            const { mimeType, data } = imagePart.inlineData
            return `data:${mimeType};base64,${data}`
        }

        throw new Error('No image generated during inpainting.')
    } catch (error) {
        console.error('Inpainting failed:', error)
        throw error
    }
}
