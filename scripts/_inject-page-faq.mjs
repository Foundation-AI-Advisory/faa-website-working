// One-shot: inject visible FAQ block + FAQPage JSON-LD into pillar &
// engagement pages. The visible Q&A wraps in a <section> styled with the
// existing site tokens, placed immediately before each page's final
// subscribe section (gray-50 background) so it reads as a content section,
// not a sidebar. Schema text matches visible text exactly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

const SITE = 'https://foundationaiadvisory.com';

const pages = [
  {
    file: 'foundation.html',
    heading: 'Data Curation &amp; Governance &mdash; Common Questions',
    qa: [
      {
        q: 'What is data curation and governance?',
        a: 'Data curation is the work of cleaning, structuring, and aligning the datasets that drive critical business decisions. Governance is the operating discipline that controls who owns those datasets, how changes are made, and how lineage flows into reports and AI outputs. Together they create the conditions under which AI can be trusted.',
      },
      {
        q: 'How does FAA approach data governance for mid-market companies?',
        a: 'Mid-market companies rarely have a chief data officer or an enterprise data office. FAA installs a lightweight model: one source of record per critical dataset, a named owner for each, simple input rules that survive daily operations, and a review cadence that fits inside the team that already does the work.',
      },
      {
        q: 'Why does FAA address data before applying AI?',
        a: 'AI inherits the contradictions in its inputs. Curating and governing the data first means the AI outputs downstream are usable, comparable, and accountable to the same numbers the business already trusts. Skipping this step does not save time; it relocates the failure to the AI layer.',
      },
    ],
  },
  {
    file: 'operations.html',
    heading: 'Workflow Optimization &mdash; Common Questions',
    qa: [
      {
        q: 'What is workflow optimization?',
        a: 'Workflow optimization is making the way work actually gets done observable, repeatable, and controllable &mdash; defining decision points, categorizing exceptions, and clarifying handoffs before automation or AI is layered on top.',
      },
      {
        q: 'How does FAA optimize workflows before applying AI?',
        a: 'FAA maps how work runs in practice, not how it is documented. We identify where exceptions multiply and ownership is ambiguous, then align the workflow before any automation. Once the workflow holds under exception load, AI extends it instead of amplifying its weaknesses.',
      },
      {
        q: 'Why fix the workflow before applying AI?',
        a: 'AI cannot navigate undefined behavior. Automation built on tribal knowledge, manual overrides, and unclear approval paths runs faster but also fails faster. A clean workflow makes AI a force multiplier; a broken one turns it into a risk multiplier.',
      },
    ],
  },
  {
    file: 'agentic-ai.html',
    heading: 'AI Design &amp; Implementation &mdash; Common Questions',
    qa: [
      {
        q: 'What is AI design and implementation?',
        a: 'AI design is choosing where AI fits inside the operating model, what decision it touches, which outputs are allowed, and where humans review them. Implementation is building that AI into a workflow with monitoring, controls, and a metric the business already tracks.',
      },
      {
        q: 'How does FAA design AI for measurable business outcomes?',
        a: 'Every AI use case FAA recommends is tied to one of six outcomes: margin, throughput, cycle time, cash flow, risk exposure, or operational visibility. The use case must have a clear owner, defined inputs, controlled outputs, and a path to production &mdash; not a pilot that ends in a slide deck.',
      },
      {
        q: 'How does FAA approach AI implementation?',
        a: 'FAA implements AI inside the existing operating environment, on top of curated data and aligned workflows, with human oversight at decision points that affect financial or operational risk. The goal is AI that behaves like infrastructure &mdash; quiet, dependable, and tied to what the business already measures.',
      },
    ],
  },
  // Engagement pages — single Q&A each
  {
    file: 'business-systems-assessment.html',
    heading: 'Business Systems Assessment &mdash; Common Question',
    qa: [
      {
        q: 'What is a Business Systems Assessment?',
        a: 'A Business Systems Assessment is FAA&rsquo;s focused review of how a mid-market company actually operates across data, workflows, systems, decisions, and accountability. It identifies where the business is breaking, evaluates data quality and workflow reliability, clarifies ownership and decision rights, and defines a prioritized execution path. It is the entry point to working with FAA, not a generic AI readiness scorecard.',
      },
    ],
  },
  {
    file: '90-day-ai-execution-sprint.html',
    heading: '90-Day AI Execution Sprint &mdash; Common Question',
    qa: [
      {
        q: 'What is the 90-Day AI Execution Sprint?',
        a: 'The 90-Day AI Execution Sprint is a focused engagement to redesign one high-value workflow, align the data behind it, and apply AI where it improves performance. The deliverable is a working AI capability tied to a measurable business outcome &mdash; not a pilot, not a slide deck, and not a tool installation. The Sprint follows the Business Systems Assessment.',
      },
    ],
  },
  {
    file: 'ongoing-execution-expansion.html',
    heading: 'Ongoing Execution &amp; Expansion &mdash; Common Question',
    qa: [
      {
        q: 'What is Ongoing Execution and Expansion?',
        a: 'Ongoing Execution and Expansion is the sustained advisory and build cadence after the first 90-Day AI Execution Sprint. FAA continues to expand AI across additional workflows, maintain governance, refine data foundations, and tie each new use case to a measurable business outcome. The goal is AI that compounds returns over time, not a one-time deployment.',
      },
    ],
  },
];

function escapeForHtml(s) {
  // Already-escaped entities (&mdash;, &rsquo;, &amp;) come in as-is. Don't double-escape.
  return s;
}

function decodeEntities(s) {
  // For schema.org text we want plain text — convert entities to their unicode equivalents.
  return s
    .replace(/&mdash;/g, '—')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&amp;/g, '&');
}

function buildVisibleSection(p) {
  const items = p.qa.map(({ q, a }) => `        <div class="page-faq-item">
          <dt>${q}</dt>
          <dd>${a}</dd>
        </div>`).join('\n');
  return `
<!-- ============================================================= -->
<!-- COMMON QUESTIONS                                              -->
<!-- ============================================================= -->
<section class="bg-white border-t" style="border-color: var(--faa-gray-100);">
  <div class="container-faa section-y">
    <div class="max-w-3xl">
      <div class="eyebrow" style="color: var(--faa-navy);">Common Questions</div>
      <h2 class="h2 mt-3">${p.heading}</h2>
      <dl class="page-faq">
${items}
      </dl>
    </div>
  </div>
</section>
`;
}

function buildSchema(p, file) {
  const url = SITE + '/' + file;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: p.qa.map(({ q, a }) => ({
      '@type': 'Question',
      name: decodeEntities(q),
      acceptedAnswer: { '@type': 'Answer', text: decodeEntities(a) },
    })),
  };
}

function alreadyHasFAQ(html) {
  return html.includes('<dl class="page-faq">');
}

let touched = 0;
for (const p of pages) {
  if (!fs.existsSync(p.file)) { console.log('  SKIP missing:', p.file); continue; }
  let html = fs.readFileSync(p.file, 'utf8');
  if (alreadyHasFAQ(html)) { console.log('  already has FAQ:', p.file); continue; }

  // Find the final gray-50 subscribe section and insert the FAQ <section>
  // immediately before it. If no gray-50 subscribe section, fall back to
  // inserting before </main>.
  const visible = buildVisibleSection(p);
  const subscribeAnchor = '<section style="background: var(--faa-gray-50);">';
  const mainCloseAnchor = '</main>';

  if (html.includes(subscribeAnchor)) {
    // Insert before the LAST occurrence (subscribe is always the last gray-50 section).
    const lastIdx = html.lastIndexOf(subscribeAnchor);
    html = html.slice(0, lastIdx) + visible + '\n' + html.slice(lastIdx);
  } else {
    html = html.replace(mainCloseAnchor, visible + '\n' + mainCloseAnchor);
  }

  // Inject the FAQPage JSON-LD before </head>.
  const schema = buildSchema(p, p.file);
  const schemaTag = '<script type="application/ld+json">' + JSON.stringify(schema) + '</script>';
  html = html.replace('</head>', schemaTag + '\n</head>');

  fs.writeFileSync(p.file, html);
  console.log('  injected FAQ + schema:', p.file);
  touched++;
}
console.log('Touched', touched, 'pages.');
