export const ambientAssets = {
  'hero-left': ['hero-left.mp4', 'hero-left-poster.png'],
  'hero-right': ['hero-right.mp4', 'hero-right-poster.png'],
  'hero-star': ['hero-star.mp4', 'hero-star-poster.png'],
  'contact-star': ['contact-star.mp4', 'contact-star-poster.png'],
  disk: ['about-disk.mp4', 'about-disk-poster.png'],
} as const

export const decorativePath = (file: string) => '/visuals/' + file
