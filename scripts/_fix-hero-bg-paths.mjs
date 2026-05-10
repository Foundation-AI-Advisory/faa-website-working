// Throwaway: rewrite inline `background-image: url('assets/…')` to use a
// root-relative path. The relative form happens to work on the homepage
// (which lives at /) but 404s on every nested page like /foundation/,
// /operations/, etc., because the browser resolves `assets/x.webp`
// against the page URL — yielding /foundation/assets/x.webp on the
// foundation page. The leading slash anchors at the site root on every
// page, fixing all 9 broken hero images and making the 4 homepage
// references future-proof.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.posix.join(dir.replaceAll('\\', '/'), e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'squoosh-queue', 'squoosh-out', 'assets', 'content', 'scripts'].includes(e.name)) continue;
      walk(p, out);
    } else if (e.name.endsWith('.html')) {
      out.push(p);
    }
  }
  return out;
}

let touched = 0, total = 0;
for (const f of walk('.')) {
  const before = fs.readFileSync(f, 'utf8');
  // Match url('assets/…') and url("assets/…") inside an inline style
  // attribute. Do NOT match url(/assets/…) — those are already correct.
  const after = before.replace(/url\((['"])assets\//g, "url($1/assets/");
  if (after !== before) {
    fs.writeFileSync(f, after);
    const matches = (before.match(/url\(['"]assets\//g) || []).length;
    touched++;
    total += matches;
    console.log('updated:', f, '— refs fixed:', matches);
  }
}
console.log('Done. Files touched:', touched, '— total refs rewritten:', total);
