import { PoolModel } from '../types'

export const poolModels: PoolModel[] = [
  {
    id: 'pool-1',
    name: 'Pool Design 1',
    dimensions: {
      length: 8.0,  // meters - typical pool length
      width: 4.0,   // meters - typical pool width
      depth: 1.5    // meters - average depth
    },
    price: 45000,
    imageUrl: '/pool-models/pool-1.png',
    description: 'Modern swimming pool design with contemporary styling',
    features: [
      'Modern pool design',
      'Professional construction',
      'Energy-efficient filtration',
      'LED lighting options',
      'Customizable finishes',
      'Durable materials'
    ],
    productUrl: 'https://unit2go.co.nz'
  },
  {
    id: 'pool-2',
    name: 'Pool Design 2',
    dimensions: {
      length: 10.0,  // meters - typical pool length
      width: 5.0,    // meters - typical pool width
      depth: 1.8     // meters - average depth
    },
    price: 52000,
    imageUrl: '/pool-models/pool-2.png',
    description: 'Elegant swimming pool design with premium features',
    features: [
      'Elegant pool design',
      'Professional construction',
      'Energy-efficient filtration',
      'LED lighting options',
      'Customizable finishes',
      'Durable materials'
    ],
    productUrl: 'https://unit2go.co.nz'
  }
]

