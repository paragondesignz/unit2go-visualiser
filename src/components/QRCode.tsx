import React, { useEffect, useRef, useState } from 'react';
import QRCodeLib from 'qrcode';

interface QRCodeProps {
  url: string;
  size?: number;
  className?: string;
  title?: string;
  description?: string;
}

const QRCode: React.FC<QRCodeProps> = ({
  url,
  size = 128,
  className = '',
  title = 'Scan to open on mobile',
  description = 'Use your phone camera to scan this QR code'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const generateQRCode = async () => {
      if (!canvasRef.current) return;

      try {
        setIsLoading(true);
        setError(null);

        await QRCodeLib.toCanvas(canvasRef.current, url, {
          width: size,
          margin: 2,
          color: {
            dark: '#1a202c', // Using the app's text-primary color
            light: '#ffffff'
          }
        });

        setIsLoading(false);
      } catch (err) {
        setError('Failed to generate QR code');
        setIsLoading(false);
        console.error('QR code generation error:', err);
      }
    };

    generateQRCode();
  }, [url, size]);

  return (
    <div className={`qr-code-container ${className}`}>
      <div className="qr-code-header">
        <h3 className="qr-code-title">{title}</h3>
        <p className="qr-code-description">{description}</p>
      </div>

      <div className="qr-code-content">
        {isLoading && (
          <div className="qr-code-loading">
            <div className="spinner-small"></div>
            <span>Generating QR code...</span>
          </div>
        )}

        {error && (
          <div className="qr-code-error">
            <span>{error}</span>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className={`qr-code-canvas ${isLoading ? 'hidden' : ''}`}
          style={{
            maxWidth: '100%',
            height: 'auto',
            display: error ? 'none' : 'block'
          }}
        />
      </div>

      <div className="qr-code-url">
        <small>{url}</small>
      </div>
    </div>
  );
};

export default QRCode;