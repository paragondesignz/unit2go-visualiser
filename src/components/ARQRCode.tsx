import { QRCodeSVG } from 'qrcode.react'
import { useNavigate } from 'react-router-dom'

function ARQRCode() {
  const navigate = useNavigate()
  
  // Get the current origin and construct the AR page URL
  const getARUrl = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/ar`
    }
    return '/ar'
  }

  return (
    <section className="ar-qr-section" style={{
      padding: '3rem 1rem',
      backgroundColor: '#f8f9fa',
      textAlign: 'center',
      marginTop: '3rem'
    }}>
      <h2 style={{
        fontSize: '2rem',
        marginBottom: '1rem',
        color: '#333'
      }}>
        Try AR Pool Visualizer
      </h2>
      <p style={{
        fontSize: '1.1rem',
        color: '#666',
        marginBottom: '2rem',
        maxWidth: '600px',
        margin: '0 auto 2rem'
      }}>
        Scan this QR code with your phone to access the AR Pool Visualizer. 
        Place a 3D pool in your yard and generate photorealistic visualizations!
      </p>
      
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem'
      }}>
        <div style={{
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          display: 'inline-block'
        }}>
          <QRCodeSVG
            value={getARUrl()}
            size={200}
            level="H"
            includeMargin={true}
          />
        </div>
        
        <button
          onClick={() => navigate('/ar')}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: '600',
            backgroundColor: '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#0052a3'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#0066cc'}
        >
          Or Click Here to Open AR Mode
        </button>
        
        <p style={{
          fontSize: '0.9rem',
          color: '#999',
          marginTop: '0.5rem'
        }}>
          {getARUrl()}
        </p>
      </div>
    </section>
  )
}

export default ARQRCode

