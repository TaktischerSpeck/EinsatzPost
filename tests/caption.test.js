'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const defaults = require('../config/defaults.json');
const load = () => import('../public/caption.js');
const state = { number: '145', location: 'In der Stetbach', date: '2026-10-03', time: '19:48', vehicles: ['HLF 20', 'LF 16/12'], externalResources: 'Polizei, OR1-10', category: 'F1', description: 'Kleinbrand' };
const config = { ...defaults, vehicles: ['HLF 20', 'LF 16/12'] };
test('generates the requested posting text with German date and selected resources', async () => {
  const { generateCaption } = await load();
  assert.deepEqual(generateCaption(defaults.captionTemplate, state, config), {
    text: '🚨 Einsatzbericht #145 🚨\n📍 Ort: In der Stetbach\n📅 Datum: 03. Oktober 2026\n🕒 Zeit: 19:48 Uhr\n🚒 Fahrzeuge: HLF 20, LF 16/12\n👮🏽‍♂️ Weitere Kräfte: Polizei, OR1-10', unknown: []
  });
});
test('supports braces, double braces and angle brackets without recursive substitution', async () => {
  const { generateCaption } = await load();
  const result = generateCaption('🧯 {einsatznummer} / {{kategorie}} / <stichwort>\n{beschreibung}', { ...state, description: '<ort> {fahrzeuge}' }, config);
  assert.equal(result.text, '🧯 145 / F 1 / Brandeinsatz\n<ort> {fahrzeuge}');
});
test('optionally hides lines with empty fields and preserves user formatting', async () => {
  const { generateCaption } = await load();
  const template = '#{einsatznummer}\n\n🚒 {fahrzeuge}\n👮 {weitere_kraefte}\n#Feuerwehr';
  const empty = { ...state, vehicles: [], externalResources: '' };
  assert.equal(generateCaption(template, empty, config).text, '#145\n\n#Feuerwehr');
  assert.equal(generateCaption(template, empty, config, false).text, '#145\n\n🚒 \n👮 \n#Feuerwehr');
});
test('reports unknown placeholders and refuses impossible calendar dates', async () => {
  const { generateCaption, captionValues } = await load();
  assert.deepEqual(generateCaption('{unknown} {{unknown}} <unknown>', state, config).unknown, ['unknown']);
  assert.deepEqual(generateCaption('{Ort2}', state, config).unknown, ['ort2']);
  assert.equal(generateCaption('{Fahrzeuge}', state, config).text, 'HLF 20, LF 16/12');
  assert.equal(captionValues({ ...state, date: '2026-02-30' }, config).datum, '');
  assert.equal(captionValues({ ...state, date: '2028-02-29' }, config).datum, '29. Februar 2028');
});
test('supports all documented fields and multiline free text without HTML execution', async () => {
  const { generateCaption } = await load();
  const result = generateCaption('{datum_kurz} | {jahr} | {feuerwehr} | {weitere_kraefte}', { ...state, externalResources: 'Polizei\nOR1-10 <script>' }, config);
  assert.equal(result.text, '03.10.2026 | 2026 | Feuerwehr Ober-Ramstadt | Polizei, OR1-10 <script>');
});

test('duration is an optional placeholder and omitted for older drafts', async () => {
  const { generateCaption } = await load();
  const template = '#{einsatznummer}\n⏱️ Dauer: {einsatzdauer}';
  assert.equal(generateCaption(template, { ...state, duration: ' 1 Std. 20 Min. ' }, config).text, '#145\n⏱️ Dauer: 1 Std. 20 Min.');
  assert.equal(generateCaption(template, state, config).text, '#145');
  assert.equal(generateCaption('<einsatzdauer> / {{einsatzdauer}}', { ...state, duration: '45 Min.' }, config).text, '45 Min. / 45 Min.');
});

test('preserves exact category names and recognizes legacy draft codes', async () => {
  const { normalizeCategoryCode } = await import('../public/categories.js');
  const { generateCaption } = await load();
  assert.equal(normalizeCategoryCode('F1'), 'F 1');
  assert.equal(normalizeCategoryCode('H 1 – Ölspur'), 'H 1 – Ölspur');
  for (const code of ['H 1 – Ölspur', 'Lohbergtunnel F Klein', 'F LKW / F ZUG']) {
    assert.equal(generateCaption('{kategorie}', { ...state, category: code }, config).text, code);
  }
  assert.equal(generateCaption('{kategorie}', { ...state, category: 'R2' }, config).text, 'R 2');
});
