import { Routes, Route } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import HomePage from './pages/HomePage'
import VisualizerPage from './pages/VisualizerPage'
import InteriorGeneratorPage from './pages/InteriorGeneratorPage'

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/visualizer" element={<VisualizerPage />} />
        <Route path="/interior" element={<InteriorGeneratorPage />} />
      </Routes>
      <Analytics />
    </div>
  )
}

export default App
