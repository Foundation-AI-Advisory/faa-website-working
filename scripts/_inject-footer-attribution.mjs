// Throwaway: append the FAA in-house attribution line to every page's
// footer. Footer markup is hand-duplicated per page (no shared partial),
// so this is a sweep across all 26 production pages that carry the
// shared <footer style="background: var(--faa-navy);"> block.
//
// Insertion point: inside the .container-faa, after the existing flex
// row that holds the logo/copyright (left) and legal nav (right). The
// paragraph sits as a centered, hairline-divided second row beneath
// the existing legal row — visible but secondary, no new fonts, no
// new colors, just lower-opacity white over the navy footer.
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

// Anchor: closing </nav> then </div> (flex row close) then </div>
// (container-faa close) then </footer>. This is the exact, consistent
// pattern across all 26 footer-carrying pages — verified via grep
// before writing this script. We insert the new <p> *before* the
// container-faa close and *after* the flex row close, so it sits
// inside the navy container as a second row.
const ANCHOR = `      </nav>
    </div>
  </div>
</footer>`;

const ATTRIBUTION_LINE = '<p class="footer-attribution">Built in-house by Foundation AI Advisory - where finance, governance, operations, and AI meet practical execution.</p>';

const REPLACEMENT = `      </nav>
    </div>
    ${ATTRIBUTION_LINE}
  </div>
</footer>`;

let touched = 0, already = 0, nohook = 0;
for (const f of walk('.')) {
  const before = fs.readFileSync(f, 'utf8');
  if (before.includes('class="footer-attribution"')) { already++; continue; }
  if (!before.includes(ANCHOR)) { nohook++; continue; }
  const after = before.replace(ANCHOR, REPLACEMENT);
  fs.writeFileSync(f, after);
  touched++;
  console.log('updated:', f);
}
console.log('Done. Touched:', touched, 'Already:', already, 'No-hook:', nohook);
