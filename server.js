'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const defaults = require('./config/defaults.json');

function validateConfig(input) {
  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !/[\u0000-\u001f]/.test(value);
  if (!input || !text(input.brand, 80) || !text(input.footer, 120) || !Array.isArray(input.categories) || input.categories.length < 1 || input.categories.length > 40 || !Array.isArray(input.presets) || input.presets.length > 30) throw new Error('Invalid configuration');
  const seen = new Set();
  const categories = input.categories.map(item => {
    if (!item || !/^[A-Z][A-Z0-9_-]{0,9}$/.test(item.code) || seen.has(item.code) || !text(item.label, 60) || !text(item.keyword, 100) || !/^#[a-f0-9]{6}$/i.test(item.color)) throw new Error('Invalid category');
    seen.add(item.code);
    return { code: item.code, label: item.label.trim(), keyword: item.keyword.trim(), color: item.color };
  });
  if (!input.presets.every(item => text(item, 100))) throw new Error('Invalid preset');
  // Supply new fields for configurations saved before colors and vehicles existed.
  const rawColors = input.colors === undefined ? defaults.colors : input.colors;
  if (!rawColors || typeof rawColors !== 'object' || Array.isArray(rawColors)) throw new Error('Invalid colors');
  const colors = Object.fromEntries(Object.keys(defaults.colors).map(key => {
    const value = rawColors[key] === undefined ? defaults.colors[key] : rawColors[key];
    if (!/^#[a-f0-9]{6}$/i.test(value)) throw new Error('Invalid color');
    return [key, value];
  }));
  const rawVehicles = input.vehicles === undefined ? defaults.vehicles : input.vehicles;
  if (!Array.isArray(rawVehicles) || rawVehicles.length > 40) throw new Error('Invalid vehicles');
  const vehicles = rawVehicles.map(value => {
    if (typeof value !== 'string') throw new Error('Invalid vehicle');
    const code = value.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9 /_-]{0,15}$/.test(code)) throw new Error('Invalid vehicle');
    return code;
  });
  if (new Set(vehicles).size !== vehicles.length) throw new Error('Duplicate vehicle');
  return { brand: input.brand.trim(), footer: input.footer.trim(), colors, vehicles, categories, presets: input.presets.map(item => item.trim()) };
}

function createServer(options = {}) {
  const publicRoot = path.join(__dirname, 'public');
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data');
  const configFile = path.join(dataDir, 'config.json');
  const adminToken = options.adminToken ?? process.env.ADMIN_TOKEN ?? '';
  const configRevision = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  let config, revision;
  let writeQueue = Promise.resolve();
  const attempts = new Map();
  const initialized = fs.readFile(configFile, 'utf8').then(raw => { config = validateConfig(JSON.parse(raw)); }).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    config = structuredClone(defaults);
  }).then(() => { revision = configRevision(config); });
  initialized.catch(error => console.error('Configuration could not be loaded:', error.message));
  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const authorized = req => {
    const supplied = (req.headers.authorization || '').replace(/^Bearer /, '');
    const digest = value => crypto.createHash('sha256').update(value).digest();
    return adminToken.length >= 16 && crypto.timingSafeEqual(digest(supplied), digest(adminToken));
  };
  const readBody = async req => {
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) throw Object.assign(new Error('Body too large'), { status: 413 });
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
  };
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob: data: https:; connect-src 'self' https:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      await initialized;
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
      catch { return json(res, 400, { error: 'Ungültige Adresse.' }); }
      if (pathname === '/api/health' && req.method === 'GET') return json(res, 200, { status: 'ok', application: 'EinsatzPost' });
      if (pathname === '/api/config') {
        if (req.method === 'GET') return json(res, 200, { config, revision, adminEnabled: adminToken.length >= 16 });
        if (req.method !== 'PUT') { res.setHeader('Allow', 'GET, PUT'); return json(res, 405, { error: 'Methode nicht erlaubt.' }); }
        if (adminToken.length < 16) return json(res, 503, { error: 'ADMIN_TOKEN mit mindestens 16 Zeichen einrichten.' });
        const ip = req.socket.remoteAddress, now = Date.now();
        if (attempts.size > 1000) for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
        let attempt = attempts.get(ip);
        if (!attempt || attempt.until < now) attempt = { count: 0, until: now + 60000 };
        if (attempt.count >= 10) return json(res, 429, { error: 'Zu viele Versuche. Bitte eine Minute warten.' });
        if (!authorized(req)) { attempt.count++; attempts.set(ip, attempt); return json(res, 401, { error: 'Admin-Schlüssel ist ungültig.' }); }
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'JSON erwartet.' });
        const body = await readBody(req);
        let validated;
        try { validated = validateConfig(body.config); }
        catch { return json(res, 400, { error: 'Eindeutige Kürzel, gültige Farben und ausgefüllte Texte erforderlich.' }); }
        const result = writeQueue.then(async () => {
          if (body.revision !== revision) return false;
          await fs.mkdir(dataDir, { recursive: true });
          const tempFile = configFile + '.' + crypto.randomUUID() + '.tmp';
          try {
            await fs.writeFile(tempFile, JSON.stringify(validated, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
            await fs.rename(tempFile, configFile);
          } finally { await fs.rm(tempFile, { force: true }).catch(() => {}); }
          config = validated; revision = configRevision(config); return true;
        });
        writeQueue = result.catch(() => {});
        if (!await result) return json(res, 409, { error: 'Einstellungen zwischenzeitlich geändert. Seite neu laden und erneut bearbeiten.' });
        return json(res, 200, { config, revision, adminEnabled: true });
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return json(res, 405, { error: 'Methode nicht erlaubt.' }); }
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const target = path.resolve(publicRoot, relative);
      if (relative.includes('\0') || relative.split(/[\\/]/).some(segment => segment.startsWith('.')) || !target.startsWith(publicRoot + path.sep)) return json(res, 404, { error: 'Nicht gefunden.' });
      try {
        const bytes = await fs.readFile(target);
        res.writeHead(200, { 'Content-Type': (types[path.extname(target)] || 'application/octet-stream') + (/\.(html|css|js|json)$/.test(target) ? '; charset=utf-8' : ''), 'Content-Length': bytes.length, 'Cache-Control': 'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : bytes);
      } catch (error) {
        if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) return json(res, 404, { error: 'Nicht gefunden.' });
        throw error;
      }
    } catch (error) {
      console.error('Request failed:', error.message);
      if (!res.headersSent) json(res, error.status || 500, { error: error.status ? 'Anfrage konnte nicht verarbeitet werden.' : 'Serverfehler. Bitte später erneut versuchen.' });
      else res.end();
    }
  });
}
module.exports = { createServer, validateConfig };
