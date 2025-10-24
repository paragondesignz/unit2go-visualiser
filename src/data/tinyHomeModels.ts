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
  }
]
