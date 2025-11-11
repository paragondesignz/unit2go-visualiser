import { Routes, Route } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import HomePage from './pages/HomePage'
import VisualizerPage from './pages/VisualizerPage'
import ARPage from './pages/ARPage'

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/visualizer" element={<VisualizerPage />} />
        <Route path="/ar" element={<ARPage />} />
      </Routes>
      <Analytics />
    </div>
  )
}

export default App
