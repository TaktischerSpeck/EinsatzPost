// Positions use the 1080 x 1350 base coordinate system.
export const layout = Object.freeze({
  width: 1080, height: 1350, margin: 60,
  photo: { x: 60, y: 272, width: 960, height: 566 },
  description: { x: 60, y: 875, width: 960, height: 116, maxSize: 60, minSize: 28, maxLines: 2 },
  keyword: { x: 60, y: 1009, width: 960, height: 58, maxSize: 44, minSize: 24, maxLines: 1 },
  vehicles: { x: 60, y: 1074, width: 960, height: 43, maxSize: 32, minSize: 18, maxLines: 1 },
  location: { x: 720, y: 1195, width: 300, height: 76, maxSize: 38, minSize: 18, maxLines: 2, align: 'center' },
  time: { x: 60, y: 1195, width: 300, height: 76, maxSize: 38, minSize: 20, maxLines: 1 },
  duration: { x: 380, y: 1195, width: 320, height: 76, maxSize: 38, minSize: 18, maxLines: 2, align: 'center' }
});
