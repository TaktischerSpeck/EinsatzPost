'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const defaults = require('../config/defaults.json');
const load = () => import('../public/renderer.js');
function context() {
  return {
    font: '700 20px Arial',
    measureText(text) { return { width: [...text].length * parseFloat(this.font.split(' ')[1]) * .6 }; },
    scale() {}, fillRect() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
    fillText() {}, moveTo() {}, lineTo() {}, fill() {}, stroke() {}, drawImage() {},
    createLinearGradient() { return { addColorStop() {} }; }
  };
}
test('shrinks text and detects content that cannot fit', async () => {
  const { fitText } = await load(); const ctx = context();
  const box = { width: 400, height: 80, maxSize: 60, minSize: 20, maxLines: 1 };
  const fit = fitText(ctx, 'Anforderung Drehleiter', box);
  assert.equal(fit.overflow, false); assert.ok(fit.size < 60);
  assert.equal(fitText(ctx, 'x'.repeat(150), box).overflow, true);
});
test('crop never exposes space outside the image at either extreme', async () => {
  const { cropGeometry } = await load();
  for (const image of [{ width: 200, height: 1200 }, { width: 1600, height: 300 }]) {
    for (const zoom of [1, 3]) for (const x of [0, 1]) for (const y of [0, 1]) {
      const geometry = cropGeometry(image, { zoom, x, y });
      assert.ok(geometry.x <= 60); assert.ok(geometry.y <= 272);
      assert.ok(geometry.x + geometry.width >= 1020 - .00001);
      assert.ok(geometry.y + geometry.height >= 838 - .00001);
    }
  }
});
test('renders both export sizes and reports description overflow', async () => {
  const { renderPost } = await load();
  const canvas = { getContext: context };
  const state = { number: '124', date: '2026-10-05', time: '18:24', category: 'R1', description: 'Unterstützung des Rettungsdienstes', location: 'Ober-Ramstadt', crop: { x: .5, y: .5, zoom: 1 } };
  assert.deepEqual(renderPost(canvas, state, defaults, null, 1), []);
  assert.equal(canvas.width, 1080); assert.equal(canvas.height, 1350);
  renderPost(canvas, state, defaults, null, 2);
  assert.equal(canvas.width, 2160); assert.equal(canvas.height, 2700);
  assert.ok(renderPost(canvas, { ...state, description: 'W'.repeat(200) }, defaults, null).length > 0);
});
