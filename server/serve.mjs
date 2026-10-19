// Serveur de production : sert le build (dist/) et le proxy Gemini (/api/*).
// Usage : npm run build && npm start   (variables : GEMINI_API_KEY, PORT)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGeminiMiddleware } from './gemini-api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');

// Charge .env.local si présent (sans écraser les variables déjà définies)
const envFile = path.join(root, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('dist/ introuvable : lancez "npm run build" avant "npm start".');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

const api = createGeminiMiddleware(process.env.GEMINI_API_KEY);

const serveStatic = (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(distDir, path.normalize(urlPath));
  // Empêche de sortir de dist/ ; toute route inconnue renvoie l'application
  if (!file.startsWith(distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(distDir, 'index.html');
  }
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
};

const port = Number(process.env.PORT) || 3000;
http.createServer((req, res) => api(req, res, () => serveStatic(req, res)))
  .listen(port, () => {
    console.log(`Gibson sur http://localhost:${port}`);
    if (!process.env.GEMINI_API_KEY) console.warn('Attention : GEMINI_API_KEY non définie, les fonctions IA renverront une erreur.');
  });
