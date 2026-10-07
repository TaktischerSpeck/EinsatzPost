import { layout } from './layout.js';
import { drawBackground } from './background.js';
const fontFamily = 'Arial, Helvetica, sans-serif';
export function wrapText(ctx, text, width) {
  const lines = []; let line = '';
  for (const word of String(text).trim().split(/\s+/)) {
    if (ctx.measureText(word).width > width) {
      if (line) { lines.push(line); line = ''; }
      let part = '';
      for (const char of word) {
        if (ctx.measureText(part + char).width > width && part) { lines.push(part); part = ''; }
        part += char;
      }
      line = part;
    } else if (ctx.measureText(line ? line + ' ' + word : word).width > width) {
      lines.push(line); line = word;
    } else line = line ? line + ' ' + word : word;
  }
  if (line) lines.push(line);
  return lines;
}
export function fitText(ctx, text, box, weight = 700) {
  for (let size = box.maxSize; size >= box.minSize; size--) {
    ctx.font = weight + ' ' + size + 'px ' + fontFamily;
    const lines = box.maxLines === 1 ? [String(text)] : wrapText(ctx, text, box.width);
    if (lines.length <= box.maxLines && lines.length * size * 1.15 <= box.height && lines.every(line => ctx.measureText(line).width <= box.width)) return { size, lines, overflow: false };
  }
  ctx.font = weight + ' ' + box.minSize + 'px ' + fontFamily;
  return { size: box.minSize, lines: wrapText(ctx, text, box.width).slice(0, box.maxLines), overflow: true };
}
function drawText(ctx, text, box, color, warnings, weight = 700) {
  const fit = fitText(ctx, text, box, weight);
  if (fit.overflow) warnings.push('Text ist zu lang: „' + String(text).slice(0, 45) + '…“');
  ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height); ctx.clip();
  ctx.fillStyle = color; ctx.textBaseline = 'top';
  ctx.textAlign = box.align || 'left';
  const x = box.align === 'right' ? box.x + box.width : box.align === 'center' ? box.x + box.width / 2 : box.x;
  fit.lines.forEach((line, i) => ctx.fillText(line, x, box.y + i * fit.size * 1.15));
  ctx.restore();
  return fit;
}
export function cropGeometry(image, crop) {
  const box = layout.photo, iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
  if (crop.mode === 'contain') {
    const scale = Math.min(box.width / iw, box.height / ih);
    const width = iw * scale, height = ih * scale;
    return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
  }
  const scale = Math.max(box.width / iw, box.height / ih) * crop.zoom;
  const width = iw * scale, height = ih * scale;
  return { x: box.x - (width - box.width) * crop.x, y: box.y - (height - box.height) * crop.y, width, height };
}
export function dateLabel(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(5).split('-').reverse().join('.') : 'Datum auswählen';
}
function readableColor(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return r * .2126 + g * .7152 + b * .0722 > .179 ? '#12222b' : '#ffffff';
}
export function renderPost(canvas, state, config, image, scale = 1, backgroundImage = null) {
  canvas.width = layout.width * scale; canvas.height = layout.height * scale;
  const ctx = canvas.getContext('2d'); ctx.scale(scale, scale);
  const warnings = [], category = config.categories.find(item => item.code === state.category) || config.categories[0];
  const colors = { background: '#F8F7F3', header: '#142831', footer: '#142831', ...config.colors };
  const textColor = readableColor(colors.background), headerText = readableColor(colors.header), footerText = readableColor(colors.footer);
  drawBackground(ctx, layout.width, layout.height, colors.background, config.background, backgroundImage);
  if (config.background?.imageData && !backgroundImage) warnings.push('Hintergrundbild konnte noch nicht geladen werden.');
  if (backgroundImage || config.background?.gradientEnabled) {
    // Keep the text area readable over arbitrary photos and gradients.
    ctx.save(); ctx.globalAlpha = .9; ctx.fillStyle = colors.background;
    ctx.fillRect(40, 860, 1000, 395); ctx.restore();
  }
  ctx.fillStyle = colors.header; ctx.fillRect(0, 0, layout.width, 245);
  ctx.fillStyle = category.color; ctx.fillRect(0, 0, layout.width, 18);
  const brand = drawText(ctx, config.brand.toUpperCase(), { x: 60, y: 59, width: 690, height: 45, maxSize: 30, minSize: 14, maxLines: 1 }, headerText, warnings);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(state.date);
  drawText(ctx, validDate ? state.date.slice(0, 4) : '—', { x: 800, y: 59, width: 220, height: 45, maxSize: brand.size, minSize: brand.size, maxLines: 1, align: 'right' }, headerText, warnings);
  const number = drawText(ctx, 'EINSATZ ' + (state.number || '—'), { x: 60, y: 132, width: 570, height: 65, maxSize: 52, minSize: 24, maxLines: 1 }, headerText, warnings);
  drawText(ctx, validDate ? dateLabel(state.date) : '—', { x: 690, y: 132, width: 330, height: 65, maxSize: number.size, minSize: number.size, maxLines: 1, align: 'right' }, headerText, warnings);
  const photo = layout.photo;
  ctx.save(); ctx.beginPath(); ctx.rect(photo.x, photo.y, photo.width, photo.height); ctx.clip();
  if (image) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(photo.x, photo.y, photo.width, photo.height);
    const crop = cropGeometry(image, state.crop);
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height);
  }
  else {
    const gradient = ctx.createLinearGradient(60, 270, 1020, 838);
    gradient.addColorStop(0, '#254551'); gradient.addColorStop(1, '#10252e');
    ctx.fillStyle = gradient; ctx.fillRect(photo.x, photo.y, photo.width, photo.height);
    ctx.fillStyle = '#ffffff0c';
    for (let i = -3; i < 10; i++) { ctx.beginPath(); ctx.moveTo(i * 180, 272); ctx.lineTo(i * 180 + 400, 838); ctx.lineTo(i * 180 + 480, 838); ctx.lineTo(i * 180 + 80, 272); ctx.fill(); }
    ctx.fillStyle = '#d6e4e6'; ctx.textAlign = 'center'; ctx.font = '700 40px ' + fontFamily; ctx.fillText('DEIN EINSATZBILD', 540, 537);
    ctx.font = '400 25px ' + fontFamily; ctx.fillText('Bild hinzufügen · Ausschnitt wählen', 540, 580); ctx.textAlign = 'left';
  }
  ctx.restore();
  ctx.fillStyle = category.color; ctx.fillRect(84, 752, 126, 62);
  ctx.fillStyle = readableColor(category.color); ctx.font = '700 32px ' + fontFamily; ctx.textAlign = 'center'; ctx.fillText(category.code, 147, 794); ctx.textAlign = 'left';
  drawText(ctx, state.description || 'Kurzbeschreibung des Einsatzes', layout.description, textColor, warnings);
  drawText(ctx, category.keyword, layout.keyword, category.color, warnings, 600);
  const selectedVehicles = (config.vehicles || []).filter(code => (state.vehicles || []).includes(code));
  if (selectedVehicles.length) drawText(ctx, 'FAHRZEUGE · ' + selectedVehicles.join(' · '), layout.vehicles, textColor, warnings, 600);
  ctx.strokeStyle = textColor; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(60, 1139); ctx.lineTo(1020, 1139); ctx.stroke();
  ctx.fillStyle = textColor; ctx.font = '700 19px ' + fontFamily; ctx.fillText('ALARMIERUNG', 60, 1174); ctx.fillText('EINSATZORT', 235, 1174);
  ctx.fillStyle = textColor; ctx.font = '700 30px ' + fontFamily; ctx.fillText(state.time ? state.time + ' Uhr' : '—', 60, 1214);
  drawText(ctx, state.location || 'Einsatzort', layout.location, textColor, warnings, 600);
  ctx.fillStyle = colors.footer; ctx.fillRect(0, 1280, 1080, 70);
  drawText(ctx, config.footer, { x: 60, y: 1302, width: 960, height: 28, maxSize: 21, minSize: 13, maxLines: 1 }, footerText, warnings, 400);
  return warnings;
}
