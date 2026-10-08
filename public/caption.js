import { normalizeCategoryCode } from './categories.js';
export const placeholders = [
  ['einsatznummer', 'Einsatznummer'], ['ort', 'Ort'], ['datum', 'Datum ausgeschrieben'],
  ['einsatzdauer', 'Einsatzdauer'], ['datum_kurz', 'Datum kurz'], ['jahr', 'Jahr'], ['zeit', 'Uhrzeit'],
  ['fahrzeuge', 'Fahrzeuge'], ['weitere_kraefte', 'Weitere Kräfte'],
  ['kategorie', 'Kategorie'], ['beschreibung', 'Kurzbeschreibung'],
  ['feuerwehr', 'Feuerwehrname']
];
const tokens = /\{\{([a-z_][a-z0-9_]*)\}\}|\{([a-z_][a-z0-9_]*)\}|<([a-z_][a-z0-9_]*)>/gi;
function parsedDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}
export function captionValues(state, config) {
  const date = parsedDate(state.date), category = config.categories.find(item => item.code === normalizeCategoryCode(state.category));
  return {
    einsatznummer: state.number || '', ort: (state.location || '').trim(),
    datum: date ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date) : '',
    datum_kurz: date ? state.date.split('-').reverse().join('.') : '',
    einsatzdauer: (state.duration || '').trim(),
    jahr: date ? state.date.slice(0, 4) : '', zeit: state.time || '',
    fahrzeuge: (config.vehicles || []).filter(code => (state.vehicles || []).includes(code)).join(', '),
    weitere_kraefte: (state.externalResources || '').trim().replace(/\s*\n\s*/g, ', '),
    // Preserve older caption templates by mapping their keyword token to the description.
    kategorie: category?.code || '', stichwort: (state.description || '').trim(),
    beschreibung: (state.description || '').trim(), feuerwehr: config.brand || ''
  };
}
export function generateCaption(template, state, config, hideEmptyLines = true) {
  const values = captionValues(state, config), unknown = new Set();
  const lines = String(template).replace(/\r\n?/g, '\n').split('\n').map(line => {
    let empty = false;
    const rendered = line.replace(tokens, (match, a, b, c) => {
      const key = (a || b || c).toLowerCase();
      if (!Object.hasOwn(values, key)) { unknown.add(key); return match; }
      if (!values[key]) empty = true;
      return values[key];
    });
    return hideEmptyLines && empty ? null : rendered;
  }).filter(line => line !== null);
  return { text: lines.join('\n').trim(), unknown: [...unknown] };
}
