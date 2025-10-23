import { TinyHomeModel } from '../types'

interface TinyHomeDisplayProps {
  tinyHome: TinyHomeModel
}

function TinyHomeDisplay({ tinyHome }: TinyHomeDisplayProps) {
  return (
    <div className="tiny-home-display">
      <div className="tiny-home-card">
        <div className="tiny-home-image-container">
          <img src={tinyHome.imageUrl} alt={tinyHome.name} className="tiny-home-image" />
        </div>
        <div className="tiny-home-details">
          <h2 className="tiny-home-name">{tinyHome.name}</h2>
          <p className="tiny-home-description">{tinyHome.description}</p>
          <div className="tiny-home-specs">
            <div className="spec">
              <span className="spec-label">Dimensions</span>
              <span className="spec-value">
                {tinyHome.dimensions.length}m × {tinyHome.dimensions.width}m × {tinyHome.dimensions.height}m
              </span>
            </div>
            <div className="spec">
              <span className="spec-label">Price</span>
              <span className="spec-value">${tinyHome.price.toLocaleString()}</span>
            </div>
          </div>
          <div className="tiny-home-features">
            <h4>Features</h4>
            <ul>
              {tinyHome.features.map((feature, index) => (
                <li key={index}>{feature}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TinyHomeDisplay
