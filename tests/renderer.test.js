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
test('contain keeps portrait and landscape images complete and centered', async () => {
  const { cropGeometry } = await load();
  for (const image of [{ width: 600, height: 1200 }, { width: 1800, height: 400 }]) {
    const geometry = cropGeometry(image, { mode: 'contain', x: 0, y: 1, zoom: 3 });
    assert.ok(geometry.x >= 60); assert.ok(geometry.y >= 272);
    assert.ok(geometry.x + geometry.width <= 1020 + .00001);
    assert.ok(geometry.y + geometry.height <= 838 + .00001);
    assert.ok(Math.abs(geometry.width / geometry.height - image.width / image.height) < .00001);
    assert.ok(Math.abs(geometry.x + geometry.width / 2 - 540) < .00001);
    assert.ok(Math.abs(geometry.y + geometry.height / 2 - 555) < .00001);
  }
  const portrait = cropGeometry({ width: 600, height: 1200 }, { mode: 'contain', zoom: 1, x: .5, y: .5 });
  assert.equal(portrait.height, 566);
  assert.equal(portrait.width, 283);
});
test('contain paints white margins and uses identical geometry in both export resolutions', async () => {
  const { renderPost } = await load();
  for (const scale of [1, 2]) {
    const ctx = context(), fills = [], draws = [], scales = [];
    ctx.fillRect = (...args) => fills.push({ color: ctx.fillStyle, args });
    ctx.drawImage = (...args) => draws.push(args);
    ctx.scale = (...args) => scales.push(args);
    const canvas = { getContext: () => ctx };
    const image = { width: 600, height: 1200 };
    const state = { number: '1', date: '2026-10-05', time: '18:24', category: 'F1', description: 'Kleinbrand', location: 'Ober-Ramstadt', crop: { mode: 'contain', x: .5, y: .5, zoom: 3 } };
    assert.deepEqual(renderPost(canvas, state, defaults, image, scale), []);
    assert.ok(fills.some(fill => fill.color === '#ffffff' && JSON.stringify(fill.args) === '[60,272,960,566]'));
    assert.deepEqual(draws[0], [image, 398.5, 272, 283, 566]);
    assert.deepEqual(scales, [[scale, scale]]);
    assert.equal(canvas.width, 1080 * scale);
    assert.equal(canvas.height, 1350 * scale);
  }
});
test('renders custom backgrounds, selected vehicles, matched header sizes and a yearless date', async () => {
  const { renderPost, dateLabel } = await load();
  assert.equal(dateLabel('2026-10-05'), '05.10');
  const config = structuredClone(defaults);
  config.colors = { background: '#112233', header: '#eeeeee', footer: '#abcdef' };
  config.vehicles = ['HLF20', 'ELW', 'DLK23/12'];
  for (const scale of [1, 2]) {
    const ctx = context(), fills = [], texts = [];
    ctx.fillRect = (...args) => fills.push({ color: ctx.fillStyle, args });
    ctx.fillText = (...args) => texts.push({ args, color: ctx.fillStyle, font: ctx.font });
    const state = { number: '124', date: '2026-10-05', time: '18:24', category: 'F1', description: 'Kleinbrand', location: 'Ober-Ramstadt', vehicles: ['ELW', 'HLF20', 'UNKNOWN'], crop: { mode: 'contain', x: .5, y: .5, zoom: 1 } };
    assert.deepEqual(renderPost({ getContext: () => ctx }, state, config, null, scale), []);
    for (const color of Object.values(config.colors)) assert.ok(fills.some(fill => fill.color === color));
    const year = texts.find(text => text.args[0] === '2026');
    assert.deepEqual(year.args, ['2026', 1020, 59]); assert.match(year.font, /30px/);
    assert.ok(texts.some(text => JSON.stringify(text.args) === '["05.10",1020,132]'));
    assert.ok(!texts.some(text => text.args[0] === '05.10.2026'));
    assert.ok(texts.some(text => text.args[0] === 'Fahrzeuge: HLF20 · ELW'));
    assert.ok(!texts.some(text => text.args[0].includes('UNKNOWN')));
    assert.equal(texts.find(text => text.args[0] === 'Kleinbrand').color, '#ffffff');
    assert.equal(year.color, '#12222b');
  }
});
test('keeps portrait margins white over a loaded team background at both export sizes', async () => {
  const { renderPost } = await load();
  const config = structuredClone(defaults);
  config.background.imageData = 'loaded-background';
  config.background.gradientEnabled = true;
  const background = { width: 2000, height: 500 }, photo = { width: 600, height: 1200 };
  for (const scale of [1, 2]) {
    const ctx = context(), draws = [], fills = [];
    ctx.drawImage = (...args) => draws.push(args);
    ctx.fillRect = (...args) => fills.push({ color: ctx.fillStyle, args });
    const state = { number: '124', date: '2026-10-05', time: '18:24', category: 'F1', description: 'Kleinbrand', location: 'Ober-Ramstadt', crop: { mode: 'contain', x: .5, y: .5, zoom: 1 } };
    assert.deepEqual(renderPost({ getContext: () => ctx }, state, config, photo, scale, background), []);
    assert.equal(draws[0][0], background);
    assert.ok(fills.some(fill => JSON.stringify(fill.args) === '[40,860,1000,420]'));
    assert.deepEqual(draws[1], [photo, 398.5, 272, 283, 566]);
    assert.ok(fills.some(fill => fill.color === '#ffffff' && JSON.stringify(fill.args) === '[60,272,960,566]'));
  }
  assert.ok(renderPost({ getContext: context }, { number: '1', date: '', category: 'F1', crop: {} }, config, null).some(warning => warning.includes('Hintergrundbild')));
});

test('header pairs use identical fitted font sizes and the accent bar is 1.5 times thicker', async () => {
  const { renderPost } = await load();
  for (const brand of ['Feuerwehr Ober-Ramstadt', 'Feuerwehr mit einem sehr langen Namen']) {
    const ctx = context(), texts = [], fills = [];
    ctx.fillText = (text, x, y) => texts.push({ text, x, y, font: ctx.font, align: ctx.textAlign });
    ctx.fillRect = (...args) => fills.push(args);
    const state = { number: '123456', date: '2026-10-07', category: 'F1', description: 'Kleinbrand', location: 'Ober-Ramstadt', crop: {} };
    assert.deepEqual(renderPost({ getContext: () => ctx }, state, { ...defaults, brand }, null), []);
    const year = texts.find(item => item.text === '2026');
    const name = texts.find(item => item.text === brand.toUpperCase());
    const date = texts.find(item => item.text === '07.10');
    const number = texts.find(item => item.text === 'EINSATZ 123456');
    assert.equal(year.font, name.font); assert.equal(year.y, name.y);
    assert.equal(date.font, number.font); assert.equal(date.y, number.y);
    assert.equal(year.align, 'right'); assert.equal(date.align, 'right');
    assert.ok(fills.some(args => JSON.stringify(args) === '[0,0,1080,18]'));
  }
});

test('renders optional duration centrally with alarm left and location centered right in both export sizes', async () => {
  const { renderPost } = await load();
  const { layout } = await import('../public/layout.js');
  for (const scale of [1, 2]) for (const duration of [undefined, '', '  ', '1 Std. 20 Min.']) {
    const ctx = context(), texts = [];
    ctx.fillText = (text, x, y) => texts.push({ text, x, y, align: ctx.textAlign, font: ctx.font });
    const state = { number: '123', date: '2026-10-07', time: '12:00', duration, category: 'F1', description: 'Ausgelöste Brandmeldeanlage', location: 'Groß-Bieberau', vehicles: ['HLF20', 'ELW'], crop: {} };
    const config = { ...defaults, vehicles: ['HLF20', 'ELW'] };
    assert.deepEqual(renderPost({ getContext: () => ctx }, state, config, null, scale), []);
    assert.ok(texts.some(item => item.text === '12:00 Uhr' && item.x === 60 && item.align === 'left'));
    assert.ok(texts.some(item => item.text === 'Groß-Bieberau' && item.x === 870 && item.align === 'center'));
    assert.ok(texts.some(item => item.text === 'EINSATZORT' && item.x === 870 && item.align === 'center'));
    assert.ok(texts.some(item => item.text === 'Fahrzeuge: HLF20 · ELW' && /30px/.test(item.font)));
    assert.equal(texts.some(item => item.text === 'EINSATZDAUER'), Boolean(duration?.trim()));
    if (duration?.trim()) assert.ok(texts.some(item => item.text === duration && item.x === 540 && item.align === 'center'));
  }
  assert.ok(layout.description.height < 146);
  assert.ok(layout.keyword.maxSize > 34);
  assert.ok(layout.vehicles.maxSize > 20);
  assert.ok(layout.description.y + layout.description.height < layout.keyword.y);
  assert.ok(layout.keyword.y + layout.keyword.height < layout.vehicles.y);
  assert.ok(layout.vehicles.y + layout.vehicles.height < 1135);
  assert.ok(layout.location.y + layout.location.height < 1280);
});
