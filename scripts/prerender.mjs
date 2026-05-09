/**
 * Prerender script — bakes the Foundations Series + /insights/ article bodies
 * into static HTML so crawlers and answer engines see real content (not
 * "Loading insight..." or an empty <main>).
 *
 * Idempotent: detects already-rendered pages and skips them.
 *
 * Sources:
 *   - Foundations Series: ./scripts/foundations-articles.mjs (mirrors
 *     foundations-series.js's `articles` array; kept here so the prerender
 *     and the legacy client-side renderer stay in sync.)
 *   - /insights/<slug>.md: the markdown frontmatter + body that the legacy
 *     insight-detail.js fetches at runtime.
 *
 * Effects:
 *   - Replaces the body of <main> in each target HTML file.
 *   - Removes the <script src="foundations-series.js"> / insight-detail.js
 *     tags from prerendered pages so the JS doesn't run and double-render.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hub, articles } from './foundations-articles.mjs';

const SITE = 'https://foundationaiadvisory.com';

// =========================================================================
// Helpers
// =========================================================================

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

function escapeHtml(value) {
  return esc(value);
}

function renderInline(value) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let list = [];
  let orderedList = [];

  function flushList() {
    if (!list.length) return;
    html.push('<ul>' + list.map((item) => '<li>' + renderInline(item) + '</li>').join('') + '</ul>');
    list = [];
  }
  function flushOrderedList() {
    if (!orderedList.length) return;
    html.push('<ol>' + orderedList.map((item) => '<li>' + renderInline(item) + '</li>').join('') + '</ol>');
    orderedList = [];
  }

  for (const line of lines) {
    if (line.startsWith('- ')) {
      flushOrderedList();
      list.push(line.slice(2));
      continue;
    }
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushList();
      orderedList.push(orderedMatch[1]);
      continue;
    }
    flushList();
    flushOrderedList();
    if (!line.trim()) continue;
    if (line.startsWith('### ')) { html.push('<h3>' + renderInline(line.slice(4)) + '</h3>'); continue; }
    if (line.startsWith('## '))  { html.push('<h2>' + renderInline(line.slice(3)) + '</h2>'); continue; }
    html.push('<p>' + renderInline(line) + '</p>');
  }
  flushList();
  flushOrderedList();
  return html.join('\n');
}

function parseFrontMatter(markdown) {
  const m = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return { meta: {}, content: markdown };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const im = line.match(/^([^:]+):\s*"(.*)"\s*$/) || line.match(/^([^:]+):\s*(.*)\s*$/);
    if (im) meta[im[1].trim()] = im[2].trim();
  }
  return { meta, content: m[2].trim() };
}

function replaceMainBody(html, newInner) {
  // Replace the contents of the FIRST <main ...>...</main> with `newInner`,
  // preserving the opening <main ...> tag and its attributes.
  return html.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/, (_m, open, close) => open + '\n' + newInner + '\n' + close);
}

function stripScript(html, srcSuffix) {
  // Remove a <script src="...srcSuffix" ...></script> tag (with or without defer).
  const escaped = srcSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('\\s*<script\\s+src="[^"]*' + escaped + '"[^>]*>\\s*</script>', 'g');
  return html.replace(re, '');
}

function alreadyPrerendered(html) {
  // Heuristic marker we leave at the top of <main> after first prerender.
  return html.includes('<!--PRERENDERED-->');
}

// =========================================================================
// Foundations Series — templates (ported from foundations-series.js)
// =========================================================================

function articleHref(article) {
  return 'insights-' + article.key + '.html';
}

function navFor(article) {
  const index = articles.indexOf(article);
  const previous = index === 0 ? null : articles[index - 1];
  const next = index === articles.length - 1 ? null : articles[index + 1];
  return `
      <nav class="foundations-series-nav" aria-label="Foundations series navigation">
        <a href="${previous ? articleHref(previous) : 'insights-foundations-applied-ai-series.html'}">
          <span>${previous ? 'Previous Brief' : 'Back to Series'}</span>
          <strong>${esc(previous ? previous.title : hub.title)}</strong>
        </a>
        <a href="${next ? articleHref(next) : 'insights-foundations-applied-ai-series.html'}">
          <span>${next ? 'Next Brief' : 'Back to Series'}</span>
          <strong>${esc(next ? next.title : 'Explore the Full Foundations Series')}</strong>
        </a>
      </nav>
    `;
}

function renderFinalCta(isFinal) {
  return `
      <section class="foundations-final-cta">
        <div class="container-faa">
          <div class="foundations-cta-inner">
            <div>
              <span class="eyebrow">${isFinal ? 'Final Step' : 'AI Foundation Readiness Review'}</span>
              <h2>${isFinal ? 'Ready to apply AI without scaling chaos?' : 'AI Foundation Readiness Review'}</h2>
              <p>${isFinal ? 'FAA helps mid-market operators evaluate data, process, architecture, sequencing, and governance before AI is deployed. The goal is not more tools. The goal is a business foundation AI can actually use.' : 'In 30 minutes, we&rsquo;ll identify where your AI foundation is strongest, where it is exposed, and which use cases are worth pursuing first.'}</p>
            </div>
            <div class="foundations-actions">
              <a href="mailto:blueprint@foundationaiadvisory.com?subject=Business%20Systems%20Assessment%20Inquiry" class="btn btn-on-blue">Start with a Business Systems Assessment</a>
              ${isFinal ? '<a href="index.html#methodology" class="btn btn-outline-white">Explore the FAA Methodology</a>' : ''}
            </div>
          </div>
        </div>
      </section>
    `;
}

function renderHub() {
  return `<!--PRERENDERED-->
      <section class="foundations-hub-image-section" aria-label="Foundations Series — Five Operating Layers">
        <img class="foundations-hub-image" src="assets/insights/foundations-series-architecture-hero.png" alt="Five layered operating planes — data, process, architecture, ROI sequencing, and governance — stacked as a single architecture for applied AI" />
      </section>
      <section class="foundations-hub-intro">
        <div class="container-faa foundations-hub-grid">
          <div>
            <div class="eyebrow">${esc(hub.eyebrow)}</div>
            <h1 class="foundations-h1">${esc(hub.title)}</h1>
            ${hub.description.map((item) => `<p class="foundations-lede">${esc(item)}</p>`).join('')}
            <div class="foundations-actions">
              <a href="${hub.primary.href}" class="btn btn-primary">${esc(hub.primary.label)}</a>
              <a href="${hub.secondary.href}" class="btn btn-outline-navy">${esc(hub.secondary.label)}</a>
            </div>
          </div>
          <div class="foundations-hub-panel" aria-label="Series structure">
            <span>Five operating layers</span>
            <strong>Data → Process → Architecture → ROI → Governance</strong>
          </div>
        </div>
      </section>
      <section class="foundations-hub-context">
        <div class="container-faa">
          <p class="foundations-context-lede">AI does not fail because models are weak. It fails because the operating system underneath is not ready to support it. Data is fragmented. Workflows depend on tribal knowledge. Architecture grew around constraints that no longer exist. ROI is measured against the wrong unit. Governance is improvised after the fact.</p>
          <p class="foundations-context-lede">Foundations is the field series for operators who want to fix that order before the next AI initiative. Each Part covers one of the five operating layers that determine whether AI creates leverage or scales failure. Each is short enough to read in twenty minutes and concrete enough to act on this week.</p>
        </div>
      </section>
      <section class="bg-white">
        <div class="container-faa section-y">
          <div class="foundations-card-grid">
            ${articles.map((article) => `
              <a class="foundations-series-card" href="${articleHref(article)}">
                <span>Part ${article.part} of 5</span>
                <small>${esc(article.category)}</small>
                <h2>${esc(article.title)}</h2>
                <p>${esc(article.subhead)}</p>
                <strong>Read brief →</strong>
              </a>
            `).join('')}
          </div>
        </div>
      </section>
      ${renderFinalCta(false)}
    `;
}

function renderArticle(article) {
  return `<!--PRERENDERED-->
      <section class="foundations-hub-image-section" aria-label="Foundations Series — Part ${article.part}">
        <img class="foundations-hub-image" src="${esc(article.image)}" alt="${esc(article.imageAlt || (article.title + ' — Foundations Series Part ' + article.part))}" />
      </section>
      <section class="foundations-article-intro">
        <div class="container-faa">
          <a href="insights-foundations-applied-ai-series.html" class="read-link">Back to Series</a>
          <div class="foundations-meta">
            <span>Field Series</span>
            <span>Part ${article.part} of 5</span>
            <span>${esc(article.category)}</span>
          </div>
          <h1 class="foundations-h1">${esc(article.title)}</h1>
          <p class="foundations-article-subhead">${esc(article.subhead)}</p>
        </div>
      </section>
      <section class="bg-white">
        <div class="container-faa foundations-article-layout">
          <article class="foundations-body">
            ${article.body.slice(0, 5).map((item) => `<p>${esc(item)}</p>`).join('')}
            <blockquote>${esc(article.pull)}</blockquote>
            ${article.body.slice(5).map((item) => `<p>${esc(item)}</p>`).join('')}
            <aside class="foundations-operator-box">
              <h2>What this means for operators</h2>
              <p>${esc(article.operator)}</p>
            </aside>
            <aside class="foundations-diagnostic">
              <h2>Where this usually breaks</h2>
              <ul>${article.diagnostic.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
              <a href="mailto:blueprint@foundationaiadvisory.com?subject=Business%20Systems%20Assessment%20Inquiry" class="read-link">${esc(article.diagnosticCta)} →</a>
            </aside>
            <div class="foundations-article-cta">
              <a href="mailto:blueprint@foundationaiadvisory.com?subject=Business%20Systems%20Assessment%20Inquiry" class="btn btn-primary">${esc(article.cta)}</a>
            </div>
            ${navFor(article)}
          </article>
        </div>
      </section>
      ${renderFinalCta(article.part === 5)}
    `;
}

// =========================================================================
// Insight detail (markdown-driven) renderer
// =========================================================================

const insightImageAlt = {
  'where-agents-earn-their-keep': 'Abstract visualization of unstructured data flowing through filtering gates into an ordered grid output.',
  'mid-market-case-for-platform-agnostic': 'Abstract visualization of complex data flowing through layered architecture panels into a structured tiered stack.',
  'data-governance-non-enterprise-teams': 'Infographic explaining lightweight data governance for non-enterprise teams',
  'automating-a-broken-process-scales-the-problem': 'Abstract visualization of data flows curving across structured operating platforms, representing workflow optimization',
  'how-work-actually-gets-done-vs-how-its-documented': 'Two professionals mapping decision workflows and process logic across structured diagrams and documents',
};

function renderInsight(slug, markdown) {
  const { meta, content } = parseFrontMatter(markdown);
  // Path prefix from /insights/<slug>.html → asset paths relative to project
  // root use ../ from this file. Mirror the runtime resolveAsset behavior.
  function resolveAsset(p) {
    if (!p) return p;
    if (/^https?:\/\//i.test(p) || p.startsWith('mailto:') || p.startsWith('data:')) return p;
    const cleaned = String(p).replace(/^(\.\.\/|\.\/|\/)+/, '');
    return '../' + cleaned;
  }

  const audioType = meta.audio && meta.audio.toLowerCase().endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg';
  const audio = meta.audio
    ? `<div class="insight-audio"><audio controls><source src="${escapeHtml(resolveAsset(meta.audio))}" type="${audioType}"></audio></div>`
    : '';
  const contentImage = meta.contentImage
    ? `<figure class="insight-content-image"><img src="${escapeHtml(resolveAsset(meta.contentImage))}" alt="${escapeHtml(meta.contentImageAlt || '')}"><figcaption>${escapeHtml(meta.contentImageCaption || '')}</figcaption></figure>`
    : '';
  const cta = meta.ctaLabel
    ? `<div class="insight-article-cta"><a href="${escapeHtml(meta.ctaHref || 'mailto:blueprint@foundationaiadvisory.com?subject=Business%20Systems%20Assessment%20Inquiry')}" class="btn btn-primary">${escapeHtml(meta.ctaLabel)}</a></div>`
    : '';

  const heroImg = meta.image
    ? `<figure class="insight-detail-image">
        <img src="${escapeHtml(resolveAsset(meta.image))}" alt="${escapeHtml(insightImageAlt[slug] || meta.title || '')}" />
       </figure>`
    : '';

  return `<!--PRERENDERED-->
  <section class="insight-detail-hero">
    <div class="container-faa">
      <a href="../insights.html" class="read-link">Insights &larr;</a>
      <div class="insight-detail-meta mt-8">
        <span data-insight-category>${escapeHtml(meta.eyebrow || meta.category || '')}</span>
        <span data-insight-format>${escapeHtml(meta.format || '')}</span>
        ${meta.pillar ? `<span data-insight-pillar>${escapeHtml(meta.pillar)}</span>` : '<span data-insight-pillar hidden></span>'}
      </div>
      <h1 class="insight-detail-title mt-5" data-insight-title>${escapeHtml(meta.title || '')}</h1>
      <p class="insight-detail-excerpt mt-6" data-insight-excerpt>${escapeHtml(meta.deck || meta.excerpt || '')}</p>
    </div>
  </section>
  <section class="bg-white">
    <div class="container-faa insight-detail-layout">
      ${heroImg}
      <article class="insight-detail-body" data-insight-body>${audio}${contentImage}${renderMarkdown(content)}${cta}</article>
    </div>
  </section>
  `;
}

// =========================================================================
// Run
// =========================================================================

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

let touched = 0;

// 1. Foundations Series HUB
{
  const file = 'insights-foundations-applied-ai-series.html';
  let s = fs.readFileSync(file, 'utf8');
  if (!alreadyPrerendered(s)) {
    s = replaceMainBody(s, renderHub());
    s = stripScript(s, 'foundations-series.js');
    fs.writeFileSync(file, s);
    console.log('  prerendered hub:', file);
    touched++;
  } else {
    console.log('  already prerendered:', file);
  }
}

// 2. Foundations Series PART pages
const partKeyToFile = {
  'foundations-data-constraint': 'insights-foundations-data-constraint.html',
  'foundations-process-before-ai': 'insights-foundations-process-before-ai.html',
  'foundations-ai-architecture': 'insights-foundations-ai-architecture.html',
  'foundations-ai-roi-sequencing': 'insights-foundations-ai-roi-sequencing.html',
  'foundations-ai-governance': 'insights-foundations-ai-governance.html',
};
for (const article of articles) {
  const file = partKeyToFile[article.key];
  if (!file) { console.log('  missing partKeyToFile entry for', article.key); continue; }
  let s = fs.readFileSync(file, 'utf8');
  if (!alreadyPrerendered(s)) {
    s = replaceMainBody(s, renderArticle(article));
    s = stripScript(s, 'foundations-series.js');
    fs.writeFileSync(file, s);
    console.log('  prerendered:', file);
    touched++;
  } else {
    console.log('  already prerendered:', file);
  }
}

// 3. /insights/*.html (markdown-backed)
const insightSlugs = [
  'where-agents-earn-their-keep',
  'mid-market-case-for-platform-agnostic',
  'data-governance-non-enterprise-teams',
  'automating-a-broken-process-scales-the-problem',
  'how-work-actually-gets-done-vs-how-its-documented',
];
for (const slug of insightSlugs) {
  const file = `insights/${slug}.html`;
  const md = `content/insights/${slug}.md`;
  if (!fs.existsSync(file) || !fs.existsSync(md)) { console.log('  skip missing:', slug); continue; }
  let s = fs.readFileSync(file, 'utf8');
  if (!alreadyPrerendered(s)) {
    const markdown = fs.readFileSync(md, 'utf8');
    s = replaceMainBody(s, renderInsight(slug, markdown));
    s = stripScript(s, 'insight-detail.js');
    fs.writeFileSync(file, s);
    console.log('  prerendered:', file);
    touched++;
  } else {
    console.log('  already prerendered:', file);
  }
}

console.log(`Touched ${touched} files.`);
