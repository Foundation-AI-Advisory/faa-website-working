// One-shot: add Thomas Wagenberg's profile to about.html, mirroring the
// existing Ben and Jason layout. Also injects a third Person JSON-LD
// schema after Jason's. Idempotent: skips if Thomas already present.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

const file = 'about.html';
let html = fs.readFileSync(file, 'utf8');

if (html.includes('Thomas Wagenberg')) {
  console.log('  about.html already includes Thomas Wagenberg — skipping');
  process.exit(0);
}

// =========================================================================
// 1. Visible profile block — mirrors Jason's row exactly.
// =========================================================================
const thomasRow = `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start" style="max-width: 1080px; margin-top: 64px;">
      <div class="lg:col-span-3">
        <div class="relative" style="width:100%; max-width:240px; aspect-ratio: 1/1; background: var(--faa-gray-100); border-radius: 4px; overflow: hidden;">
          <img src="assets/about-leadership-thomas-wagenberg-headshot.webp" alt="Thomas Wagenberg, Partner & Lead AI Business Analyst at Foundation AI Advisory" style="width:100%;height:100%;object-fit:cover;display:block;" />
        </div>
      </div>
      <div class="lg:col-span-9">
        <div class="kicker" style="color: var(--faa-blue);">PARTNER &amp; LEAD AI BUSINESS ANALYST</div>
        <div class="mt-2 flex items-center gap-3" style="color: var(--faa-navy); font-size: 26px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2;">
          <span>Thomas Wagenberg</span>
          <a href="https://www.linkedin.com/in/thomaswagenberg/" class="linkedin-link" target="_blank" rel="noopener noreferrer" aria-label="View Thomas Wagenberg on LinkedIn">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6.94 8.98H3.72v10.54h3.22V8.98zM5.33 7.52c1.03 0 1.86-.84 1.86-1.86S6.36 3.8 5.33 3.8s-1.86.84-1.86 1.86.83 1.86 1.86 1.86zM20.53 13.56c0-3.03-1.62-4.44-3.78-4.44-1.74 0-2.52.96-2.95 1.63V8.98h-3.08c.04.99 0 10.54 0 10.54h3.21v-5.89c0-.31.02-.63.12-.85.26-.63.86-1.28 1.86-1.28 1.31 0 1.84.99 1.84 2.45v5.57h3.22l.01-5.96z"/>
            </svg>
          </a>
        </div>
        <div class="italic mt-1" style="color: var(--faa-gray-400); font-size: 15px;">Partner &amp; Lead AI Business Analyst, Foundation AI Advisory</div>
        <blockquote class="mt-7 border-l-2 pl-6" style="border-color: var(--faa-blue); color: var(--faa-navy); font-size: clamp(20px, 2.2vw, 26px); font-weight: 500; line-height: 1.35; letter-spacing: -0.01em; max-width: 56ch;">
          &ldquo;AI only helps when the business can explain the work, the data, and the decision it wants to improve. The value is not in adding another tool. The value is in making the operating system clearer, faster, and easier to control.&rdquo;
        </blockquote>
        <p class="mt-6" style="color: var(--faa-gray-600); font-size: 16px; line-height: 1.65; max-width: 68ch;">
          Thomas supports FAA&rsquo;s work across finance, operations, workflow analysis, and AI readiness. He helps translate how work actually gets done into clear process maps, data requirements, decision points, and implementation priorities. His focus is on helping mid-market operators identify where manual effort, inconsistent data, unclear ownership, and disconnected systems create friction before AI is applied.
        </p>
        <p class="mt-5" style="color: var(--faa-gray-600); font-size: 16px; line-height: 1.65; max-width: 68ch;">
          Thomas brings a finance and operations lens to FAA&rsquo;s methodology, helping connect business problems to measurable outcomes such as margin, cycle time, cash flow, risk exposure, throughput, and operational visibility. His role supports the practical work required before AI can be responsibly designed, governed, and implemented.
        </p>
      </div>
    </div>`;

// Insert directly before the closing </div></section> of the leadership
// block. Anchor on the section's closing markup, scoped to the leadership
// section by anchoring on the next section's METHODOLOGY comment block.
const closingAnchor = '  </div>\n</section>\n\n<!-- ============================================================= -->\n<!-- METHODOLOGY                                                   -->';
if (!html.includes(closingAnchor)) {
  // Fall back to a more lenient match.
  console.log('  full closing anchor not found, trying lenient match');
}
const idx = html.indexOf(closingAnchor);
if (idx < 0) throw new Error('insert anchor not found');
html = html.slice(0, idx) + thomasRow + '\n' + html.slice(idx);

// =========================================================================
// 2. Person JSON-LD for Thomas — inserted after Jason's schema, before
//    the BreadcrumbList block (which currently sits at line 25 above
//    Ben's at 26 and Jason's at 27).
// =========================================================================
const SITE = 'https://foundationaiadvisory.com';
const ORG_REF = { '@type': 'Organization', name: 'Foundation AI Advisory', url: SITE + '/' };
const thomasSchema = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Thomas Wagenberg',
  jobTitle: 'Partner & Lead AI Business Analyst',
  description: "Partner & Lead AI Business Analyst at Foundation AI Advisory. Translates how work actually gets done into clear process maps, data requirements, decision points, and implementation priorities for mid-market operators. Brings a finance-and-operations lens to FAA's methodology, connecting business problems to measurable outcomes such as margin, cycle time, cash flow, risk exposure, throughput, and operational visibility.",
  image: SITE + '/assets/about-leadership-thomas-wagenberg-headshot.webp',
  url: 'https://www.linkedin.com/in/thomaswagenberg/',
  sameAs: ['https://www.linkedin.com/in/thomaswagenberg/'],
  worksFor: ORG_REF,
  knowsAbout: [
    'Mid-Market AI Strategy',
    'Workflow Optimization',
    'Process Mapping',
    'Data Requirements Analysis',
    'Finance and Operations Systems',
    'AI Readiness',
  ],
};
const thomasTag = '<script type="application/ld+json">' + JSON.stringify(thomasSchema) + '</script>';

// Insert immediately after Jason's Person schema line.
const jasonSchemaRe = /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"Person","name":"Jason Kapcar"[\s\S]*?<\/script>/;
const jasonMatch = html.match(jasonSchemaRe);
if (!jasonMatch) throw new Error('Jason Person schema not found');
html = html.replace(jasonMatch[0], jasonMatch[0] + '\n' + thomasTag);

fs.writeFileSync(file, html);
console.log('  about.html: Thomas Wagenberg profile + Person schema added');
