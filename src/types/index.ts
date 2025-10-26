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
  position: Position
}

export type HorizontalPosition = 'left' | 'center' | 'right'
export type DepthPosition = 'foreground' | 'midground' | 'background'

export interface PlacementPreferences {
  horizontal: HorizontalPosition
  depth: DepthPosition
}

export type ImageModelProvider = 'gemini' | 'flux'

export interface DepthMapData {
  imageUrl: string
  width: number
  height: number
}

export interface FLUXGenerationOptions {
  propertyImage: File
  tinyHomeImageUrl: string
  depthMap?: DepthMapData
  clickPosition?: { x: number; y: number }
  placementPreferences: PlacementPreferences
  lightingPrompt?: string
  controlnetStrength?: number
}
