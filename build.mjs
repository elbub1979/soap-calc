// Собирает автономный dist/soap-calc.html: CSS и все модули встроены внутрь,
// файл открывается с диска (file://) и на телефоне без сервера.
// Запуск: node build.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Модули склеиваются в порядке зависимостей; import/export убираются —
// внутри одного inline-модуля все объявления видят друг друга.
const stripModuleSyntax = (src) => src
  .replace(/^import\s[\s\S]*?from\s+'[^']+';\s*$/gm, '')
  .replace(/^export\s+(const|function|let)\s/gm, '$1 ');

const js = ['src/oils.js', 'src/oils_ru.js', 'src/calc.js', 'src/app.js'].map((f) => `// ---- ${f} ----\n${stripModuleSyntax(read(f))}`).join('\n');
const css = read('src/styles.css');
const html = read('index.html')
  .replace('<link rel="stylesheet" href="src/styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="src/app.js"></script>', '')
  // Автономный файл не должен ничего запрашивать по сети: убираем манифест, иконку и веб-шрифт
  // (остаётся системный шрифт из fallback-стека).
  .replace(/\s*<link rel="(manifest|apple-touch-icon|preconnect)"[^>]*>/g, '')
  .replace(/\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/g, '')
  .replace('</body>', `<script type="module">\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n</body>`);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/soap-calc.html');
fs.writeFileSync(out, html);
console.log(`Собрано: ${out} (${(html.length / 1024).toFixed(0)} КБ)`);
