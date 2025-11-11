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
  position: Position
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
  lightingPrompt?: string
  controlnetStrength?: number
}
