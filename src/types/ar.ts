export interface ARPoolDimensions {
  length: number // meters
  width: number  // meters
  depth: number  // meters
}

export interface ARPoolPosition {
  x: number      // position on ground plane
  y: number      // position on ground plane
  z: number      // position on ground plane
  rotation: number // rotation around Y axis (degrees)
  scale: number  // scale factor
}

export interface ARCaptureData {
  baseImage: string      // base64 data URL of camera photo
  maskImage: string      // base64 data URL of mask (white = pool area, black = background)
  dimensions: ARPoolDimensions
  position: ARPoolPosition
}

export interface ARGenerationResult {
  success: boolean
  imageUrl?: string
  error?: string
}

