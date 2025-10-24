import { useState, useRef } from 'react'
import { UploadedImage } from '../types'
import heic2any from 'heic2any'

interface ImageUploadProps {
  onImageUpload: (image: UploadedImage) => void
}

function ImageUpload({ onImageUpload }: ImageUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [increasedAccuracy, setIncreasedAccuracy] = useState(false)
  const [personHeight, setPersonHeight] = useState<number>(170) // cm
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = async (file: File) => {
    setProcessing(true)
    setError(null)

    try {
      // Check file size (max 20MB)
      if (file.size > 20 * 1024 * 1024) {
        throw new Error('File size must be less than 20MB')
      }

      let processedFile = file

      // Convert HEIC to JPEG if needed
      if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
        try {
          const convertedBlob = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.9
          })
          const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob
          processedFile = new File([blob], file.name.replace(/\.heic$/i, '.jpg'), {
            type: 'image/jpeg'
          })
        } catch (heicError) {
          console.error('HEIC conversion error:', heicError)
          throw new Error('Failed to convert HEIC image. Please use JPEG or PNG.')
        }
      }

      // Check if it's a valid image
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
      if (!validTypes.includes(processedFile.type)) {
        throw new Error('Please upload a JPEG, PNG, or WebP image')
      }

      const url = URL.createObjectURL(processedFile)
      const preview = url

      onImageUpload({
        file: processedFile,
        url,
        preview,
        increasedAccuracy,
        personHeight
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process image')
    } finally {
      setProcessing(false)
    }
  }

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="image-upload">
      <div className="upload-instructions">
        <h2>Upload Your Space</h2>
        <p>Take or upload a photo of where you'd like to place your Unit2Go tiny home</p>
        <ul className="upload-tips">
          <li>Choose a clear, well-lit outdoor photo</li>
          <li>Include reference objects (trees, fences, buildings) for scale</li>
          <li>Ensure the ground area where you want the tiny home is visible</li>
          <li>Supported formats: JPEG, PNG, WebP, HEIC (max 20MB)</li>
        </ul>
      </div>

      <div className="accuracy-panel">
        <h3>Increased Accuracy Mode</h3>
        <div className="accuracy-toggle">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={increasedAccuracy}
              onChange={(e) => setIncreasedAccuracy(e.target.checked)}
              className="accuracy-checkbox"
            />
            <span className="toggle-text">Enable for maximum accuracy</span>
          </label>
        </div>
        {increasedAccuracy && (
          <div className="accuracy-settings">
            <p className="accuracy-info">
              <strong>Include a person in your photo</strong> for the most accurate tiny home sizing. <em>The person will be removed from the final image.</em>
            </p>
            <div className="accuracy-tips">
              <strong>Tips:</strong>
              <ul>
                <li>Have the person stand in the area where you're considering placement</li>
                <li>Ensure the person is clearly visible in the photo</li>
                <li>The AI will use the person's height as the primary scale reference</li>
                <li>Don't worry - the person will be automatically removed from the visualization</li>
              </ul>
            </div>
            <div className="height-input-group">
              <label htmlFor="personHeight" className="input-label">
                Person's Height
              </label>
              <div className="height-inputs">
                <div className="input-with-unit">
                  <input
                    id="personHeight"
                    type="number"
                    min="140"
                    max="220"
                    value={personHeight}
                    onChange={(e) => setPersonHeight(parseInt(e.target.value) || 170)}
                    className="height-input"
                  />
                  <span className="input-unit">cm</span>
                </div>
                <span className="height-conversion">
                  ({(personHeight / 100).toFixed(2)}m / {Math.floor(personHeight / 30.48)}'{Math.round((personHeight % 30.48) / 2.54)}")
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className={`upload-zone ${dragActive ? 'drag-active' : ''} ${processing ? 'processing' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleButtonClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="file-input"
          accept="image/jpeg,image/png,image/webp,image/heic"
          onChange={handleChange}
        />

        {processing ? (
          <div className="upload-status">
            <div className="spinner-small"></div>
            <p>Processing image...</p>
          </div>
        ) : (
          <>
            <div className="upload-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="upload-main-text">
              <strong>Click to upload</strong> or drag and drop
            </p>
            <p className="upload-sub-text">JPEG, PNG, WebP, or HEIC (max 20MB)</p>
          </>
        )}
      </div>

      {error && (
        <div className="upload-error">
          <p>{error}</p>
          <button onClick={() => setError(null)} className="error-dismiss">
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

export default ImageUpload
