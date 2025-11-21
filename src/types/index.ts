export interface TinyHomeModel {
  id: string
  name: string
  dimensions: {
    length: number  // meters
    width: number   // meters
    height: number  // meters
  }
  price: number
  imageUrl: string
  description: string
  features: string[]
  productUrl?: string
}

export interface PoolModel {
  id: string
  name: string
  dimensions: {
    length: number  // meters
    width: number   // meters
    depth: number   // meters
  }
  price: number
  imageUrl: string
  description: string
  features: string[]
  productUrl?: string
}

export type VisualizationModel = TinyHomeModel | PoolModel

export function isTinyHomeModel(model: VisualizationModel): model is TinyHomeModel {
  return 'height' in model.dimensions
}

export function isPoolModel(model: VisualizationModel): model is PoolModel {
  return 'depth' in model.dimensions
}

export interface UploadedImage {
  file: File
  url: string
  preview: string
  increasedAccuracy?: boolean
  personHeight?: number
}

export interface Position {
  x: number
  y: number
  scale: number
  rotation: number
}

export interface VisualizationResult {
  imageUrl: string
  prompt?: string
  modelSettings?: {
    model?: string
    temperature?: number
    topP?: number
    topK?: number
    guidanceScale?: number
    numInferenceSteps?: number
    strength?: number
    referenceStrength?: number
    controlnetConditioningScale?: number
    imageSize?: ImageResolution
    aspectRatio?: string
    thoughtSignature?: string
    googleSearchUsed?: boolean
  }
  position: Position
}

export type ImageModelProvider = 'gemini' | 'flux'

export interface DepthMapData {
  imageUrl: string
  width: number
  height: number
}

export type VisualizationStyle =
  | 'Realistic'
  | 'Cinematic'
  | 'Golden Hour'
  | 'Modern'
  | 'Rustic'
  | 'Architectural'

export type ImageResolution = '1K' | '2K' | '4K'

export interface FLUXGenerationOptions {
  propertyImage: File
  tinyHomeImageUrl: string
  depthMap?: DepthMapData
  clickPosition?: { x: number; y: number }
  lightingPrompt?: string
  style?: VisualizationStyle
  controlnetStrength?: number
}

export interface NanoBananaProOptions {
  imageSize?: ImageResolution
  enableGoogleSearch?: boolean
  useThinkingProcess?: boolean
  maxInputImages?: number
  temperature?: number
  topP?: number
  topK?: number
  // Enhanced accuracy features for 100% product fidelity
  useMultiReferenceAccuracy?: boolean    // Use multiple reference images for better accuracy
  enableGeometricVerification?: boolean  // Add step-by-step geometric analysis
  preserveOriginalLighting?: boolean     // Preserve user's image lighting for first generation
  accuracyMode?: 'standard' | 'maximum' | 'ultra' // Accuracy level control
  // Advanced lighting control
  lightingPreservationMode?: 'strict' | 'adaptive' | 'off' // How strictly to preserve lighting
}
