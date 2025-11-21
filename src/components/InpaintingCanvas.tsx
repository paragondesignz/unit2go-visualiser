import React, { useRef, useState } from 'react'

interface InpaintingCanvasProps {
    imageUrl: string
    onMaskGenerated: (maskDataUrl: string) => void
    isProcessing: boolean
}

export default function InpaintingCanvas({ imageUrl, onMaskGenerated, isProcessing }: InpaintingCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const imageRef = useRef<HTMLImageElement>(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [brushSize, setBrushSize] = useState(30)
    // Store paths to redraw for mask generation
    const [currentPath, setCurrentPath] = useState<{ x: number, y: number, size: number }[]>([])

    const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current
        if (!canvas) return { x: 0, y: 0 }
        const rect = canvas.getBoundingClientRect()
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        }
    }

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isProcessing) return
        setIsDrawing(true)
        const { x, y } = getCoordinates(e)
        setCurrentPath([{ x, y, size: brushSize }])
    }

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || isProcessing) return
        const { x, y } = getCoordinates(e)
        setCurrentPath(prev => [...prev, { x, y, size: brushSize }])

        // Visual feedback
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (canvas && ctx) {
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.strokeStyle = 'rgba(255, 50, 50, 0.7)'
            ctx.lineWidth = brushSize
            ctx.lineTo(x, y)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(x, y)
        }
    }



    // Better approach for mask generation:
    // Whenever we finish a stroke, we update a separate hidden canvas that is purely B&W.
    // Or just iterate through the paths state in a useEffect to keep the mask up to date?

    // Let's use a Ref for paths to avoid closure staleness
    const pathsRef = useRef<{ x: number, y: number, size: number }[][]>([])

    const handleStopDrawing = () => {
        if (!isDrawing) return
        setIsDrawing(false)
        pathsRef.current.push(currentPath)
        setCurrentPath([])

        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (ctx) ctx.beginPath()

        exportMask()
    }

    const exportMask = () => {
        const canvas = canvasRef.current
        if (!canvas) return

        const maskCanvas = document.createElement('canvas')
        maskCanvas.width = canvas.width
        maskCanvas.height = canvas.height
        const ctx = maskCanvas.getContext('2d')

        if (ctx) {
            ctx.fillStyle = 'black'
            ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.strokeStyle = 'white'

            pathsRef.current.forEach(path => {
                if (path.length < 1) return
                ctx.beginPath()
                ctx.lineWidth = path[0].size
                ctx.moveTo(path[0].x, path[0].y)
                path.forEach(point => {
                    ctx.lineTo(point.x, point.y)
                })
                ctx.stroke()
            })

            onMaskGenerated(maskCanvas.toDataURL('image/png'))
        }
    }

    const clearCanvas = () => {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.beginPath()
        }
        pathsRef.current = []
        exportMask()
    }

    return (
        <div className="inpainting-container" style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ position: 'relative', maxWidth: '100%' }}>
                <img
                    ref={imageRef}
                    src={imageUrl}
                    alt="Original"
                    style={{ display: 'block', maxWidth: '100%', maxHeight: '60vh', borderRadius: '8px' }}
                    onLoad={() => {
                        if (canvasRef.current && imageRef.current) {
                            canvasRef.current.width = imageRef.current.width
                            canvasRef.current.height = imageRef.current.height
                        }
                    }}
                />
                <canvas
                    ref={canvasRef}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        cursor: isProcessing ? 'wait' : 'crosshair',
                        touchAction: 'none',
                        borderRadius: '8px'
                    }}
                    onMouseDown={startDrawing}
                    onMouseUp={handleStopDrawing}
                    onMouseOut={handleStopDrawing}
                    onMouseMove={draw}
                />
            </div>

            <div className="controls" style={{
                marginTop: '1rem',
                display: 'flex',
                gap: '1rem',
                alignItems: 'center',
                background: 'white',
                padding: '1rem',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontWeight: 500 }}>Brush Size</label>
                    <input
                        type="range"
                        min="5"
                        max="100"
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                    />
                </div>
                <button
                    onClick={clearCanvas}
                    style={{
                        padding: '0.5rem 1rem',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        background: 'white',
                        cursor: 'pointer'
                    }}
                >
                    Clear Mask
                </button>
            </div>
        </div>
    )
}
