'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
test('background images cover the graphic and remain centered', async () => {
  const { backgroundGeometry } = await import('../public/background.js');
  for (const image of [{ width: 2000, height: 500 }, { width: 500, height: 2000 }]) {
    const geometry = backgroundGeometry(image, 1080, 1350);
    assert.ok(geometry.x <= 0); assert.ok(geometry.y <= 0);
    assert.ok(geometry.x + geometry.width >= 1080); assert.ok(geometry.y + geometry.height >= 1350);
    assert.equal(geometry.x + geometry.width / 2, 540); assert.equal(geometry.y + geometry.height / 2, 675);
  }
});
test('renders gradient endpoints and background photo with the selected opacity', async () => {
  const { drawBackground } = await import('../public/background.js');
  const stops = [], lines = [], images = [];
  const ctx = { globalAlpha: 1, fillRect() {}, save() {}, restore() { this.globalAlpha = 1; },
    createLinearGradient(...args) { lines.push(args); return { addColorStop(...stop) { stops.push(stop); } }; },
    drawImage(...args) { images.push({ opacity: this.globalAlpha, args }); } };
  drawBackground(ctx, 1080, 1350, '#ffffff', { gradientEnabled: true, gradientAngle: 0, gradientStart: '#112233', gradientEnd: '#aabbcc', imageOpacity: .4 }, { width: 1080, height: 1350 });
  assert.deepEqual(lines, [[0, 675, 1080, 675]]);
  assert.deepEqual(stops, [[0, '#112233'], [1, '#aabbcc']]);
  assert.equal(images[0].opacity, .4); assert.equal(ctx.globalAlpha, 1);
});
