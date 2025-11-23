import { TinyHomeModel } from '../types'

export const tinyHomeModels: TinyHomeModel[] = [
  {
    id: 'deluxe-tiny-home',
    name: 'Deluxe Tiny Home',
    dimensions: {
      length: 13.0,
      width: 5.0,
      height: 3.5
    },
    price: 89900,
    imageUrl: '/tiny-home-models/deluxe-tiny-home.png',
    description: 'Our premium deluxe model featuring modern design and quality craftsmanship',
    features: [
      'Modern architectural design',
      'Premium interior finishes',
      'Energy-efficient construction',
      'Full kitchen and bathroom',
      'Smart home ready',
      'Sustainable materials'
    ],
    productUrl: 'https://unit2go.co.nz'
  },
  {
    id: 'blue-lagoon',
    name: 'Blue Lagoon',
    dimensions: {
      length: 13.0,
      width: 5.0,
      height: 3.5
    },
    price: 89900,
    imageUrl: '/tiny-home-models/blue-lagoon.png',
    description: 'Our premium Blue Lagoon model featuring modern design and quality craftsmanship',
    features: [
      'Modern architectural design',
      'Premium interior finishes',
      'Energy-efficient construction',
      'Full kitchen and bathroom',
      'Smart home ready',
      'Sustainable materials'
    ],
    productUrl: 'https://unit2go.co.nz'
  },
  {
    id: 'deluxe-perspective',
    name: 'Deluxe Tiny Home - Perspective',
    dimensions: {
      length: 13.0,
      width: 5.0,
      height: 3.5
    },
    price: 89900,
    imageUrl: '/tiny-home-models/tiny-home-perspective-test.png',
    description: 'Premium deluxe model with perspective view for enhanced visualization accuracy',
    features: [
      'Modern architectural design',
      'Premium interior finishes',
      'Energy-efficient construction',
      'Full kitchen and bathroom',
      'Smart home ready',
      'Sustainable materials'
    ],
    productUrl: 'https://unit2go.co.nz'
  },
  {
    id: 'deluxe-perspective-2',
    name: 'Deluxe Tiny Home - Perspective 2',
    dimensions: {
      length: 13.0,
      width: 5.0,
      height: 3.5
    },
    price: 89900,
    imageUrl: '/tiny-home-models/tiny-home-perspective-test-2.png',
    description: 'Premium deluxe model with alternative perspective view for enhanced visualization accuracy',
    features: [
      'Modern architectural design',
      'Premium interior finishes',
      'Energy-efficient construction',
      'Full kitchen and bathroom',
      'Smart home ready',
      'Sustainable materials'
    ],
    productUrl: 'https://unit2go.co.nz'
  },
  {
    id: 'premium-tiny-home-1-bed-topdown',
    name: 'Premium Tiny Home - 1 Bedroom (Top-Down View)',
    dimensions: {
      length: 12.0,
      width: 4.8,
      height: 3.2
    },
    price: 85900,
    imageUrl: '/tiny-home-models/premium-tiny-home-1-bed_3.webp',
    description: 'Premium 1-bedroom tiny home with detailed top-down floor plan view for precise interior visualization',
    features: [
      'Top-down architectural layout',
      'Interior camera positioning',
      'Detailed floor plan reference',
      '1-bedroom configuration',
      'Premium interior finishes',
      'Energy-efficient construction',
      'Full kitchen and bathroom',
      'Smart home ready',
      'Sustainable materials'
    ],
    productUrl: 'https://unit2go.co.nz',
    supportsInteriorViews: true,
    isTopDownView: true
  }
]
