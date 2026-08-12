# Artwork Intelligence & Approval

An internal application for Great Lakes Label that analyses customer artwork proofs,
lets prepress correct and confirm the extracted production data, and carries the
artwork through customer approval without ever overwriting an earlier version.

Primary action: **Analyze New Artwork**.

---

## Running it

### Option 1 — Docker (recommended for a shared server)

```bash
docker compose up -d          # → http://localhost:4180
```

The named volume `gll-data` holds the database and every uploaded original, so
they survive restarts and rebuilds.

### Option 2 — Node directly (a laptop or workstation)

Requires Node.js 20 or newer (developed on 22).

```bash
npm install
npm start                     # → http://localhost:4180
```

To open it from a phone or tablet on the same network, use the machine's LAN
address instead of `localhost` — e.g. `http://192.168.1.42:4180`.

### Option 3 — Render (a URL reachable from anywhere)

`render.yaml` is included. Connect the repo in Render and it picks the config up.
Note the persistent disk in that file is required — Render's free tier has
ephemeral storage, so without a disk every redeploy starts from an empty system.

### Development

```bash
npm run dev                   # API on :4180, Vite client on :5180 with hot reload
npm test                      # 74 automated tests
```

Configuration: `PORT`, and `GLL_DATA_DIR` / `GLL_STORAGE_DIR` to relocate the
SQLite database and the stored originals (default `./data` and `./storage`).

Everything runs locally. No artwork is sent to any external service.

---

## The workflow

1. **New Analysis** → drag in a PDF proof.
2. A new artwork job and version 1 are created; the original is stored unchanged.
3. A progress screen lists the real analysis stages (about 4–6 seconds for a
   one-page proof).
4. The **Artwork Analysis Workspace** opens — proof viewer on the left, structured
   analysis on the right across seven tabs.
5. Every extracted value can be confirmed or corrected inline.
6. Separations can be overlaid on the proof or isolated on white.
7. **Mark Prepress Reviewed** → **Send for Customer Approval** → the customer
   approves or requests changes.
8. **Upload Revision** creates version 2 and marks version 1 superseded. Nothing
   is deleted.
9. The audit timeline records every status change, confirmation and notification.

---

## How the analysis works

**Deterministic PDF inspection first.** The analyzer reads real PDF objects before
it looks at anything else:

| What | Where it comes from |
| --- | --- |
| Separations, spot colours, tint transforms | Page `/Resources /ColorSpace` — `/Separation` and `/DeviceN` arrays, evaluated at tint 1 |
| Process channels | `k`/`K` operators and DeviceCMYK images in the content stream |
| Illustrator layers | Marked-content `/Properties` dictionaries (`/Title`) plus `BDC … EMC` blocks |
| Finished size, corner radius | The dieline separation's path geometry, measured from its bezier control points |
| Page geometry | `MediaBox`, `CropBox`, `TrimBox`, `BleedBox`, `ArtBox`, `Rotate`, `UserUnit` |
| Fonts, embedding, subsetting | `/Font` resources and their `FontDescriptor` `FontFile*` entries |
| Image resolution | Image pixel dimensions ÷ the placement matrix from the content stream |
| Transparency, overprint | `/ExtGState` `ca`/`CA`/`BM`/`SMask`/`op`/`OP` |
| Origin, Esko data | Info dictionary and the XMP packet |

**Proof text second**, for information the PDF structure cannot express — product
number, revision, dates, rewind, dispensing, eyemark, substrate colour. Text is
read with positions and grouped into table cells using the proof's own vertical
rules, so a value in one column is never mixed with its neighbour.

**Content-stream geometry third**, for what a proof expresses visually:

- A ballot-box glyph is *checked* when short stroked marks are drawn inside its
  box. On the Great Lakes proof template every box uses the same empty `U+2610`
  glyph, so the drawn X is the only evidence of which option applies.
- A print method is *selected* when its heading sits inside a highlight fill.

No OCR and no visual AI. Nothing is inferred from a rendered picture.

### Every result carries its provenance

Each finding records value, classification, source, confidence, confirmation
status, and any production warning. Sources: embedded PDF color space, PDF object,
Illustrator/Esko metadata, XMP metadata, proof text, dieline geometry,
content-stream geometry, OCR, visual inference, manual user entry, derived.
Statuses: Detected, Confirmed, Needs review, Not found, Not applicable.

### Raw detections stay separate from the production reading

The raw list is what the PDF literally declares. The normalized list is what those
channels mean on press, which depends on the printing method the proof marks:

- On a **digital** proof, named PANTONE separations are **digital match-color
  targets** — matched by the process set, *not* press stations.
- On a **flexo/offset** proof, the same separations are **spot ink plates**.
- If the proof does not clearly mark a method, named separations are left
  **unclassified** and flagged for prepress rather than guessed.

Dielines, cut contours, creases and perfs are structural layers and are never
counted as press stations. Channels used only inside proof/annotation groups are
demoted to proof-only content.

### Separation previews are generated, and labelled as such

A typical Illustrator proof has no optional-content groups, so there are no layers
a viewer can switch on and off. The app generates previews instead:

- **Exact separation isolate** — the named `/Separation` colour space is rewritten
  so it paints nothing, and that render is differenced against the composite. The
  difference is exactly where that separation paints. Used for spot colours and
  dielines.
- **Process channel decomposition** — device CMYK artwork has no separation object
  to neutralise, so a separations-removed render is decomposed into C/M/Y/K. This
  is an approximation of the plate.

Layer views (production-art-only, and each Illustrator group on its own) are made
by blanking the other `BDC … EMC` blocks in the content stream, so they are exact,
not crops.

The interface never calls any of these an original Illustrator layer or an output
plate.

### Materials and finishes are not inferred from template wording

The proof template prints "Inks and Varnishes" as a column heading. That is not a
varnish specification, and the app says so explicitly rather than recording a
varnish. Anything the file does not state is reported as **Not specified** with a
review note.

### Production readiness

The app does not call a file production-ready unless every blocking preflight issue
is resolved *and* a prepress user has confirmed the analysis. "Mark Prepress
Reviewed" is refused while blocking issues remain.

---

## What was verified

The analyzer was validated against a real proof (`10-9819356 v2`, included as the
golden test fixture). It reproduces the full expected dataset from the file itself
with nothing hard-coded — product number, revision, version, date and initials;
10″ × 4.5″ finished size and 0.125″ corner radius from the dieline geometry;
rewind #3 and dispensing direction; all three eyemark fields; CMYK plus the three
PMS colours plus the dieline; Digital/CMYK with the PMS colours as match targets
and zero spot plates; Sign Off and DIMENSION separated from production artwork; and
substrate, adhesive, liner and varnish correctly flagged as not specified.

That comparison runs as part of `npm test`.

---

## Data model

SQLite, one table per record type: `artwork_job`, `artwork_version`, `file_asset`,
`analysis_run`, `detected_attribute`, `color_channel`, `production_layer`,
`material_finish`, `dimension_record`, `preflight_issue`, `artwork_comment`,
`artwork_approval`, `artwork_status_event`, `notification_event`,
`user_confirmation`.

A user correction is stored as an override alongside the original detection plus a
`user_confirmation` row — the analyzer's raw finding is never destroyed. Status
transitions are enforced server-side; an illegal move is rejected with the list of
legal next steps.

## Exports

From the Approval tab of any analysed version:

- `GET /api/versions/:id/export.json` — the complete analysis plus comments,
  approvals, status events, notifications and user confirmations
- `GET /api/versions/:id/export.csv` — every attribute, channel, layer, material,
  dimension, preflight issue and separation as one flat table
- `GET /api/versions/:id/report.html` — a human-readable analysis report

## Layout

```
server/
  src/analyzer/
    index.ts          orchestration, job fields, dimensions, materials, preflight
    pdfStructure.ts   PDF objects, metadata, page boxes, resources (pdf-lib)
    contentStream.ts  content-stream tokenizer and graphics-state engine
    textLayout.ts     positioned text, column-aware line assembly (pdf.js)
    proofFields.ts    checkbox states, highlighted headings, labelled fields
    colors.ts         channel detection and production normalisation
    render.ts         composite, layer and separation rendering (pdfium/WASM)
  src/store.ts        versioning, workflow, audit trail
  src/routes.ts       HTTP API
  test/               74 automated tests
  scripts/            probe.ts (analyzer CLI), e2e.mjs (browser walkthrough)
web/src/              React client: dashboard, queues, workspace, viewer
```

---

## Before this goes into daily use

Honest list of what is not finished:

- **Notifications are recorded, not delivered.** Every send and resend is written
  to `notification_event` and shown in the notification history, but no SMTP is
  wired up. Point it at a mail service before real customers are in the loop.
- **The customer decision is exercised from the internal Approval tab.** There is
  no separate tokenised customer-facing page yet; approve / request-changes is
  driven from the workspace so the whole cycle can be walked through.
- **No authentication.** The acting user is a field on each request. Add real auth
  before exposing this beyond a trusted network.
- **Process-channel previews are approximations.** C/M/Y/K masks are decomposed
  from a render, so overlapping inks and rich blacks are estimates. Spot and
  dieline previews are spatially exact. Both are labelled with the method used.
- **Separation and layer previews cover page 1** on documents longer than four
  pages; composites are rendered for every page. The analysis itself covers all
  pages.
- **The Docker image has not been built end to end.** The Dockerfile and compose
  file were written against a verified production-only dependency set — the app
  was pruned to production dependencies, started, and analysed the golden proof
  successfully — but the image build itself could not run in the authoring
  environment because the Docker registry was blocked there. Expect it to work;
  give it one test build before relying on it.
- **The logo is a temporary wordmark.** `web/src/App.tsx` renders a plain
  "Great Lakes Label" wordmark with a `GL` mark. Drop in the approved asset; it is
  a single component and is marked with a comment.
- **Phone layout is usable but tight.** The interface is responsive and works on a
  phone for status, data review and approvals, but the proof viewer pane is small.
  Reviewing artwork properly wants a desktop.
- **Seeded demonstration jobs** exist so the dashboard queues are not empty on a
  fresh install. They carry **no analyzer output** — every analysis in the app
  comes from a real uploaded PDF.
