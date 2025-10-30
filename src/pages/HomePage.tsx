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
        <button
          className="cta-button"
          onClick={() => navigate('/visualizer')}
        >
          Get Started
        </button>
      </header>

      <section className="features">
        <div className="feature-card">
          <div className="feature-number">1</div>
          <h3>Upload Your Photo</h3>
          <p>Take or upload a photo of your property or outdoor space where you'd like to place your tiny home</p>
        </div>

        <div className="feature-arrow">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </div>

        <div className="feature-card">
          <div className="feature-number">2</div>
          <h3>AI Visualization</h3>
          <p>Our AI automatically places your selected tiny home model in a natural position on your property</p>
        </div>

        <div className="feature-arrow">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </div>

        <div className="feature-card">
          <div className="feature-number">3</div>
          <h3>Customize & Download</h3>
          <p>Use Quick Enhancements and natural language editing to personalize your scene, then download to share</p>
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
