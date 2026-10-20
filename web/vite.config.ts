import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const repo = resolve(__dirname, '..');

// En développement, sert /app-data/ et /docs/test/ depuis la racine du dépôt (comme GitHub Pages en production).
const serveRepo: Plugin = {
  name: 'behoop-serve-repo',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = decodeURIComponent((req.url ?? '').split('?')[0]);
      if (!/^\/(app-data|docs\/test|docs\/planches|out\/render|icons|logos)\//.test(url)) return next();
      const f = join(repo, url);
      if (!f.startsWith(repo) || !existsSync(f) || !statSync(f).isFile()) return next();
      const ext = f.split('.').pop()!;
      res.setHeader('Content-Type', ({ json: 'application/json', png: 'image/png', m3u8: 'application/vnd.apple.mpegurl', webp: 'image/webp', svg: 'image/svg+xml', ts: 'video/mp2t', vtt: 'text/vtt' } as Record<string, string>)[ext] ?? 'image/jpeg');
      createReadStream(f).pipe(res);
    });
  },
};

export default defineConfig({
  root: __dirname,
  base: '/app/',
  plugins: [react(), serveRepo],
  build: {
    outDir: resolve(repo, 'app'),
    emptyOutDir: true,
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), planche: resolve(__dirname, 'render/planche.html') } },
  },
  server: { port: 5173, host: true },
});
