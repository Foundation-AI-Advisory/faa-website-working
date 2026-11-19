// Apply the foundation.html "Executive Answer" pattern to operations.html
// and agentic-ai.html: insert a 5-Q&A AEO panel between hero and the first
// content section, remove the bottom Common Questions block, replace the
// FAQPage JSON-LD with the new 5-question schema.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

const pages = [
  {
    file: 'operations.html',
    insertAfterAnchor: '</section>\n\n<!-- ============================================================= -->\n<!-- 1. THE PROBLEM',
    h2: 'Workflow Optimization Makes AI Operationally Safe',
    body: [
      'Before AI can extend a workflow, the workflow has to work. Workflow Optimization is the discipline of making how work actually gets done observable, repeatable, and controllable &mdash; defining decision points, clarifying handoffs, categorizing exceptions, and removing friction before automation is layered on top.',
      'Most mid-market workflows are not designed; they evolved. Over years of system additions, vendor switches, staff turnover, and manual workarounds, what looks like a process is often a set of loosely connected actions held together by experience. Humans navigate the gaps without much trouble. AI cannot.',
      'FAA optimizes workflows before applying AI because automation amplifies whatever it inherits. A clean workflow makes AI a force multiplier on margin, throughput, and cycle time. A broken workflow turns AI into a risk multiplier &mdash; running faster but failing in the same places, more often, with less explanation.',
    ],
    cta: 'Evaluate your workflow readiness',
    asideLabel: 'What this answers about Workflow Optimization',
    qa: [
      { q: 'What is Workflow Optimization?',                                a: 'Workflow Optimization is the work of making how a business actually operates observable, repeatable, and controllable &mdash; clarifying decision points, ownership, handoffs, and exception paths so that automation and AI can extend the workflow without amplifying its weaknesses.' },
      { q: 'Why fix workflow before applying AI?',                          a: 'AI cannot navigate undefined behavior. Automation built on tribal knowledge, manual overrides, and unclear approval paths runs faster but also fails faster. A clean workflow makes AI a force multiplier; a broken workflow turns it into a risk multiplier.' },
      { q: 'Who should own workflow optimization?',                         a: 'Ownership should sit with the operating leader closest to the work &mdash; the COO, controller, or function head &mdash; supported by IT for system integration. Automation owners are accountable for outcomes, not just throughput.' },
      { q: 'What business outcomes does workflow optimization improve?',    a: 'Better workflows improve cycle time, throughput, margin, operational visibility, and risk exposure by reducing rework, exception handling, manual reconciliation, and decision delays.' },
      { q: 'How does workflow optimization prepare a company for AI?',      a: 'It gives AI a structured environment to operate inside &mdash; clear decision points where AI can advise or act, defined exception paths where humans review, and measurable handoffs that make outputs auditable.' },
    ],
    closing: 'The goal is not faster work for its own sake. The goal is a workflow disciplined enough that automation and AI compound returns instead of compounding error.',
  },
  {
    file: 'agentic-ai.html',
    insertAfterAnchor: '</section>\n\n<!-- ============================================================= -->\n<!-- SECTION 1: WHAT WE SEE IN THE FIELD',
    h2: 'AI Design &amp; Implementation Tied to Measurable Outcomes',
    body: [
      'AI Design &amp; Implementation is the work of placing AI inside an operating environment that can support it &mdash; choosing the use case, defining the inputs, setting the controls, deciding where humans review, and tying the output to a metric the business already tracks. It is the third step in the FAA methodology, never the first.',
      'In mid-market companies, AI fails most often not at the model layer but at the seams between AI and the business. Use cases are picked for visibility instead of readiness. Inputs are unstable. Outputs land somewhere no one owns. Controls are improvised after the fact. The model performs; the operating system around it does not.',
      'FAA designs and implements AI inside the existing operating environment, on top of curated data and aligned workflows, with human oversight at decision points that affect financial or operational risk. The goal is AI that behaves like infrastructure &mdash; quiet, dependable, and tied to outcomes the business already measures.',
    ],
    cta: 'Plan your first AI use case',
    asideLabel: 'What this answers about AI Design and Implementation',
    qa: [
      { q: 'What is AI Design &amp; Implementation?',                       a: 'AI Design &amp; Implementation is the process of choosing where AI fits inside an operating model, defining its inputs and outputs, defining who can approve, override, or stop an action, and deploying it inside a workflow tied to a measurable business outcome.' },
      { q: 'How does FAA design AI for measurable business outcomes?',     a: 'Every use case FAA recommends is tied to one of six outcomes: margin, throughput, cycle time, cash flow, risk exposure, or operational visibility. The use case must have a clear owner, defined inputs, controlled outputs, and a path to production &mdash; not a pilot that ends in a slide deck.' },
      { q: 'Who should own AI implementation?',                            a: 'Ownership should sit with the business function whose outcome the AI affects, supported by IT for architecture and security. AI without a named business owner becomes orphaned infrastructure.' },
      { q: 'What outcomes should AI produce?',                             a: 'AI should improve margin, throughput, cycle time, cash flow, risk exposure, or operational visibility. FAA does not recommend AI work without a clear business outcome and a path to production.' },
      { q: 'How does FAA approach AI implementation in mid-market companies?', a: 'FAA implements AI inside the existing operating environment, on top of curated data and aligned workflows, with human oversight at decision points that affect financial or operational risk. The goal is AI that behaves like infrastructure &mdash; quiet, dependable, and tied to what the business already measures.' },
    ],
    closing: 'The goal is not more AI for its own sake. The goal is AI applied where it earns its keep, after the system underneath it has been built to hold weight.',
  },
];

function decode(s) {
  return s
    .replace(/&mdash;/g, '—')
    .replace(/&rsquo;/g, '’')
    .replace(/&amp;/g, '&');
}

function buildVisibleSection(p) {
  const items = p.qa.map(({ q, a }) => `          <div class="aeo-faq-item">
            <dt>${q}</dt>
            <dd>${a}</dd>
          </div>`).join('\n');
  const bodyParas = p.body.map(t => `        <p class="body-lg mt-5" style="color: var(--faa-gray-600);">
          ${t}
        </p>`).join('\n');
  return `
<!-- ============================================================= -->
<!-- EXECUTIVE ANSWER (AEO)                                        -->
<!-- ============================================================= -->
<section class="bg-white">
  <div class="container-faa section-y">
    <div class="methodology-intro-grid">
      <div class="methodology-intro-text">
        <div class="eyebrow" style="color: var(--faa-navy);">Executive Answer</div>
        <h2 class="h2 mt-3">${p.h2}</h2>
${bodyParas}
        <a href="mailto:blueprint@foundationaiadvisory.com?subject=Business%20Systems%20Assessment%20Inquiry" class="read-link" style="display: inline-block; margin-top: 28px; font-size: 15px; font-weight: 600;">${p.cta}&nbsp;<span class="arrow">&rarr;</span></a>
      </div>

      <aside class="methodology-aeo" aria-label="${p.asideLabel}">
        <div class="eyebrow" style="color: var(--faa-navy);">What This Answers</div>
        <dl class="aeo-faq" style="margin-top: 20px;">
${items}
        </dl>
        <p class="aeo-closing">${p.closing}</p>
      </aside>
    </div>
  </div>
</section>
`;
}

function buildSchema(p) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: p.qa.map(({ q, a }) => ({
      '@type': 'Question',
      name: decode(q),
      acceptedAnswer: { '@type': 'Answer', text: decode(a) },
    })),
  };
}

for (const p of pages) {
  let html = fs.readFileSync(p.file, 'utf8');

  // 1. Insert visible section between hero and first content section.
  if (!html.includes(p.insertAfterAnchor)) throw new Error('insert anchor not found in ' + p.file);
  // The anchor begins with the hero's </section>; we want to insert AFTER that close,
  // before the next comment block. Replacement preserves the anchor as the second part.
  const visible = buildVisibleSection(p);
  // Find the </section> that closes the hero, replace the chunk with hero-close + visible + same comment block.
  const anchorIdx = html.indexOf(p.insertAfterAnchor);
  // anchor starts at "</section>". We want: ... </section> + new visible + remaining anchor (starting at "\n\n<!-- ===")
  // Simpler: inject just AFTER the closing </section> at the start of the anchor.
  const heroCloseEnd = anchorIdx + '</section>'.length;
  html = html.slice(0, heroCloseEnd) + '\n' + visible.trimEnd() + html.slice(heroCloseEnd);

  // 2. Remove the bottom Common Questions block (.page-faq based).
  const bottomFaqRe = /\n*<!-- =+ -->\n<!-- COMMON QUESTIONS\s+-->\n<!-- =+ -->\n<section class="bg-white border-t"[\s\S]*?<\/section>\n/;
  if (!bottomFaqRe.test(html)) throw new Error('bottom Common Questions not found in ' + p.file);
  html = html.replace(bottomFaqRe, '\n');

  // 3. Replace existing 3-Q&A FAQPage schema with new 5-Q&A schema.
  const oldSchemaRe = /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?<\/script>/;
  if (!oldSchemaRe.test(html)) throw new Error('FAQPage schema not found in ' + p.file);
  const newSchemaTag = '<script type="application/ld+json">' + JSON.stringify(buildSchema(p)) + '</script>';
  html = html.replace(oldSchemaRe, newSchemaTag);

  fs.writeFileSync(p.file, html);
  console.log('  migrated:', p.file);
}
