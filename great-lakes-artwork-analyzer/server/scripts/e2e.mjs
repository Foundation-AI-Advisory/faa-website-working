/**
 * End-to-end walkthrough of Susan's workflow against a running server.
 *
 * Drives the real UI in Chromium: upload → analyze → confirm → prepress review →
 * send for approval → customer decision → revision, capturing screenshots and
 * failing on any console error.
 *
 *   node server/scripts/e2e.mjs <pdf-path> [baseUrl] [shotDir]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const PDF = process.argv[2];
const BASE = process.argv[3] ?? 'http://localhost:4180';
const SHOTS = process.argv[4] ?? '/tmp/gll-shots';

if (!PDF || !fs.existsSync(PDF)) {
  console.error('Usage: node e2e.mjs <pdf-path> [baseUrl] [shotDir]');
  process.exit(2);
}
fs.mkdirSync(SHOTS, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const failures = [];
let step = 0;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(e.message));

const shot = async (name) => {
  step += 1;
  await page.screenshot({ path: `${SHOTS}/${String(step).padStart(2, '0')}-${name}.png`, fullPage: false });
};

const check = (label, ok, extra = '') => {
  console.log(`${ok ? '  OK  ' : '  FAIL'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures.push(label);
};

/* 1. Dashboard --------------------------------------------------- */
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.stat-value');
check('Dashboard renders stat cards', (await page.locator('.stat').count()) >= 5);
check('Great Lakes Label wordmark present', await page.locator('.wordmark-text').first().isVisible());
await shot('dashboard');

/* 2. Upload ------------------------------------------------------ */
await page.getByRole('button', { name: 'Analyze New Artwork' }).click();
await page.waitForSelector('.dropzone');
await shot('new-analysis');
await page.locator('input[type=file]').setInputFiles(PDF);
await page.locator('#customer').fill('Ecolab USA Inc.');
await page.locator('#title').fill('Acid Toilet Bowl Cleaner 946 mL');
await shot('upload-ready');
await page.getByRole('button', { name: 'Analyze New Artwork' }).nth(1).click();

/* 3. Progress screen --------------------------------------------- */
await page.waitForSelector('.stage-list', { timeout: 15000 });
check('Analysis progress screen shows stages', (await page.locator('.stage-list li').count()) >= 1);
await shot('analyzing');

/* 4. Workspace --------------------------------------------------- */
await page.waitForURL(/\/workspace\//, { timeout: 90000 });
await page.waitForSelector('.page-stack canvas', { timeout: 40000 });
await page.waitForTimeout(2500);
const versionId = page.url().split('/workspace/')[1];
check('Landed in the analysis workspace', Boolean(versionId));
check('PDF viewer rendered a canvas', await page.locator('.page-stack canvas').first().isVisible());
await shot('workspace-summary');

const text = async () => (await page.locator('.tab-body').innerText()).replace(/\s+/g, ' ');
let body = await text();
for (const [label, needle] of [
  ['Product number 10-9819356', '10-9819356'],
  ['Revision A', 'Revision A'],
  ['Proof date 12/30/25', '12/30/25'],
  ['Initials SO', 'SO'],
  ['Finished size 10" × 4.5"', '10" × 4.5"'],
  ['Printing method Digital', 'Digital'],
  ['Surface printing', 'Surface printing'],
  ['Rewind #3', 'Rewind #3'],
]) {
  check(`Summary shows ${label}`, body.includes(needle));
}

/* 5. Colors tab -------------------------------------------------- */
await page.getByRole('button', { name: 'Colors & Separations' }).click();
await page.waitForTimeout(400);
body = await text();
for (const needle of ['Cyan', 'Magenta', 'Yellow', 'Black', 'PANTONE 214 C', 'PANTONE 285 C', 'PANTONE 185 C', 'Dieline']) {
  check(`Colors tab lists ${needle}`, body.includes(needle));
}
check('PMS classified as digital match targets, not press stations', body.includes('Digital match-color target'));
check('No spot ink plates claimed', /Spot ink plates None/.test(body));
check('Sign Off classified as proof annotation', /Sign Off/.test(body) && /proof annotation/i.test(body));
check('DIMENSION classified as annotation', /DIMENSION/.test(body));
check('Generated-preview disclaimer shown', body.includes('generated preview'));
await shot('workspace-colors');

/* 6. Separation isolation ---------------------------------------- */
const legendButtons = page.locator('.legend .legend-item');
check('Separation legend rendered', (await legendButtons.count()) >= 8, `${await legendButtons.count()} items`);
await page.locator('.legend .legend-item').filter({ hasText: 'PANTONE 214 C' }).locator('button').nth(1).click();
await page.waitForTimeout(900);
check('Isolate control engaged', (await page.locator('.page-stack img.overlay').count()) === 1);
await shot('separation-isolated');
await page.locator('.viewer-toolbar').getByText('Clear isolate').click();
await page.waitForTimeout(300);

/* 7. Production-art-only view ------------------------------------ */
const options = await page.locator('.viewer-toolbar select').first().locator('option').allTextContents();
check('Production art only view offered', options.some((o) => /Production art only/i.test(o)));
check('Layer isolate views offered', options.some((o) => /Sign Off/i.test(o)));
await page.locator('.viewer-toolbar select').first().selectOption({ label: 'Production art only' });
await page.waitForTimeout(1200);
await shot('production-only-view');
await page.locator('.viewer-toolbar select').first().selectOption({ index: 0 });

/* 8. Materials --------------------------------------------------- */
await page.getByRole('button', { name: 'Materials & Finishes' }).click();
await page.waitForTimeout(400);
body = await text();
check('Substrate colour White detected', body.includes('White'));
check('Substrate material flagged as not specified', /Substrate material Not specified/.test(body));
check('Adhesive flagged', /Adhesive Not specified/.test(body));
check('Varnish flagged, not inferred from template wording', /Varnish Not specified/.test(body));
check('Varnish coverage flagged', /Varnish coverage Not specified/.test(body));
await shot('workspace-materials');

/* 9. Dimensions -------------------------------------------------- */
await page.getByRole('button', { name: 'Dimensions & Construction' }).click();
await page.waitForTimeout(400);
body = await text();
check('Corner radius 0.125"', body.includes('0.125"'));
check('Proof page vs finished size distinguished', /proof sheet/i.test(body));
check('Eyemark values captured', /Eyemark size/i.test(body));
await shot('workspace-dimensions');

/* 10. Preflight -------------------------------------------------- */
await page.getByRole('button', { name: 'Preflight' }).click();
await page.waitForTimeout(400);
body = await text();
check('Preflight severity summary present', /blocking/i.test(body) && /warning/i.test(body));
check('Not-production-ready wording present', /requires a prepress user to confirm|not production ready/i.test(body));
await shot('workspace-preflight');

/* 11. Raw file data ---------------------------------------------- */
await page.getByRole('button', { name: 'Raw File Data' }).click();
await page.waitForTimeout(400);
body = await text();
check('Illustrator origin reported', /Adobe Illustrator/.test(body));
check('Fonts reported embedded', /Yes/.test(body) && /AcuminProCond/.test(body));
check('No optional content layers reported', /separation previews are generated/i.test(body));
await shot('workspace-raw');

/* 12. Confirm a value -------------------------------------------- */
await page.getByRole('button', { name: 'Summary' }).click();
await page.waitForTimeout(400);
await page.locator('.kv dd').filter({ hasText: 'Ecolab' }).getByRole('button', { name: 'Confirm' }).first().click();
await page.waitForTimeout(900);
check('Value confirmation recorded', (await page.locator('.badge-ok').filter({ hasText: 'Confirmed' }).count()) >= 1);
await shot('value-confirmed');

/* 13. Prepress review + send ------------------------------------- */
await page.getByRole('button', { name: 'Approval', exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Mark Prepress Reviewed' }).click();
await page.waitForTimeout(1200);
body = await text();
check('Prepress review recorded', /Prepress reviewed/i.test(body));
await shot('prepress-reviewed');

await page.getByRole('button', { name: 'Send for Customer Approval' }).click();
await page.waitForSelector('.modal');
await page.locator('#recipient').fill('purchasing@ecolab.example');
await page.locator('#msg').fill('Please review and approve this label proof.');
await shot('send-for-review-modal');
await page.locator('.modal').getByRole('button', { name: 'Send', exact: true }).click();
await page.waitForTimeout(1400);
body = await text();
check('Status moved to Sent for Customer Review', /Sent for Customer Review/.test(body));
check('Notification history recorded', /purchasing@ecolab.example/.test(body));
await shot('sent-for-review');

/* 14. Customer requests changes ---------------------------------- */
await page.getByRole('button', { name: 'Request changes' }).first().click();
await page.waitForSelector('.modal');
await page.locator('#sig').fill('J. Rivera');
await page.locator('#dcom').fill('Please enlarge the net contents statement to 10 pt.');
await page.locator('.modal').getByRole('button', { name: 'Request changes' }).click();
await page.waitForTimeout(1400);
body = await text();
check('Changes requested recorded', /Changes Requested/i.test(body));
check('Customer comment captured', /enlarge the net contents/i.test(body));
await shot('changes-requested');

/* 15. Revision preserves history --------------------------------- */
await page.getByRole('button', { name: 'Upload Revision' }).click();
await page.waitForSelector('.modal .dropzone');
await page.locator('.modal input[type=file]').setInputFiles(PDF);
await page.locator('.modal').getByRole('button', { name: 'Upload revision' }).click();
await page.waitForURL((u) => u.pathname.startsWith('/workspace/') && !u.pathname.endsWith(versionId), {
  timeout: 90000,
});
await page.waitForSelector('.page-stack canvas', { timeout: 40000 });
await page.waitForTimeout(2000);
const v2 = page.url().split('/workspace/')[1];
check('Revision created a new version', v2 !== versionId);
await page.getByRole('button', { name: 'Approval', exact: true }).click();
await page.waitForTimeout(600);
body = await text();
check('Version history keeps version 1', /1 Initial/.test(body) || /Superseded/.test(body));
check('Version 2 present', /2 Revision 2/.test(body));
await shot('revision-history');

/* 16. Approve the revision --------------------------------------- */
await page.getByRole('button', { name: 'Mark Prepress Reviewed' }).click();
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Send for Customer Approval' }).click();
await page.waitForSelector('.modal');
await page.locator('#recipient').fill('purchasing@ecolab.example');
await page.locator('.modal').getByRole('button', { name: 'Send', exact: true }).click();
await page.waitForTimeout(1400);
await page.getByRole('button', { name: 'Approve artwork' }).first().click();
await page.waitForSelector('.modal');
await page.locator('#sig').fill('J. Rivera');
await page.locator('#sigmail').fill('j.rivera@ecolab.example');
await page.locator('.modal').getByRole('button', { name: 'Approve', exact: true }).click();
await page.waitForTimeout(1500);
body = await text();
check('Artwork approved', /Approved/.test(body));
check('Approval signature recorded', /J. Rivera/.test(body));
await shot('approved');

/* 17. Persistence after reload ----------------------------------- */
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.tabs');
await page.getByRole('button', { name: 'Approval', exact: true }).click();
await page.waitForTimeout(700);
body = await text();
check('State persists across a page reload', /Approved/.test(body) && /J. Rivera/.test(body));

/* 18. Other screens ---------------------------------------------- */
await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle' });
await page.waitForSelector('table');
check('Artwork Jobs list renders', (await page.locator('tbody tr').count()) >= 1);
await shot('jobs-list');

await page.goto(`${BASE}/approved`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
check('Approved Artwork queue populated', (await page.locator('tbody tr').count()) >= 1);
await shot('approved-queue');

await page.goto(`${BASE}/queue`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await shot('approval-queue');

await page.goto(`${BASE}/review`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await shot('needs-review');

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
check('Dashboard reflects the approval', (await page.locator('.stat-value').nth(4).innerText()) !== '0');
await shot('dashboard-after');

/* 19. Exports ---------------------------------------------------- */
for (const [label, path] of [
  ['JSON export', `/api/versions/${v2}/export.json`],
  ['CSV export', `/api/versions/${v2}/export.csv`],
  ['HTML report', `/api/versions/${v2}/report.html`],
]) {
  const res = await ctx.request.get(`${BASE}${path}`);
  const bodyText = await res.text();
  check(`${label} downloads`, res.ok() && bodyText.length > 500, `${res.status()} ${bodyText.length} bytes`);
}

/* ---------------------------------------------------------------- */
check('No uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
check('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | '));

await browser.close();

console.log(`\nScreenshots: ${SHOTS}`);
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed:\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('\nAll end-to-end checks passed.');
