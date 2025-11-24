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
  supportsInteriorViews?: boolean  // Indicates if this model supports interior camera positioning
  isTopDownView?: boolean          // Indicates if the image is a top-down floor plan view
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

export type ImageModelProvider = 'gemini'

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

// Camera positioning for interior views
export interface CameraPosition {
  x: number              // X coordinate on the floor plan (0-100%)
  y: number              // Y coordinate on the floor plan (0-100%)
  viewingAngle: number   // Horizontal viewing angle in degrees (0-360)
  height: number         // Camera height in meters (0.5-2.5m)
  fieldOfView: number    // Camera field of view in degrees (30-120)
}

export interface InteriorViewRequest {
  camera: CameraPosition
  room?: string          // Optional room name for context
  viewType: 'wide' | 'standard' | 'close-up'
  focusArea?: string     // What to focus on in the view
}

// View generation modes
export type VisualizationMode = 'exterior' | 'interior'
