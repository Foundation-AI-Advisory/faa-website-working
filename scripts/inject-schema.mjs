// One-shot schema injector for E2 (Article), E3 (BreadcrumbList), E8 (Person).
// Idempotent: skips files that already have the relevant @type.
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://foundationaiadvisory.com';
const ORG_REF = { '@type': 'Organization', name: 'Foundation AI Advisory', url: SITE + '/' };
const ORG_FULL = {
  '@type': 'Organization',
  name: 'Foundation AI Advisory',
  url: SITE + '/',
  logo: SITE + '/assets/global-header-logo-wordmark.png',
};

function injectBeforeHeadClose(file, blocks) {
  let s = fs.readFileSync(file, 'utf8');
  const inject = blocks.map(b => '<script type="application/ld+json">' + JSON.stringify(b) + '</script>').join('\n');
  s = s.replace('</head>', inject + '\n</head>');
  fs.writeFileSync(file, s);
}

function hasType(file, type) {
  // True if a JSON-LD block declares this @type at its ROOT.
  // Pattern: <script>{"@context":"...","@type":"<type>" ...
  const s = fs.readFileSync(file, 'utf8');
  const needle = `"@context":"https://schema.org","@type":"${type}"`;
  return s.includes(needle);
}

// =========================================================================
// E8: Person schema on about.html
// =========================================================================
const personSchemas = [
  {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Ben DeMichael',
    jobTitle: 'Founder & Managing Partner',
    description: 'Founder and Managing Partner of Foundation AI Advisory. Operating-perspective adviser to mid-market companies on data governance, workflow optimization, and AI design and implementation. Background spans consulting and strategy, finance and accounting, IT and data systems, operations and supply chain, ERP environments, HR, and sales.',
    image: SITE + '/assets/about-leadership-ben-demichael-headshot.webp',
    url: 'https://www.linkedin.com/in/benjamindemichael',
    sameAs: ['https://www.linkedin.com/in/benjamindemichael'],
    worksFor: ORG_REF,
    knowsAbout: [
      'Mid-Market AI Strategy',
      'Data Curation and Governance',
      'Workflow Optimization',
      'AI Design and Implementation',
      'ERP Systems',
      'Operations and Supply Chain',
      'Finance and Accounting Systems',
      'Platform-Agnostic AI Architecture',
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Jason Kapcar',
    jobTitle: 'Partner & Chief AI Officer',
    description: 'Partner and Chief AI Officer at Foundation AI Advisory. Leads FAA\'s AI governance and controls practice for mid-market operators across industrial and operations-heavy sectors. Applies risk and controls frameworks from regulated environments to every AI deployment — clear ownership, defined exception paths, audit-ready controls, and human-in-the-loop where decisions carry financial or operational impact.',
    image: SITE + '/assets/about-leadership-jason-kapcar-headshot.png',
    url: 'https://www.linkedin.com/in/jasonkapcar',
    sameAs: ['https://www.linkedin.com/in/jasonkapcar'],
    worksFor: ORG_REF,
    knowsAbout: [
      'AI Governance',
      'AI Controls and Risk Frameworks',
      'AI Design and Implementation',
      'Regulated Industry Compliance',
      'Human-in-the-Loop AI Systems',
      'Mid-Market AI Strategy',
    ],
  },
];
if (!hasType('about.html', 'Person')) {
  injectBeforeHeadClose('about.html', personSchemas);
  console.log('  E8: about.html — added 2 Person schemas');
} else {
  console.log('  E8: about.html — Person already present, skipping');
}

// =========================================================================
// E3: BreadcrumbList per page
// =========================================================================
const HOME = { name: 'Home', url: SITE + '/' };
const INSIGHTS_HUB = { name: 'Insights', url: SITE + '/insights.html' };
const INDUSTRIES_HUB = { name: 'Where We Work', url: SITE + '/industries.html' };

const breadcrumbs = {
  'about.html': [HOME, { name: 'About', url: SITE + '/about.html' }],
  'contact.html': [HOME, { name: 'Contact', url: SITE + '/contact.html' }],
  'insights.html': [HOME, { name: 'Insights', url: SITE + '/insights.html' }],
  'industries.html': [HOME, { name: 'Where We Work', url: SITE + '/industries.html' }],

  'foundation.html': [HOME, { name: 'Data Curation & Governance', url: SITE + '/foundation.html' }],
  'operations.html': [HOME, { name: 'Workflow Optimization', url: SITE + '/operations.html' }],
  'agentic-ai.html': [HOME, { name: 'AI Design & Implementation', url: SITE + '/agentic-ai.html' }],

  'business-systems-assessment.html': [HOME, { name: 'Business Systems Assessment', url: SITE + '/business-systems-assessment.html' }],
  '90-day-ai-execution-sprint.html': [HOME, { name: '90-Day AI Execution Sprint', url: SITE + '/90-day-ai-execution-sprint.html' }],
  'ongoing-execution-expansion.html': [HOME, { name: 'Ongoing Execution & Expansion', url: SITE + '/ongoing-execution-expansion.html' }],

  'industry-manufacturing-industrial-production.html': [HOME, INDUSTRIES_HUB, { name: 'Manufacturing & Industrial Production', url: SITE + '/industry-manufacturing-industrial-production.html' }],
  'industry-engineering-construction-infrastructure.html': [HOME, INDUSTRIES_HUB, { name: 'Engineering, Construction & Infrastructure (ECI)', url: SITE + '/industry-engineering-construction-infrastructure.html' }],
  'industry-transportation-logistics.html': [HOME, INDUSTRIES_HUB, { name: 'Transportation & Logistics', url: SITE + '/industry-transportation-logistics.html' }],
  'industry-energy-natural-resources.html': [HOME, INDUSTRIES_HUB, { name: 'Energy & Natural Resources', url: SITE + '/industry-energy-natural-resources.html' }],
  'industry-distribution-wholesale.html': [HOME, INDUSTRIES_HUB, { name: 'Distribution & Wholesale', url: SITE + '/industry-distribution-wholesale.html' }],
  'industry-industrial-equipment.html': [HOME, INDUSTRIES_HUB, { name: 'Industrial Equipment', url: SITE + '/industry-industrial-equipment.html' }],
  'industry-specialty-manufacturing.html': [HOME, INDUSTRIES_HUB, { name: 'Specialty Manufacturing', url: SITE + '/industry-specialty-manufacturing.html' }],
  'industry-professional-technical-services.html': [HOME, INDUSTRIES_HUB, { name: 'Professional & Technical Services', url: SITE + '/industry-professional-technical-services.html' }],
  'industry-financial-services-banking.html': [HOME, INDUSTRIES_HUB, { name: 'Financial Services & Banking', url: SITE + '/industry-financial-services-banking.html' }],
  'industry-ai-data-it-systems.html': [HOME, INDUSTRIES_HUB, { name: 'AI, Data & IT Systems', url: SITE + '/industry-ai-data-it-systems.html' }],

  'insights-foundations-applied-ai-series.html': [HOME, INSIGHTS_HUB, { name: 'Foundations: A Five-Part Field Series', url: SITE + '/insights-foundations-applied-ai-series.html' }],
  'insights-foundations-data-constraint.html': [HOME, INSIGHTS_HUB, { name: 'Part 1: The Data Constraint', url: SITE + '/insights-foundations-data-constraint.html' }],
  'insights-foundations-process-before-ai.html': [HOME, INSIGHTS_HUB, { name: 'Part 2: Process Before AI', url: SITE + '/insights-foundations-process-before-ai.html' }],
  'insights-foundations-ai-architecture.html': [HOME, INSIGHTS_HUB, { name: 'Part 3: Architecture', url: SITE + '/insights-foundations-ai-architecture.html' }],
  'insights-foundations-ai-roi-sequencing.html': [HOME, INSIGHTS_HUB, { name: 'Part 4: ROI Sequencing', url: SITE + '/insights-foundations-ai-roi-sequencing.html' }],
  'insights-foundations-ai-governance.html': [HOME, INSIGHTS_HUB, { name: 'Part 5: AI Governance', url: SITE + '/insights-foundations-ai-governance.html' }],
  'insights-prompt-precision-context-engineering-operators.html': [HOME, INSIGHTS_HUB, { name: 'Prompt Precision and Context Engineering for Operators', url: SITE + '/insights-prompt-precision-context-engineering-operators.html' }],

  'insights/where-agents-earn-their-keep.html': [HOME, INSIGHTS_HUB, { name: 'Where Agents Earn Their Keep — and Where They Don’t', url: SITE + '/insights/where-agents-earn-their-keep.html' }],
  'insights/mid-market-case-for-platform-agnostic.html': [HOME, INSIGHTS_HUB, { name: 'The Mid-Market Case for Platform-Agnostic AI', url: SITE + '/insights/mid-market-case-for-platform-agnostic.html' }],
  'insights/data-governance-non-enterprise-teams.html': [HOME, INSIGHTS_HUB, { name: 'Data Governance for Non-Enterprise Teams', url: SITE + '/insights/data-governance-non-enterprise-teams.html' }],
  'insights/automating-a-broken-process-scales-the-problem.html': [HOME, INSIGHTS_HUB, { name: 'Automating a Broken Process Scales the Problem', url: SITE + '/insights/automating-a-broken-process-scales-the-problem.html' }],
  'insights/how-work-actually-gets-done-vs-how-its-documented.html': [HOME, INSIGHTS_HUB, { name: 'How Work Actually Gets Done vs. How It’s Documented', url: SITE + '/insights/how-work-actually-gets-done-vs-how-its-documented.html' }],
};

let bcCount = 0;
for (const [file, trail] of Object.entries(breadcrumbs)) {
  if (!fs.existsSync(file)) { console.log('  E3 SKIP missing:', file); continue; }
  if (hasType(file, 'BreadcrumbList')) continue;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: t.url,
    })),
  };
  injectBeforeHeadClose(file, [schema]);
  bcCount++;
}
console.log('  E3: BreadcrumbList added to', bcCount, 'pages');

// =========================================================================
// E2: Article schema on insight pages
// =========================================================================

// Map of file → article fields. Foundations Series sourced from foundations-series.js.
// Articles in /insights/ sourced from frontmatter in content/insights/*.md (read inline below).

function readFrontmatter(mdPath) {
  if (!fs.existsSync(mdPath)) return null;
  const md = fs.readFileSync(mdPath, 'utf8');
  const m = md.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) {
    const lm = line.match(/^([a-zA-Z]+):\s*"?(.*?)"?$/);
    if (lm) fm[lm[1]] = lm[2].replace(/^"/, '').replace(/"$/, '');
  }
  return fm;
}

const insightArticles = [
  // Dynamic /insights/ pages — sourced from markdown frontmatter
  { file: 'insights/where-agents-earn-their-keep.html', md: 'content/insights/where-agents-earn-their-keep.md', section: 'AI Design & Implementation', authorOverride: 'Ben DeMichael' },
  { file: 'insights/mid-market-case-for-platform-agnostic.html', md: 'content/insights/mid-market-case-for-platform-agnostic.md', section: 'AI Design & Implementation' },
  { file: 'insights/data-governance-non-enterprise-teams.html', md: 'content/insights/data-governance-non-enterprise-teams.md', section: 'Data Curation & Governance' },
  { file: 'insights/automating-a-broken-process-scales-the-problem.html', md: 'content/insights/automating-a-broken-process-scales-the-problem.md', section: 'Workflow Optimization' },
  { file: 'insights/how-work-actually-gets-done-vs-how-its-documented.html', md: 'content/insights/how-work-actually-gets-done-vs-how-its-documented.md', section: 'Workflow Optimization' },

  // Foundations Series
  { file: 'insights-foundations-data-constraint.html', headline: 'Part 1 — The Data Constraint', section: 'Data Curation & Governance', description: 'Why mid-market AI initiatives stall on data quality, ownership, and structure before any model is involved.', image: SITE + '/assets/insights/foundations-series-architecture-hero.webp' },
  { file: 'insights-foundations-process-before-ai.html', headline: 'Part 2 — Process Before AI', section: 'Workflow Optimization', description: 'Why workflow redesign has to come before automation, and what changes when it does.', image: SITE + '/assets/insights/foundations-series-architecture-hero.webp' },
  { file: 'insights-foundations-ai-architecture.html', headline: 'Part 3 — Architecture: The System Behind the System', section: 'AI Design & Implementation', description: 'The five operating layers behind reliable applied AI in mid-market environments.', image: SITE + '/assets/insights/foundations-series-architecture-hero.webp' },
  { file: 'insights-foundations-ai-roi-sequencing.html', headline: 'Part 4 — ROI Sequencing: Where AI Actually Creates Value', section: 'AI Design & Implementation', description: 'How to sequence AI investments around margin, throughput, cycle time, cash flow, risk, and operational visibility.', image: SITE + '/assets/insights/foundations-series-architecture-hero.webp' },
  { file: 'insights-foundations-ai-governance.html', headline: 'Part 5 — AI Governance That Actually Holds', section: 'AI Design & Implementation', description: 'Lightweight governance for mid-market AI: ownership, controls, escalation paths, and human oversight at the right points.', image: SITE + '/assets/insights/foundations-series-architecture-hero.webp' },

  // Standalone insight pages
  { file: 'insights-prompt-precision-context-engineering-operators.html', headline: 'Prompt Precision and Context Engineering for Operators', section: 'AI Design & Implementation', description: 'A working session on writing prompts that hold up under operational load.', image: SITE + '/assets/insights/prompt-precision-context-engineering-operators.webp', authorOverride: 'Ben DeMichael' },
];

let articleCount = 0;
for (const a of insightArticles) {
  if (!fs.existsSync(a.file)) { console.log('  E2 SKIP missing:', a.file); continue; }
  if (hasType(a.file, 'Article') || hasType(a.file, 'NewsArticle')) continue;

  let headline = a.headline;
  let description = a.description;
  let image = a.image;
  let author = a.authorOverride || 'Foundation AI Advisory';

  if (a.md) {
    const fm = readFrontmatter(a.md);
    if (fm) {
      headline = headline || fm.title;
      description = description || fm.metaDescription || fm.excerpt || fm.deck;
      if (fm.image) {
        // frontmatter image is "../assets/..." (relative to /insights/<slug>.html)
        image = image || (SITE + fm.image.replace(/^\.\.\//, '/'));
      }
      if (fm.author) author = a.authorOverride || fm.author;
    }
  }

  const url = SITE + '/' + a.file.replace(/\\/g, '/');
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    image,
    author: author === 'Foundation AI Advisory' ? ORG_FULL : { '@type': 'Person', name: author, worksFor: ORG_REF },
    publisher: ORG_FULL,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    articleSection: a.section,
    inLanguage: 'en',
  };
  injectBeforeHeadClose(a.file, [schema]);
  articleCount++;
}
console.log('  E2: Article schema added to', articleCount, 'pages');
