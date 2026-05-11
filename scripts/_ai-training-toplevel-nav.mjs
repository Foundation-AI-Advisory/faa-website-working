// Promote AI Training out of the Methodology mega-menu into its own
// top-level nav item with a 2-card mega-menu (Bootcamp + Workforce
// Development). Sweep all pages that currently carry the
// mega-methodology block authored in the prior session.
//
// Changes per page:
//   1. After the <button data-mega="methodology"> ... </button>, add
//      a new <button data-mega="ai-training"> ... </button>.
//   2. Replace the existing #mega-methodology body (3 pillars +
//      Enablement card) with the simplified 3-pillar-only body.
//   3. Insert a new #mega-ai-training panel right after the
//      simplified mega-methodology panel.
//   4. On /ai-training-workforce-development/ specifically, move the
//      aria-current="page" attribute from the Methodology button to
//      the AI Training button.
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
    } else if (e.name === 'index.html') {
      out.push(p);
    }
  }
  return out;
}

// The Methodology button text exists in two variants on the current
// site: with and without aria-current="page". We need to match both.
const METHOD_BTN_RE = /<button type="button" class="utilnav-link" data-mega="methodology" aria-expanded="false" aria-controls="mega-methodology" aria-haspopup="true"( aria-current="page")?>\s*Methodology\s*<svg class="caret"[^>]*>[\s\S]*?<\/svg>\s*<\/button>/;

const NEW_METHOD_BTN = (ariaCurrent) =>
  `<button type="button" class="utilnav-link" data-mega="methodology" aria-expanded="false" aria-controls="mega-methodology" aria-haspopup="true"${ariaCurrent}>
        Methodology
        <svg class="caret" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>
      </button>
      <button type="button" class="utilnav-link" data-mega="ai-training" aria-expanded="false" aria-controls="mega-ai-training" aria-haspopup="true"${ariaCurrent === ' aria-current="page"' ? '' : ''}>
        AI Training
        <svg class="caret" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>
      </button>`;

// Existing mega-methodology block (with Enablement section) — full HTML
// authored in prior session.
const OLD_MEGA_METHOD = `  <div id="mega-methodology" class="mega-menu" role="region" aria-label="Methodology">
    <div class="mega-menu-inner">
      <div class="mega-method-layout">
        <div class="mega-method-core">
          <h4 class="mega-group-heading">Core Methodology</h4>
          <div class="mega-method-cards">
            <a href="/foundation/" class="mega-method-card">
              <span class="mega-method-num">01</span>
              <span class="mega-method-title">Data Curation<br />&amp; Governance</span>
              <span class="mega-method-dek">Data before anything else</span>
            </a>
            <a href="/operations/" class="mega-method-card">
              <span class="mega-method-num">02</span>
              <span class="mega-method-title">Workflow<br />Optimization</span>
              <span class="mega-method-dek">Fix process before applying AI</span>
            </a>
            <a href="/agentic-ai/" class="mega-method-card">
              <span class="mega-method-num">03</span>
              <span class="mega-method-title">AI Design<br />&amp; Implementation</span>
              <span class="mega-method-dek">Designed around measurable outcomes</span>
            </a>
          </div>
        </div>
        <div class="mega-method-enablement">
          <h4 class="mega-group-heading">Enablement</h4>
          <a href="/ai-training-workforce-development/" class="mega-method-card mega-method-card--enablement">
            <span class="mega-method-title">AI Training<br />&amp; Workforce Development</span>
            <span class="mega-method-dek">Practical capability before scaling AI</span>
          </a>
        </div>
      </div>
    </div>
  </div>`;

// Variant on some pages where /ai-training-workforce-development/ has
// aria-current="page" on the Enablement card.
const OLD_MEGA_METHOD_WITH_AC = OLD_MEGA_METHOD.replace(
  '<a href="/ai-training-workforce-development/" class="mega-method-card mega-method-card--enablement">',
  '<a href="/ai-training-workforce-development/" class="mega-method-card mega-method-card--enablement" aria-current="page">'
);

// Slim-header variant: all-on-one-line layout used by foundations-series
// articles + the /insight/?slug= page.
const OLD_MEGA_METHOD_INLINE = `  <div id="mega-methodology" class="mega-menu" role="region" aria-label="Methodology">
    <div class="mega-menu-inner">
      <div class="mega-method-layout">
        <div class="mega-method-core">
          <h4 class="mega-group-heading">Core Methodology</h4>
          <div class="mega-method-cards">
            <a href="/foundation/" class="mega-method-card"><span class="mega-method-num">01</span><span class="mega-method-title">Data Curation<br />&amp; Governance</span><span class="mega-method-dek">Data before anything else</span></a>
            <a href="/operations/" class="mega-method-card"><span class="mega-method-num">02</span><span class="mega-method-title">Workflow<br />Optimization</span><span class="mega-method-dek">Fix process before applying AI</span></a>
            <a href="/agentic-ai/" class="mega-method-card"><span class="mega-method-num">03</span><span class="mega-method-title">AI Design<br />&amp; Implementation</span><span class="mega-method-dek">Designed around measurable outcomes</span></a>
          </div>
        </div>
        <div class="mega-method-enablement">
          <h4 class="mega-group-heading">Enablement</h4>
          <a href="/ai-training-workforce-development/" class="mega-method-card mega-method-card--enablement"><span class="mega-method-title">AI Training<br />&amp; Workforce Development</span><span class="mega-method-dek">Practical capability before scaling AI</span></a>
        </div>
      </div>
    </div>
  </div>`;

// New simplified Methodology mega + new AI Training mega.
const NEW_MEGA_BOTH = `  <div id="mega-methodology" class="mega-menu" role="region" aria-label="Methodology">
    <div class="mega-menu-inner">
      <div class="mega-method-cards mega-method-cards--three">
        <a href="/foundation/" class="mega-method-card">
          <span class="mega-method-num">01</span>
          <span class="mega-method-title">Data Curation<br />&amp; Governance</span>
          <span class="mega-method-dek">Data before anything else</span>
        </a>
        <a href="/operations/" class="mega-method-card">
          <span class="mega-method-num">02</span>
          <span class="mega-method-title">Workflow<br />Optimization</span>
          <span class="mega-method-dek">Fix process before applying AI</span>
        </a>
        <a href="/agentic-ai/" class="mega-method-card">
          <span class="mega-method-num">03</span>
          <span class="mega-method-title">AI Design<br />&amp; Implementation</span>
          <span class="mega-method-dek">Designed around measurable outcomes</span>
        </a>
      </div>
    </div>
  </div>

  <div id="mega-ai-training" class="mega-menu" role="region" aria-label="AI Training">
    <div class="mega-menu-inner">
      <div class="mega-method-cards mega-method-cards--two">
        <a href="/ai-training-workforce-development/" class="mega-method-card">
          <span class="mega-method-num">Foundations</span>
          <span class="mega-method-title">AI Training Bootcamp</span>
          <span class="mega-method-dek">Learning the basics of AI &mdash; from foundations to using AI to solve real business problems.</span>
        </a>
        <a href="/ai-training-workforce-development/" class="mega-method-card">
          <span class="mega-method-num">Applied</span>
          <span class="mega-method-title">AI Workforce Development</span>
          <span class="mega-method-dek">Practical, hands-on, domain-specific training for executives, managers, and teams.</span>
        </a>
      </div>
    </div>
  </div>`;

let touched = 0, already = 0, nohook = 0;
for (const f of walk('.')) {
  const norm = f.replace(/\\/g, '/').replace(/^\.\//, '');
  const before = fs.readFileSync(f, 'utf8');

  // Idempotent skip.
  if (before.includes('id="mega-ai-training"')) { already++; continue; }

  // Skip pages with no mega-methodology (cookie-policy, privacy-policy,
  // legacy redirect shims).
  if (!before.includes('id="mega-methodology"')) { nohook++; continue; }

  // Detect whether this is the AI Training page — if so, the
  // aria-current should move from Methodology to AI Training.
  const isAITrainingPage = norm === 'ai-training-workforce-development/index.html';

  let after = before;

  // Step 1: replace the Methodology button with Methodology + AI Training
  // buttons. The Methodology button's aria-current behavior depends on
  // whether this page belongs to the methodology section (foundation,
  // operations, agentic-ai) — that's already in place from the prior
  // sweep, so we just need to PRESERVE it. The AI Training page is the
  // edge case: it currently has aria-current on the Methodology button
  // because AI Training used to live inside Methodology; we need to
  // strip that and put it on the AI Training button instead.
  const btnMatch = after.match(METHOD_BTN_RE);
  if (!btnMatch) { nohook++; console.warn('button regex miss:', f); continue; }
  const currentAC = btnMatch[1] || ''; // ' aria-current="page"' or ''

  // If this is the AI Training page, the methodology button should
  // LOSE its aria-current and the AI Training button should GAIN it.
  let methodologyAC, aiTrainingAC;
  if (isAITrainingPage) {
    methodologyAC = '';
    aiTrainingAC = ' aria-current="page"';
  } else {
    methodologyAC = currentAC; // preserve whatever was there
    aiTrainingAC = '';
  }

  const newButtons = `<button type="button" class="utilnav-link" data-mega="methodology" aria-expanded="false" aria-controls="mega-methodology" aria-haspopup="true"${methodologyAC}>
        Methodology
        <svg class="caret" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>
      </button>
      <button type="button" class="utilnav-link" data-mega="ai-training" aria-expanded="false" aria-controls="mega-ai-training" aria-haspopup="true"${aiTrainingAC}>
        AI Training
        <svg class="caret" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>
      </button>`;
  after = after.replace(METHOD_BTN_RE, newButtons);

  // Step 2: replace the mega-methodology block (3 variants).
  let blockReplaced = false;
  for (const oldBlock of [OLD_MEGA_METHOD, OLD_MEGA_METHOD_WITH_AC, OLD_MEGA_METHOD_INLINE]) {
    if (after.includes(oldBlock)) {
      after = after.replace(oldBlock, NEW_MEGA_BOTH);
      blockReplaced = true;
      break;
    }
  }
  if (!blockReplaced) { nohook++; console.warn('mega block miss:', f); continue; }

  fs.writeFileSync(f, after);
  touched++;
  console.log('updated:', f);
}
console.log('Done. Touched:', touched, 'Already:', already, 'No-hook:', nohook);
