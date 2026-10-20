// Positions use the 1080 x 1350 base coordinate system.
export const layout = Object.freeze({
  width: 1080, height: 1350, margin: 60,
  photo: { x: 60, y: 272, width: 960, height: 566 },
  description: { x: 60, y: 901, width: 960, height: 108, maxSize: 54, minSize: 28, maxLines: 2, lineHeight: 1.25, letterSpacingEm: .04 },
  vehicles: { x: 60, y: 1035, width: 960, height: 80, maxSize: 32, minSize: 18, maxLines: 2, lineHeight: 1.25 },
  location: { x: 720, y: 1199, width: 300, height: 76, maxSize: 36, minSize: 18, maxLines: 2, lineHeight: 1.3, align: 'center' },
  time: { x: 60, y: 1199, width: 300, height: 76, maxSize: 36, minSize: 20, maxLines: 1 },
  duration: { x: 380, y: 1199, width: 320, height: 76, maxSize: 36, minSize: 18, maxLines: 2, lineHeight: 1.3, align: 'center' }
});

export function infoLayout(hasImage) {
  return hasImage ? {
    headline: { x: 60, y: 898, width: 960, height: 128, maxSize: 56, minSize: 28, maxLines: 3, lineHeight: 1.3 },
    text: { x: 60, y: 1062, width: 960, height: 190, maxSize: 34, minSize: 22, maxLines: 7, lineHeight: 1.5 }
  } : {
    headline: { x: 60, y: 400, width: 960, height: 300, maxSize: 80, minSize: 32, maxLines: 6, lineHeight: 1.3 },
    text: { x: 60, y: 760, width: 960, height: 450, maxSize: 44, minSize: 26, maxLines: 14, lineHeight: 1.5 }
  };
}
