import { useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { ARPoolDimensions, ARPoolPosition } from '../types/ar'
import * as THREE from 'three'

interface ARSceneProps {
  dimensions: ARPoolDimensions
  position: ARPoolPosition
  onPositionChange: (position: ARPoolPosition) => void
  onDimensionsChange: (dimensions: ARPoolDimensions) => void
}

// Procedural pool box component
function PoolBox({ dimensions, position }: { 
  dimensions: ARPoolDimensions
  position: ARPoolPosition
}) {
  const groupRef = useRef<THREE.Group>(null)

  // Update mesh position when position prop changes
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.set(position.x, position.y, position.z)
      groupRef.current.rotation.y = (position.rotation * Math.PI) / 180
      groupRef.current.scale.setScalar(position.scale)
    }
  }, [position])

  return (
    <group
      ref={groupRef}
      position={[position.x, position.y, position.z]}
      rotation={[0, (position.rotation * Math.PI) / 180, 0]}
      scale={position.scale}
    >
      {/* Solid pool box */}
      <mesh>
        <boxGeometry args={[dimensions.length, dimensions.depth, dimensions.width]} />
        <meshStandardMaterial 
          color="#00a8e8" 
          transparent 
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Wireframe overlay */}
      <mesh>
        <boxGeometry args={[dimensions.length, dimensions.depth, dimensions.width]} />
        <meshStandardMaterial 
          color="#0066cc" 
          transparent 
          opacity={0.5}
          wireframe={true}
        />
      </mesh>
    </group>
  )
}

// Ground plane for reference
function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial color="#90EE90" transparent opacity={0.3} />
    </mesh>
  )
}

function ARScene({ dimensions, position }: ARSceneProps) {
  return (
    <Canvas
      style={{ width: '100%', height: '100%' }}
      camera={{ position: [0, 5, 5], fov: 50 }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <PerspectiveCamera makeDefault position={[0, 5, 5]} />
      <OrbitControls enablePan enableZoom enableRotate />
      <GroundPlane />
      <PoolBox 
        dimensions={dimensions} 
        position={position}
      />
      <gridHelper args={[20, 20]} />
    </Canvas>
  )
}

export default ARScene
