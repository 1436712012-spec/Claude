// Single-file build.
//   dist/index.html     standalone document (open directly or host anywhere)
//   dist/artifact.html  the same page as a fragment (no html/head/body), for claude.ai Artifacts
import fs from 'node:fs';
import { build } from 'esbuild';

fs.mkdirSync('dist', { recursive: true });

const worker = await build({
  entryPoints: ['src/babel/worker.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  write: false,
  target: 'es2020',
});
const workerSrc = worker.outputFiles[0].text;

const app = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  write: false,
  target: 'es2020',
  logLevel: 'warning',
});
const appSrc = app.outputFiles[0].text;

const css = await build({ entryPoints: ['src/style.css'], bundle: true, minify: true, write: false, loader: { '.css': 'css' } });
const cssSrc = css.outputFiles[0].text;

const html = fs.readFileSync('index.html', 'utf8');
const body = html.slice(html.indexOf('<!--BODY-->') + 11, html.indexOf('<!--/BODY-->')).trim();
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');

const scripts =
  `<script>window.__BABEL_WORKER_SRC__=${safe(JSON.stringify(workerSrc))};</script>\n` +
  `<script type="module">${safe(appSrc)}</script>`;

const head = `<title>The Library of Babel</title>
<meta name="description" content="An explorable, ray-marched Library of Babel where every possible book has exactly one shelf.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>${cssSrc}</style>`;

const standalone = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body class="intro">
${body}
${scripts}
</body>
</html>
`;
fs.writeFileSync('dist/index.html', standalone);

const fragment = `${head}
${body}
${scripts}
`;
fs.writeFileSync('dist/artifact.html', fragment);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' KB';
console.log(`dist/index.html ${kb(standalone)} · dist/artifact.html ${kb(fragment)} (worker ${kb(workerSrc)}, app ${kb(appSrc)}, css ${kb(cssSrc)})`);
