import React, { useRef, useEffect, useState } from 'react'
import { VisualizationModel, isPoolModel } from '../types'

interface PositioningCanvasProps {
    imageUrl: string
    depthMapUrl: string | null
    model: VisualizationModel
    onPositionChange: (position: { x: number, y: number, scale: number, rotation: number, wireframeImage: string }) => void
}

export default function PositioningCanvas({ imageUrl, depthMapUrl, model, onPositionChange }: PositioningCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const depthCanvasRef = useRef<HTMLCanvasElement>(null)

    // Position is in percentage (0-100) relative to image
    const [pos, setPos] = useState({ x: 50, y: 50 })
    const [scale, setScale] = useState(1.0)
    const [rotation, setRotation] = useState(0)
    const [isDragging, setIsDragging] = useState(false)
    const [showDepthMap, setShowDepthMap] = useState(false)
    const [smartScaleEnabled, setSmartScaleEnabled] = useState(true)

    // Load depth map into a hidden canvas for pixel reading
    useEffect(() => {
        if (!depthMapUrl) return

        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = depthMapUrl
        img.onload = () => {
            const canvas = depthCanvasRef.current
            if (canvas) {
                canvas.width = img.width
                canvas.height = img.height
                const ctx = canvas.getContext('2d')
                ctx?.drawImage(img, 0, 0)
            }
        }
    }, [depthMapUrl])

    // Draw the main canvas (Image + Box)
    useEffect(() => {
        drawCanvas()
    }, [imageUrl, pos, scale, rotation, showDepthMap, depthMapUrl])

    const drawCanvas = () => {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return

        const img = new Image()
        img.src = imageUrl
        img.onload = () => {
            canvas.width = img.width
            canvas.height = img.height

            // Draw background
            ctx.drawImage(img, 0, 0)

            // Draw depth map overlay if enabled
            if (showDepthMap && depthMapUrl) {
                const depthImg = new Image()
                depthImg.src = depthMapUrl
                depthImg.onload = () => {
                    ctx.globalAlpha = 0.5
                    ctx.drawImage(depthImg, 0, 0, canvas.width, canvas.height)
                    ctx.globalAlpha = 1.0
                    drawBox(ctx, canvas.width, canvas.height)
                }
                // If depth map isn't loaded yet, we might miss this frame, but effect dependency handles it
            } else {
                drawBox(ctx, canvas.width, canvas.height)
            }
        }
        // If image is cached, onload might not fire immediately if we don't handle it carefully, 
        // but for this simple component, it usually works. 
        // Better to use a ref for the loaded image to avoid reloading.
    }

    const drawBox = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
        const x = (pos.x / 100) * width
        const y = (pos.y / 100) * height

        // Base size of the box (arbitrary reference size, scaled by 'scale')
        const baseSize = Math.min(width, height) * 0.2
        const boxWidth = baseSize * scale * (model.dimensions.length / 5) // Normalize roughly
        const boxHeight = baseSize * scale * (model.dimensions.width / 5)

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate((rotation * Math.PI) / 180)

        // Draw 3D-like box wireframe
        ctx.strokeStyle = '#007bff'
        ctx.lineWidth = 3
        ctx.fillStyle = 'rgba(0, 123, 255, 0.2)'

        // Ground rect
        ctx.beginPath()
        ctx.rect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight)
        ctx.fill()
        ctx.stroke()

        // Front face (simple perspective hint)
        const height3d = isPoolModel(model) ? 0 : boxHeight * 0.8 // Pools are flat-ish

        if (height3d > 0) {
            ctx.beginPath()
            ctx.moveTo(-boxWidth / 2, -boxHeight / 2)
            ctx.lineTo(-boxWidth / 2, -boxHeight / 2 - height3d)
            ctx.lineTo(boxWidth / 2, -boxHeight / 2 - height3d)
            ctx.lineTo(boxWidth / 2, -boxHeight / 2)
            ctx.stroke()

            // Roof/Top
            ctx.beginPath()
            ctx.moveTo(-boxWidth / 2, -boxHeight / 2 - height3d)
            ctx.lineTo(-boxWidth / 2 + boxWidth * 0.2, -boxHeight / 2 - height3d - boxHeight * 0.2) // Fake perspective
            ctx.stroke()
        }

        // Center cross
        ctx.beginPath()
        ctx.moveTo(-10, 0)
        ctx.lineTo(10, 0)
        ctx.moveTo(0, -10)
        ctx.lineTo(0, 10)
        ctx.strokeStyle = 'white'
        ctx.lineWidth = 2
        ctx.stroke()

        ctx.restore()
    }

    const handleMouseDown = (_e: React.MouseEvent) => {
        setIsDragging(true)
    }

    const handleMouseUp = () => {
        setIsDragging(false)
        generateWireframe()
    }

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !containerRef.current) return

        const rect = containerRef.current.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100

        setPos({ x, y })

        if (smartScaleEnabled && depthCanvasRef.current) {
            // Sample depth
            const depthCtx = depthCanvasRef.current.getContext('2d')
            if (depthCtx) {
                // Map screen coordinates to depth map coordinates
                const depthX = Math.floor((x / 100) * depthCanvasRef.current.width)
                const depthY = Math.floor((y / 100) * depthCanvasRef.current.height)

                const pixel = depthCtx.getImageData(depthX, depthY, 1, 1).data
                // Grayscale depth map: lighter = closer, darker = further (usually)
                // Or MiDaS: lighter = closer.
                // Let's assume 0-255. 255 = close, 0 = far.
                const depthValue = pixel[0]

                // Scale factor: Close (255) -> 1.5, Far (0) -> 0.2
                // This is a heuristic.
                const newScale = 0.2 + (depthValue / 255) * 1.3
                setScale(newScale)
            }
        }
    }

    const generateWireframe = () => {
        // Create a separate canvas just for the wireframe to send to AI
        const canvas = document.createElement('canvas')
        // Match original image dimensions
        const img = new Image()
        img.src = imageUrl
        img.onload = () => {
            canvas.width = img.width
            canvas.height = img.height
            const ctx = canvas.getContext('2d')
            if (ctx) {
                // Transparent background
                // Draw just the box in white/bold for the AI to see
                const width = canvas.width
                const height = canvas.height
                const x = (pos.x / 100) * width
                const y = (pos.y / 100) * height

                const baseSize = Math.min(width, height) * 0.2
                const boxWidth = baseSize * scale * (model.dimensions.length / 5)
                const boxHeight = baseSize * scale * (model.dimensions.width / 5)

                ctx.save()
                ctx.translate(x, y)
                ctx.rotate((rotation * Math.PI) / 180)

                ctx.strokeStyle = 'white'
                ctx.lineWidth = 5
                ctx.beginPath()
                ctx.rect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight)
                ctx.stroke()

                // Fill slightly to indicate solid object
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
                ctx.fill()

                ctx.restore()

                onPositionChange({
                    x: pos.x,
                    y: pos.y,
                    scale,
                    rotation,
                    wireframeImage: canvas.toDataURL('image/png')
                })
            }
        }
    }

    return (
        <div className="positioning-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div
                ref={containerRef}
                style={{ position: 'relative', width: '100%', maxWidth: '800px', cursor: isDragging ? 'grabbing' : 'grab' }}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseUp}
            >
                <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px' }} />
                <canvas ref={depthCanvasRef} style={{ display: 'none' }} />
            </div>

            <div className="controls" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                        type="checkbox"
                        checked={smartScaleEnabled}
                        onChange={(e) => setSmartScaleEnabled(e.target.checked)}
                    />
                    Smart Scale (Depth)
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                        type="checkbox"
                        checked={showDepthMap}
                        onChange={(e) => setShowDepthMap(e.target.checked)}
                    />
                    Show Depth Map
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label>Scale:</label>
                    <input
                        type="range"
                        min="0.1"
                        max="3"
                        step="0.1"
                        value={scale}
                        onChange={(e) => {
                            setScale(Number(e.target.value))
                            setSmartScaleEnabled(false) // Disable smart scale if manual override
                        }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label>Rotation:</label>
                    <input
                        type="range"
                        min="0"
                        max="360"
                        value={rotation}
                        onChange={(e) => setRotation(Number(e.target.value))}
                    />
                </div>
            </div>
        </div>
    )
}
