import { normalizeCategoryCode } from './categories.js';
import { renderPost, cropGeometry } from './renderer.js';
import { layout } from './layout.js';
import { generateCaption, placeholders } from './caption.js';

const $ = id => document.getElementById(id);
const fields = ['number', 'date', 'category', 'description', 'time', 'duration', 'location', 'externalResources'];
let config, revision = 0, image = null, imageBlob = null, imageName = '';
let crop = { x: .5, y: .5, zoom: 1, mode: 'cover' };
let vehicles = [];
let backgroundImage = null, adminBackgroundData = '', captionCustomized = false, backgroundGeneration = 0;
let adminBackgroundGeneration = 0;
let warnings = [], adminEnabled = false, toastTimer, busy = false, drag = null, imageGeneration = 0;
const today = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const state = () => ({ ...Object.fromEntries(fields.map(id => [id, $(id).value])), crop: { ...crop }, vehicles: [...vehicles],
  captionTemplate: $('caption-template').value, hideEmptyLines: $('hide-empty-lines').checked });
function notify(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function errorAt(id, message) { $(id).textContent = message; $(id).hidden = !message; }
function render() {
  if (!config) return;
  warnings = renderPost($('preview'), state(), config, image, 1, backgroundImage);
  renderCaption();
  $('char-count').textContent = $('description').value.length + ' / 200';
  errorAt('render-warning', warnings.join(' '));
  const valid = $('post-form').checkValidity() && !!image && !warnings.length && !busy;
  $('download').disabled = !valid; $('share').disabled = !valid;
  $('export-help').textContent = warnings.length ? 'Bitte Text kürzen oder weniger Fahrzeuge auswählen. Der Export bleibt gesperrt.' : valid ? 'Alles bereit. Der Export entspricht genau dieser Vorschau.' : 'Einsatzdaten ausfüllen und ein Bild hinzufügen.';
  $('crop-controls').hidden = !image;
  $('preview').classList.toggle('has-image', !!image && crop.mode !== 'contain');
  $('image-fit').value = crop.mode || 'cover';
  $('crop-adjustments').hidden = crop.mode === 'contain';
  $('crop-help').textContent = crop.mode === 'contain'
    ? 'Das gesamte Bild wird mittig gezeigt. Freie Flächen bleiben weiß; nichts wird abgeschnitten.'
    : 'Nur das Bild lässt sich in der Vorschau verschieben. Der Rahmen bleibt fest.';
  $('image-label').textContent = image ? imageName : 'Bild auswählen';
}
function syncCrop() {
  $('zoom').value = crop.zoom; $('crop-x').value = crop.x; $('crop-y').value = crop.y;
  render();
}
function populateConfig() {
  const previous = normalizeCategoryCode($('category').value);
  $('category').replaceChildren(...config.categories.map(item => new Option(item.code === item.label ? item.code : item.code + ' · ' + item.label, item.code)));
  if (config.categories.some(item => item.code === previous)) $('category').value = previous;
  $('preset-buttons').replaceChildren(...config.presets.map(text => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'preset'; button.textContent = text;
    button.addEventListener('click', () => { $('description').value = text; render(); });
    return button;
  }));
  populateVehicles();
  if (!captionCustomized) $('caption-template').value = config.captionTemplate;
  $('external-options').replaceChildren(...config.externalResources.map(name => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'preset'; button.textContent = name;
    button.addEventListener('click', () => {
      const current = $('externalResources').value.split(/[,\n]/).map(value => value.trim()).filter(Boolean);
      if (!current.includes(name)) current.push(name);
      const text = current.join(', ');
      if (text.length > 500) return notify('Weitere Kräfte dürfen höchstens 500 Zeichen enthalten.');
      $('externalResources').value = text; render();
    });
    return button;
  }));
  render();
}
function renderCaption() {
  const result = generateCaption($('caption-template').value, state(), config, $('hide-empty-lines').checked);
  $('caption-preview').value = result.text;
  errorAt('caption-error', result.unknown.length ? 'Unbekannte Platzhalter: ' + result.unknown.map(key => '{' + key + '}').join(', ') : '');
  $('copy-caption').disabled = !result.text || result.unknown.length > 0;
  $('caption-length').textContent = result.text.length + ' Zeichen';
}
async function loadConfiguredBackground() {
  const generation = ++backgroundGeneration;
  if (!config.background.imageData) { backgroundImage = null; return; }
  const loaded = new Image();
  try {
    loaded.src = config.background.imageData; await loaded.decode();
    if (generation === backgroundGeneration) backgroundImage = loaded;
  } catch {
    if (generation === backgroundGeneration) backgroundImage = null;
    notify('Das gespeicherte Hintergrundbild ist nicht lesbar. Bitte in den Einstellungen erneut hochladen.');
  }
}
function populateVehicles() {
  vehicles = vehicles.filter(code => config.vehicles.includes(code));
  $('vehicle-options').replaceChildren(...config.vehicles.map(code => {
    const label = document.createElement('label'); label.className = 'vehicle-option';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = code; input.checked = vehicles.includes(code);
    const caption = document.createElement('span'); caption.textContent = code;
    input.addEventListener('change', () => {
      vehicles = input.checked ? [...vehicles, code] : vehicles.filter(item => item !== code);
      render();
    });
    label.append(input, caption); return label;
  }));
  $('vehicles-empty').hidden = config.vehicles.length > 0;
}

async function loadImage(blob, name, resetCrop = true) {
  if (!/^image\/(jpeg|png|webp)$/.test(blob.type)) throw new Error('Bitte ein JPG-, PNG- oder WebP-Bild wählen.');
  if (blob.size > 20 * 1024 * 1024) throw new Error('Das Bild ist größer als 20 MB.');
  const generation = ++imageGeneration;
  const url = URL.createObjectURL(blob);
  const loaded = new Image();
  try {
    loaded.src = url; await loaded.decode();
    if (!loaded.naturalWidth || loaded.naturalWidth * loaded.naturalHeight > 80000000) throw new Error('Bild ist zu groß. Bitte vorher verkleinern.');
    // Normalize orientation and cap memory usage before rendering or draft storage.
    const factor = Math.min(1, 2400 / Math.max(loaded.naturalWidth, loaded.naturalHeight));
    const buffer = document.createElement('canvas');
    buffer.width = Math.round(loaded.naturalWidth * factor); buffer.height = Math.round(loaded.naturalHeight * factor);
    const context = buffer.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, buffer.width, buffer.height);
    context.drawImage(loaded, 0, 0, buffer.width, buffer.height);
    const normalized = await new Promise(resolve => buffer.toBlob(resolve, 'image/jpeg', .96));
    if (!normalized) throw new Error('Bild konnte nicht verarbeitet werden.');
    const normalizedURL = URL.createObjectURL(normalized);
    const finalImage = new Image();
    try { finalImage.src = normalizedURL; await finalImage.decode(); }
    finally { URL.revokeObjectURL(normalizedURL); }
    if (generation !== imageGeneration) return;
    image = finalImage; imageBlob = normalized; imageName = name || 'Einsatzbild';
    if (resetCrop) crop = { x: .5, y: .5, zoom: 1, mode: finalImage.naturalHeight > finalImage.naturalWidth ? 'contain' : 'cover' };
    syncCrop();
  } catch (error) {
    if (error.message.includes('Bild')) throw error;
    throw new Error('Bild konnte nicht gelesen werden. Bitte ein anderes Bild wählen.');
  } finally { URL.revokeObjectURL(url); }
}

let dbPromise;
function database() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('einsatzpost', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}
async function draftOperation(mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', mode);
    const request = operation(transaction.objectStore('drafts'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
async function refreshDraft() {
  try {
    const draft = await draftOperation('readonly', store => store.get('current'));
    $('load-draft').disabled = !draft; $('delete-draft').hidden = !draft;
  } catch {
    $('load-draft').disabled = true; $('save-draft').disabled = true;
    notify('Dieser Browser erlaubt keine lokale Entwurfsspeicherung.');
  }
}
async function exportBlob() {
  if (!$('post-form').reportValidity()) throw new Error('Bitte alle Einsatzdaten ausfüllen.');
  if (!image) throw new Error('Bitte ein Einsatzbild hinzufügen.');
  if (warnings.length) throw new Error('Bitte den Text kürzen.');
  const canvas = document.createElement('canvas');
  const exportWarnings = renderPost(canvas, state(), config, image, Number($('resolution').value), backgroundImage);
  if (exportWarnings.length) throw new Error('Text passt nicht vollständig in die Vorlage.');
  const blob = await new Promise(resolve => canvas.toBlob(resolve, $('file-format').value, .94));
  if (!blob) throw new Error('Der Export konnte nicht erstellt werden.');
  return blob;
}
function filename() {
  return 'EinsatzPost-' + $('date').value + '-' + $('number').value + '-' + $('category').value + ($('file-format').value === 'image/jpeg' ? '.jpg' : '.png');
}
function populateTokens(containerId, textareaId) {
  $(containerId).replaceChildren(...placeholders.map(([key, label]) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'preset'; button.textContent = '{' + key + '}'; button.title = label;
    button.addEventListener('click', () => {
      const textarea = $(textareaId), token = '{' + key + '}';
      if (textarea.value.length + token.length - (textarea.selectionEnd - textarea.selectionStart) > 5000) return notify('Die Vorlage darf höchstens 5000 Zeichen enthalten.');
      textarea.setRangeText(token, textarea.selectionStart, textarea.selectionEnd, 'end'); textarea.focus();
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return button;
  }));
}
$('caption-template').addEventListener('input', () => { captionCustomized = $('caption-template').value !== config?.captionTemplate; if (config) renderCaption(); });
$('hide-empty-lines').addEventListener('change', () => { if (config) renderCaption(); });
$('reset-caption').addEventListener('click', () => { if (!config) return; captionCustomized = false; $('caption-template').value = config.captionTemplate; renderCaption(); });
$('copy-caption').addEventListener('click', async () => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText($('caption-preview').value); notify('Einsatztext kopiert. Du kannst ihn jetzt in deinen Beitrag einfügen.');
  } catch {
    $('caption-preview').focus(); $('caption-preview').select();
    notify('Automatisches Kopieren ist hier nicht möglich. Der Text ist markiert; bitte über das Browser-Menü kopieren.');
  }
});
populateTokens('caption-tokens', 'caption-template');
populateTokens('admin-caption-tokens', 'admin-caption-template');

function updateBackgroundPreview() {
  $('admin-background-preview').hidden = !adminBackgroundData;
  $('remove-background').disabled = !adminBackgroundData;
  if (adminBackgroundData) $('admin-background-preview').src = adminBackgroundData;
  else $('admin-background-preview').removeAttribute('src');
}
$('admin-background-upload').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  const generation = ++adminBackgroundGeneration;
  $('save-config').disabled = true;
  const url = URL.createObjectURL(file), loaded = new Image();
  try {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) throw new Error('Bitte JPG, PNG oder WebP bis 20 MB wählen.');
    loaded.src = url; await loaded.decode();
    if (!loaded.naturalWidth || loaded.naturalWidth * loaded.naturalHeight > 80000000) throw new Error('Bild ist zu groß. Bitte vorher verkleinern.');
    const factor = Math.min(1, 1200 / Math.max(loaded.naturalWidth, loaded.naturalHeight)), canvas = document.createElement('canvas');
    canvas.width = Math.round(loaded.naturalWidth * factor); canvas.height = Math.round(loaded.naturalHeight * factor);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(loaded, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', .85);
    if (data.length > 1500000) throw new Error('Hintergrund ist zu groß. Bitte ein kleineres Bild wählen.');
    if (generation !== adminBackgroundGeneration) return;
    adminBackgroundData = data; updateBackgroundPreview(); notify('Hintergrund vorbereitet. Mit Einstellungen speichern übernehmen.');
  } catch (error) { notify(error.message || 'Hintergrundbild konnte nicht gelesen werden.'); }
  finally { URL.revokeObjectURL(url); if (generation === adminBackgroundGeneration) $('save-config').disabled = !adminEnabled; }
});
$('remove-background').addEventListener('click', () => { adminBackgroundGeneration++; adminBackgroundData = ''; updateBackgroundPreview(); $('save-config').disabled = !adminEnabled; });

fields.forEach(id => $(id).addEventListener('input', render));
$('post-form').addEventListener('submit', event => event.preventDefault());
$('image-upload').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (file) try { await loadImage(file, file.name); notify('Bild hinzugefügt. Ausschnitt bei Bedarf anpassen.'); } catch (error) { notify(error.message); }
  event.target.value = '';
});
for (const type of ['dragover', 'dragleave', 'drop']) $('upload-zone').addEventListener(type, event => {
  event.preventDefault(); $('upload-zone').classList.toggle('dragging', type === 'dragover');
  if (type === 'drop' && event.dataTransfer.files[0]) loadImage(event.dataTransfer.files[0], event.dataTransfer.files[0].name).catch(error => notify(error.message));
});
$('load-url').addEventListener('click', async () => {
  let url;
  try { url = new URL($('image-url').value); if (url.protocol !== 'https:') throw new Error(); }
  catch { return notify('Bitte eine gültige HTTPS-Bildadresse eingeben.'); }
  $('load-url').disabled = true;
  try {
    const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error();
    const type = (response.headers.get('content-type') || '').split(';')[0];
    if (!/^image\/(jpeg|png|webp)$/.test(type)) throw new Error();
    const length = Number(response.headers.get('content-length'));
    if (length > 20 * 1024 * 1024) throw new Error();
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 20 * 1024 * 1024) { await reader.cancel(); throw new Error(); }
      chunks.push(value);
    }
    await loadImage(new Blob(chunks, { type }), 'Bild aus Link');
    notify('Bild aus Link hinzugefügt.');
  } catch { notify('Bildlink nicht nutzbar. Prüfe CORS und Dateiformat oder lade die Bilddatei hoch.'); }
  finally { $('load-url').disabled = false; }
});
['zoom', 'crop-x', 'crop-y'].forEach(id => $(id).addEventListener('input', () => {
  crop = { ...crop, x: Number($('crop-x').value), y: Number($('crop-y').value), zoom: Number($('zoom').value) }; render();
}));
$('image-fit').addEventListener('change', () => { drag = null; crop.mode = $('image-fit').value; render(); });
$('center-image').addEventListener('click', () => { crop = { ...crop, x: .5, y: .5, zoom: 1 }; syncCrop(); });
$('remove-image').addEventListener('click', () => { imageGeneration++; image = null; imageBlob = null; imageName = ''; render(); });
const preview = $('preview');
function pointer(event) {
  const rect = preview.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width * layout.width, y: (event.clientY - rect.top) / rect.height * layout.height };
}
preview.addEventListener('pointerdown', event => {
  const point = pointer(event), box = layout.photo;
  if (!image || crop.mode === 'contain' || point.x < box.x || point.x > box.x + box.width || point.y < box.y || point.y > box.y + box.height) return;
  drag = { point, crop: { ...crop }, geometry: cropGeometry(image, crop) };
  preview.setPointerCapture(event.pointerId);
});
preview.addEventListener('pointermove', event => {
  if (!drag) return;
  const point = pointer(event), extraX = drag.geometry.width - layout.photo.width, extraY = drag.geometry.height - layout.photo.height;
  const clamp = value => Math.min(1, Math.max(0, value));
  crop.x = extraX > 0 ? clamp(drag.crop.x - (point.x - drag.point.x) / extraX) : .5;
  crop.y = extraY > 0 ? clamp(drag.crop.y - (point.y - drag.point.y) / extraY) : .5;
  syncCrop();
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => preview.addEventListener(type, () => { drag = null; }));

$('reset').addEventListener('click', () => {
  if (!confirm('Aktuelle Eingaben und Bild zurücksetzen? Ein gespeicherter Entwurf bleibt erhalten.')) return;
  $('post-form').reset(); $('date').value = today(); imageGeneration++; image = null; imageBlob = null; imageName = '';
  vehicles = []; populateVehicles();
  captionCustomized = false; $('caption-template').value = config.captionTemplate;
  $('hide-empty-lines').checked = true;
  crop = { x: .5, y: .5, zoom: 1, mode: 'cover' }; syncCrop(); notify('Bereit für einen neuen Einsatz.');
});
$('save-draft').addEventListener('click', async () => {
  try {
    await draftOperation('readwrite', store => store.put({ state: state(), blob: imageBlob, name: imageName, savedAt: Date.now() }, 'current'));
    await refreshDraft(); notify('Entwurf auf diesem Gerät gespeichert.');
  } catch { notify('Entwurf konnte nicht gespeichert werden. Eventuell ist der Speicher voll.'); }
});
$('load-draft').addEventListener('click', async () => {
  if (!confirm('Gespeicherten Entwurf laden und aktuelle Eingaben ersetzen?')) return;
  try {
    const draft = await draftOperation('readonly', store => store.get('current'));
    if (!draft) return notify('Kein Entwurf vorhanden.');
    fields.forEach(id => { $(id).value = id === 'category' ? normalizeCategoryCode(draft.state[id]) : draft.state[id] ?? ''; });
    if (!config.categories.some(item => item.code === $('category').value)) $('category').value = config.categories[0].code;
    vehicles = Array.isArray(draft.state.vehicles) ? draft.state.vehicles : []; populateVehicles();
    $('caption-template').value = typeof draft.state.captionTemplate === 'string' ? draft.state.captionTemplate : config.captionTemplate;
    captionCustomized = $('caption-template').value !== config.captionTemplate;
    $('hide-empty-lines').checked = draft.state.hideEmptyLines !== false;
    crop = { mode: 'cover', ...(draft.state.crop || { x: .5, y: .5, zoom: 1 }) };
    if (draft.blob) await loadImage(draft.blob, draft.name, false);
    else { imageGeneration++; image = null; imageBlob = null; imageName = ''; }
    syncCrop(); notify('Entwurf geladen.');
  } catch { notify('Entwurf konnte nicht geladen werden.'); }
});
$('delete-draft').addEventListener('click', async () => {
  if (!confirm('Gespeicherten Entwurf auf diesem Gerät löschen?')) return;
  try { await draftOperation('readwrite', store => store.delete('current')); await refreshDraft(); notify('Entwurf gelöscht.'); }
  catch { notify('Entwurf konnte nicht gelöscht werden.'); }
});

async function runExport(action) {
  busy = true; render();
  try { await action(await exportBlob()); }
  catch (error) { if (error.name !== 'AbortError') notify(error.message || 'Export fehlgeschlagen.'); }
  finally { busy = false; render(); }
}
$('download').addEventListener('click', () => runExport(async blob => {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename(); document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000); notify('Grafik erstellt. Der Download wurde gestartet.');
}));
$('share').hidden = !navigator.canShare;
$('share').addEventListener('click', () => runExport(async blob => {
  const file = new File([blob], filename(), { type: blob.type });
  if (!navigator.canShare({ files: [file] })) throw new Error('Dateien teilen wird hier nicht unterstützt. Bitte herunterladen.');
  await navigator.share({ files: [file], title: 'EinsatzPost' });
}));

function categoryRow(item) {
  const row = document.createElement('div'); row.className = 'category-row';
  for (const [key, label, max] of [['code', 'Einsatzart', 60], ['label', 'Bezeichnung', 60]]) {
    const wrapper = document.createElement('label'), input = document.createElement('input');
    wrapper.textContent = label; input.value = item[key]; input.dataset.field = key; input.maxLength = max; input.required = true;
    wrapper.append(input); row.append(wrapper);
  }
  const colorLabel = document.createElement('label'); colorLabel.textContent = 'Tagfarbe';
  const color = document.createElement('input'); color.type = 'color'; color.value = item.color; color.dataset.field = 'color'; colorLabel.append(color); row.append(colorLabel);
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Entfernen'; remove.className = 'text-button danger';
  remove.addEventListener('click', () => {
    if ($('category-rows').children.length <= 1) return notify('Mindestens eine Kategorie muss erhalten bleiben.');
    row.remove();
  });
  row.append(remove); return row;
}
$('open-admin').addEventListener('click', () => {
  if (!config) return;
  $('admin-brand').value = config.brand; $('admin-footer').value = config.footer; $('admin-presets').value = config.presets.join('\n');
  for (const key of ['background', 'header', 'footer']) $('admin-color-' + key).value = config.colors[key];
  $('admin-vehicles').value = config.vehicles.join('\n');
  $('admin-external').value = config.externalResources.join('\n');
  $('admin-caption-template').value = config.captionTemplate;
  $('admin-gradient-enabled').checked = config.background.gradientEnabled;
  $('admin-gradient-start').value = config.background.gradientStart;
  $('admin-gradient-end').value = config.background.gradientEnd;
  $('admin-description-color').checked = config.descriptionUsesCategoryColor ?? false;
  $('admin-background-opacity').value = config.background.imageOpacity;
  adminBackgroundGeneration++; adminBackgroundData = config.background.imageData; updateBackgroundPreview();
  $('category-rows').replaceChildren(...config.categories.map(categoryRow));
  $('admin-token').value = ''; $('admin-disabled').hidden = adminEnabled; $('save-config').disabled = !adminEnabled;
  errorAt('admin-error', ''); $('admin-dialog').showModal();
});
function closeAdmin() { adminBackgroundGeneration++; $('admin-token').value = ''; $('admin-dialog').close(); }
['close-admin', 'cancel-admin'].forEach(id => $(id).addEventListener('click', closeAdmin));
$('admin-dialog').addEventListener('close', () => { adminBackgroundGeneration++; $('admin-token').value = ''; });
$('add-category').addEventListener('click', () => {
  if ($('category-rows').children.length >= 40) return notify('Maximal 40 Kategorien möglich.');
  $('category-rows').append(categoryRow({ code: '', label: '', color: '#297b8d' }));
});
$('admin-form').addEventListener('submit', async event => {
  event.preventDefault(); errorAt('admin-error', '');
  const categories = [...$('category-rows').children].map(row => Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value])));
  const nextConfig = {
    descriptionUsesCategoryColor: $('admin-description-color').checked,
    categoryCatalogVersion: config.categoryCatalogVersion, brand: $('admin-brand').value, footer: $('admin-footer').value, categories,
    presets: $('admin-presets').value.split('\n').map(s => s.trim()).filter(Boolean),
    colors: Object.fromEntries(['background', 'header', 'footer'].map(key => [key, $('admin-color-' + key).value])),
    vehicles: $('admin-vehicles').value.split('\n').map(s => s.trim().toUpperCase()).filter(Boolean),
    externalResources: $('admin-external').value.split('\n').map(s => s.trim()).filter(Boolean),
    captionTemplate: $('admin-caption-template').value,
    background: { gradientEnabled: $('admin-gradient-enabled').checked, gradientStart: $('admin-gradient-start').value,
      gradientEnd: $('admin-gradient-end').value, gradientAngle: 90,
      imageData: adminBackgroundData, imageOpacity: Number($('admin-background-opacity').value) }
  };
  $('save-config').disabled = true;
  try {
    const response = await fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + $('admin-token').value }, body: JSON.stringify({ config: nextConfig, revision }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Speichern fehlgeschlagen.');
    config = data.config; revision = data.revision; await loadConfiguredBackground(); populateConfig(); closeAdmin(); notify('Team-Einstellungen gespeichert.');
  } catch (error) { errorAt('admin-error', error.message); }
  finally { $('save-config').disabled = !adminEnabled; }
});

async function initialize() {
  $('date').value = today();
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error();
    const data = await response.json();
    config = data.config; revision = data.revision; adminEnabled = data.adminEnabled;
    await loadConfiguredBackground(); populateConfig(); await refreshDraft();
  } catch {
    errorAt('boot-error', 'Einstellungen konnten nicht geladen werden. Bitte die Seite neu laden oder den Server prüfen.');
    $('open-admin').disabled = true;
  }
}
initialize();
