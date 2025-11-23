import { useNavigate } from 'react-router-dom'

function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="home-page">
      <header className="hero">
        <div className="hero-logo-container">
          <img src="/unit2go-logo.png" alt="Unit2Go" className="hero-logo" />
        </div>
        <h1 className="hero-title">AI Visualiser</h1>
        <p className="hero-subtitle">Visualize your dream tiny home in your own space using AI</p>

        <div className="cta-buttons" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            className="cta-button primary"
            onClick={() => navigate('/visualizer')}
            style={{
              padding: '1rem 2rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1.1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              minWidth: '200px'
            }}
          >
            Exterior Visualizer
          </button>
          <button
            className="cta-button secondary"
            onClick={() => navigate('/interior')}
            style={{
              padding: '1rem 2rem',
              backgroundColor: 'white',
              color: '#007bff',
              border: '2px solid #007bff',
              borderRadius: '8px',
              fontSize: '1.1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              minWidth: '200px'
            }}
          >
            Interior Generator
            <span style={{ fontSize: '0.8rem', display: 'block', fontWeight: '400', marginTop: '0.25rem' }}>
              NEW!
            </span>
          </button>
        </div>
      </header>

      <section className="features-intro">
        <h2>Two Ways to Visualize Your Dream Home</h2>
        <p>Choose between exterior property visualization or detailed interior exploration</p>
      </section>

      <section className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', margin: '2rem 0' }}>
        <div className="feature-section" style={{ padding: '2rem', border: '1px solid #e0e0e0', borderRadius: '12px' }}>
          <h3 style={{ color: '#007bff', marginBottom: '1rem' }}>🏡 Exterior Visualizer</h3>
          <div className="feature-steps">
            <div className="feature-step">
              <span className="step-number" style={{ background: '#007bff', color: 'white', padding: '0.5rem', borderRadius: '50%', marginRight: '1rem' }}>1</span>
              <div>
                <h4>Upload Property Photo</h4>
                <p>Take a photo of your outdoor space</p>
              </div>
            </div>
            <div className="feature-step" style={{ marginTop: '1rem' }}>
              <span className="step-number" style={{ background: '#007bff', color: 'white', padding: '0.5rem', borderRadius: '50%', marginRight: '1rem' }}>2</span>
              <div>
                <h4>Select Tiny Home Model</h4>
                <p>Choose from our premium collection</p>
              </div>
            </div>
            <div className="feature-step" style={{ marginTop: '1rem' }}>
              <span className="step-number" style={{ background: '#007bff', color: 'white', padding: '0.5rem', borderRadius: '50%', marginRight: '1rem' }}>3</span>
              <div>
                <h4>AI Placement & Customization</h4>
                <p>Smart positioning with enhancement options</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/visualizer')}
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            Start Exterior Visualization
          </button>
        </div>

        <div className="feature-section" style={{ padding: '2rem', border: '1px solid #e0e0e0', borderRadius: '12px' }}>
          <h3 style={{ color: '#28a745', marginBottom: '1rem' }}>🏠 Interior Generator <span style={{ fontSize: '0.8rem', background: '#28a745', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', marginLeft: '0.5rem' }}>NEW!</span></h3>
          <div className="feature-steps">
            <div className="feature-step">
              <span className="step-number" style={{ background: '#28a745', color: 'white', padding: '0.5rem', borderRadius: '50%', marginRight: '1rem' }}>1</span>
              <div>
                <h4>Select Floor Plan Model</h4>
                <p>Choose a top-down layout view</p>
              </div>
            </div>
            <div className="feature-step" style={{ marginTop: '1rem' }}>
              <span className="step-number" style={{ background: '#28a745', color: 'white', padding: '0.5rem', borderRadius: '50%', marginRight: '1rem' }}>2</span>
              <div>
                <h4>Position Virtual Camera</h4>
                <p>Click anywhere on the floor plan</p>
              </div>
            </div>
            <div className="feature-step" style={{ marginTop: '1rem' }}>
              <span className="step-number" style={{ background: '#28a745', color: 'white', padding: '0.5rem', borderRadius: '50%', marginRight: '1rem' }}>3</span>
              <div>
                <h4>Generate Interior Photos</h4>
                <p>Professional interior photography from any angle</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/interior')}
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            Try Interior Generator
          </button>
        </div>
      </section>

      <section className="info-section">
        <h2>Experience Your Future Home</h2>
        <p>
          Unit2Go Vision uses advanced AI technology to help you visualize how our premium
          deluxe tiny home will look on your property. Simply upload a photo, select your model,
          and our AI intelligently places a realistic representation in your space. Customize the
          scene with Quick Enhancements like decks, landscaping, and furniture, or use natural
          language editing for unlimited creative possibilities.
        </p>
        <p style={{ marginTop: '1rem', fontSize: '0.95rem', opacity: 0.8, fontStyle: 'italic' }}>
          Images are AI-generated artistic representations for entertainment purposes only.
          Results may vary and should not be used as a substitute for professional advice.
        </p>
      </section>

      <footer className="home-footer">
        <p>&copy; 2025 Unit2Go. All rights reserved.</p>
        <p>
          <a href="https://unit2go.co.nz" target="_blank" rel="noopener noreferrer">
            Visit Unit2Go Website
          </a>
        </p>
      </footer>
    </div>
  )
}

export default HomePage
