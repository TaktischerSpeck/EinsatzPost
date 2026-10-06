export function backgroundGeometry(image, width, height) {
  const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
  const scale = Math.max(width / iw, height / ih), w = iw * scale, h = ih * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}
export function drawBackground(ctx, width, height, baseColor, settings = {}, image = null) {
  ctx.fillStyle = baseColor; ctx.fillRect(0, 0, width, height);
  if (settings.gradientEnabled) {
    const angle = (settings.gradientAngle || 0) * Math.PI / 180;
    const dx = Math.cos(angle), dy = Math.sin(angle), length = Math.abs(width * dx) + Math.abs(height * dy);
    const gradient = ctx.createLinearGradient(width / 2 - dx * length / 2, height / 2 - dy * length / 2, width / 2 + dx * length / 2, height / 2 + dy * length / 2);
    gradient.addColorStop(0, settings.gradientStart); gradient.addColorStop(1, settings.gradientEnd);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  }
  if (image) {
    const geometry = backgroundGeometry(image, width, height);
    ctx.save(); ctx.globalAlpha = settings.imageOpacity ?? .3;
    ctx.drawImage(image, geometry.x, geometry.y, geometry.width, geometry.height);
    ctx.restore();
  }
}
