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
