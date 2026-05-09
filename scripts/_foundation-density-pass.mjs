// One-shot: density pass on foundation.html.
// 1. Update <title> and <meta description>.
// 2. Add hero proof list (3 bullets) + trust line below CTA.
// 3. Insert outcomes strip section between hero and Executive Answer.
// 4. Update Executive Answer H2 + body paragraphs.
// 5. Insert "Common Data Problems We Find Before AI" section.
// FAQPage schema already matches the visible Q&A panel — no schema change.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

const file = 'foundation.html';
let html = fs.readFileSync(file, 'utf8');

// =========================================================================
// 1. Metadata
// =========================================================================
html = html.replace(
  '<title>Data Curation &amp; Governance &mdash; Foundation AI Advisory</title>',
  '<title>Data Curation &amp; Governance for AI Readiness | Foundation AI Advisory</title>'
);
html = html.replace(
  '<meta name="description" content="Data Curation &amp; Governance for the mid-market: one source of record per critical dataset, defined ownership, lineage into reports and AI outputs." />',
  '<meta name="description" content="Foundation AI Advisory helps mid-market operators clean, structure, govern, and control business data before applying AI to workflows, reporting, and decision-making." />'
);
html = html.replace(
  '<meta property="og:title" content="Data Curation &amp; Governance &mdash; Foundation AI Advisory" />',
  '<meta property="og:title" content="Data Curation &amp; Governance for AI Readiness | Foundation AI Advisory" />'
);
html = html.replace(
  '<meta property="og:description" content="Data Curation &amp; Governance for the mid-market: one source of record per critical dataset, defined ownership, lineage into reports and AI outputs." />',
  '<meta property="og:description" content="Foundation AI Advisory helps mid-market operators clean, structure, govern, and control business data before applying AI to workflows, reporting, and decision-making." />'
);

// =========================================================================
// 2. Hero — add proof list + trust line below CTA. Keep eyebrow / h1 / dek
//    paragraphs / primary CTA exactly as they are (they're already strong).
// =========================================================================
const oldHeroCta = `      <div class="mt-8">
        <a href="mailto:blueprint@foundationaiadvisory.com?subject=Business%20Systems%20Assessment%20Inquiry" class="btn btn-primary">Start with a Business Systems Assessment</a>
      </div>
    </div>
  </div>
</section>`;

const newHeroCta = `      <ul class="hero-proof-list">
        <li>Unify conflicting ERP, CRM, finance, spreadsheet, and field-system data</li>
        <li>Define ownership, data lineage, access controls, and decision rights</li>
        <li>Prepare operational data for workflow automation and AI implementation</li>
      </ul>
      <div class="mt-8">
        <a href="mailto:blueprint@foundationaiadvisory.com?subject=Business%20Systems%20Assessment%20Inquiry" class="btn btn-primary">Start with a Business Systems Assessment</a>
      </div>
      <p class="hero-trust-line">FAA fixes the business foundation first, then applies AI where it can produce measurable operating results.</p>
    </div>
  </div>
</section>`;

if (!html.includes(oldHeroCta)) throw new Error('hero CTA block not found verbatim');
html = html.replace(oldHeroCta, newHeroCta);

// =========================================================================
// 3. Outcomes strip — sits between hero and Executive Answer section.
// =========================================================================
const outcomesStrip = `

<!-- ============================================================= -->
<!-- BUSINESS OUTCOMES STRIP                                       -->
<!-- ============================================================= -->
<section class="outcomes-strip" aria-label="Business outcomes improved by governed data">
  <div class="container-faa">
    <div class="outcomes-strip-inner">
      <div class="outcomes-strip-label">Business outcomes improved by governed data</div>
      <ul class="outcomes-strip-list">
        <li>Faster reporting cycles</li>
        <li>Lower reconciliation effort</li>
        <li>Cleaner handoffs</li>
        <li>Better workflow automation</li>
        <li>Reduced operating risk</li>
        <li>More reliable AI outputs</li>
      </ul>
    </div>
  </div>
</section>
`;

const execAnchor = '<!-- ============================================================= -->\n<!-- EXECUTIVE ANSWER (AEO)                                        -->';
if (!html.includes(execAnchor)) throw new Error('Executive Answer anchor not found');
html = html.replace(execAnchor, outcomesStrip + '\n' + execAnchor);

// =========================================================================
// 4. Executive Answer — update H2 + tighten body copy per the spec.
// =========================================================================
html = html.replace(
  '<h2 class="h2 mt-3">Data Curation &amp; Governance Makes AI Trustworthy</h2>',
  '<h2 class="h2 mt-3">Data Curation &amp; Governance Turns Scattered Business Data Into a Trusted Operating System</h2>'
);

const oldP1 = '          Before AI can improve a business, the business has to know which data it trusts, who owns it, how it is defined, and where it breaks. Data Curation &amp; Governance is the work of turning scattered operational data into a structured, governed, and usable foundation for decision-making, reporting, workflow automation, and AI.';
const newP1 = '          Before AI can improve the business, leaders need to know which data they trust, who owns it, how it is defined, where it comes from, and where it breaks. Data Curation &amp; Governance turns scattered operational data into a structured, governed, and usable foundation for reporting, workflow automation, and AI.';
if (!html.includes(oldP1)) throw new Error('Exec Answer P1 not found');
html = html.replace(oldP1, newP1);

const oldP2 = '          For mid-market operators, the problem is rarely a total lack of data. The problem is that ERP data, finance reports, spreadsheets, field systems, CRM records, and operational workarounds often tell different versions of the truth. AI will not resolve those conflicts on its own. It will inherit them, accelerate them, and make them harder to trace.';
const newP2 = '          For mid-market operators, the problem is rarely a total lack of data. The problem is that ERP data, finance reports, spreadsheets, field systems, CRM records, and manual workarounds often tell different versions of the truth. That creates rework, slow reporting cycles, weak handoffs, unclear accountability, and decision risk.';
if (!html.includes(oldP2)) throw new Error('Exec Answer P2 not found');
html = html.replace(oldP2, newP2);

const oldP3 = '          FAA starts here because trustworthy AI depends on trustworthy inputs. Clean data alone is not enough. The data must be governed, defined, accessible, and tied to clear business ownership.';
const newP3 = '          FAA starts here because AI will not resolve those conflicts on its own. It will inherit the definitions, gaps, exceptions, and ownership issues already inside the business. Our work is to identify the trusted sources, clean the operating data, define ownership, map lineage, and establish controls before AI is designed or implemented.';
if (!html.includes(oldP3)) throw new Error('Exec Answer P3 not found');
html = html.replace(oldP3, newP3);

// =========================================================================
// 5. Common Data Problems — new section after Executive Answer, before
//    the existing "1. THE PROBLEM" section.
// =========================================================================
const commonDataProblems = `

<!-- ============================================================= -->
<!-- COMMON DATA PROBLEMS                                          -->
<!-- ============================================================= -->
<section class="bg-white border-t" style="border-color: var(--faa-gray-100);">
  <div class="container-faa section-y">
    <div class="max-w-3xl mb-12 lg:mb-14">
      <div class="eyebrow" style="color: var(--faa-navy);">Pre-AI Diagnostics</div>
      <h2 class="h2 mt-3">Common Data Problems We Find Before AI</h2>
      <p class="body-lg mt-5" style="color: var(--faa-gray-600);">
        FAA&rsquo;s Business Systems Assessment surfaces these patterns in nearly every mid-market environment. Each one quietly amplifies under automation and AI.
      </p>
    </div>
    <div class="data-problems-grid">
      <div class="data-problem-card">
        <h3 class="data-problem-card__title">Conflicting definitions</h3>
        <p class="data-problem-card__dek">Revenue, margin, customer, project, order, inventory, and utilization are defined differently across teams.</p>
      </div>
      <div class="data-problem-card">
        <h3 class="data-problem-card__title">Spreadsheet infrastructure</h3>
        <p class="data-problem-card__dek">Critical business logic lives in offline files, personal workbooks, or manual reporting routines.</p>
      </div>
      <div class="data-problem-card">
        <h3 class="data-problem-card__title">Unclear ownership</h3>
        <p class="data-problem-card__dek">No one owns the definition, quality, access, or correction process for critical operating data.</p>
      </div>
      <div class="data-problem-card">
        <h3 class="data-problem-card__title">Disconnected systems</h3>
        <p class="data-problem-card__dek">ERP, CRM, finance, field, and project systems do not share a clean operating model.</p>
      </div>
      <div class="data-problem-card">
        <h3 class="data-problem-card__title">Weak lineage</h3>
        <p class="data-problem-card__dek">Leaders cannot trace where numbers came from, what changed, or why reports disagree.</p>
      </div>
      <div class="data-problem-card">
        <h3 class="data-problem-card__title">AI readiness gaps</h3>
        <p class="data-problem-card__dek">Data is available, but not structured, governed, or reliable enough for AI-supported workflows.</p>
      </div>
    </div>
  </div>
</section>
`;

const problemAnchor = '<!-- ============================================================= -->\n<!-- 1. THE PROBLEM                                                -->';
if (!html.includes(problemAnchor)) throw new Error('THE PROBLEM anchor not found');
html = html.replace(problemAnchor, commonDataProblems + '\n' + problemAnchor);

fs.writeFileSync(file, html);
console.log('  foundation.html: density pass applied');
console.log('    metadata updated, hero proof list + trust line added');
console.log('    outcomes strip section inserted');
console.log('    Executive Answer H2 + 3 body paragraphs revised');
console.log('    Common Data Problems section inserted (6 cards)');
