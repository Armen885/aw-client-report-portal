# AW Client Report Portal

A portal where the team enters client financial data into a structured form and
generates polished quarterly **SACS** (cash flow) and **TCC** (net worth) PDF
reports in minutes instead of a full day.

Built for Windbrook Solutions — replaces the manual Excel + Canva + Word workflow
with structured data entry, automated math, and fixed-layout PDF generation.

---

## Quick start

```bash
npm install
npm start
# open http://localhost:3000
```

Other scripts:

```bash
npm test          # unit tests for the calculation engine (node --test)
npm run dev       # start with auto-reload (node --watch)
node scripts/smoke.mjs   # end-to-end smoke test (server must be running)
```

Requires **Node.js ≥ 22.5** (uses the built-in `node:sqlite` module — no native
build step, no external database).

---

## Stack note (divergence from the PRD)

The PRD suggested a Python backend (Flask + ReportLab). This machine had no
Python toolchain but a current Node.js, so the build uses **Node** instead — the
PRD explicitly allows the engineer to diverge on stack. The architecture is
identical to what was asked for:

| Layer | PRD suggestion | This build | Why |
|-------|----------------|-----------|-----|
| Frontend | HTML + CSS + JS | Vanilla HTML/CSS/JS SPA | No framework overhead, as requested |
| Backend | Python | Node + Express | Available toolchain; same role |
| Database | SQLite | `node:sqlite` (built-in) | Zero native deps |
| PDF | ReportLab / WeasyPrint | pdfkit | Pure-JS fixed-coordinate drawing (1:1 with ReportLab's canvas model) |
| AI | None | None | Pure deterministic math, as specified |

The calculation engine (`public/calculations.js`) is shared verbatim between the
server (authoritative values for PDFs) and the browser (live totals as you type),
so the math can never drift between preview and output.

---

## Project layout

```
server.js                 Express app — static portal + JSON API + PDF downloads
db.js                     node:sqlite schema + CRUD (clients, accounts, reports, balances)
public/calculations.js    Deterministic SACS/TCC math (shared server + browser)
public/index.html         SPA shell
public/app.js             Hash-routed views, forms, live totals
public/style.css          Professional blue-branded styling
pdf/theme.js              Shared colours, fonts, header/footer, formatters
pdf/sacs.js               SACS cash-flow diagram PDF (2 pages)
pdf/tcc.js                TCC net-worth chart PDF (dynamic bubbles)
test/calculations.test.js Unit tests for every 2b calculation rule
scripts/smoke.mjs         End-to-end API + PDF smoke test
```

---

## How it maps to the acceptance criteria

**US1 — Client setup (`public/app.js` client form, `db.js`)**
- Add client: names, DOB, **auto-calculated age**, last-4 SSN, spouse info
- Account structure: retirement / non-retirement / trust (property address) /
  liabilities (with interest rates), dynamic add/remove rows
- Static financials: monthly salary, expense budget, insurance deductibles, property
- Single **and** married (Client 1 / Client 2) supported
- Edit any client; client-list view shows the last report date and report count

**US2 — Quarterly entry + automated math (`reportEntry` view, `calculations.js`)**
- One-click **Generate Report** from the client profile
- Form organized by section (SACS, then TCC), static data pre-filled
- Each dynamic field shows **last quarter's value** with a **"Use last"** button
- Incomplete fields are highlighted; **generation is blocked until all are filled**
  (enforced again server-side — impossible to generate with missing data)
- All totals update **live**. Calculation rules implemented exactly:
  - Excess = Inflow − Outflow
  - Reserve Target = (6 × monthly expenses) + insurance deductibles
  - Retirement totals per spouse; Non-Retirement total **excludes the trust**
  - Grand Total = C1 retirement + C2 retirement + non-retirement + trust
  - Liabilities shown **separately, never subtracted** from net worth

**US3 — PDF generation (`pdf/sacs.js`, `pdf/tcc.js`)**
- SACS: green Inflow → red Outflow (with expense branch + X) → blue Private
  Reserve, connecting arrows; page 2 has reserve balance, Schwab investment
  balance, target, and progress bar. Fixed coordinates so nothing shifts.
- TCC: green client-info bubbles, retirement bubbles per spouse, non-retirement,
  trust (address + value), liabilities (type / rate / balance), gray summary
  boxes, and a prominent Grand Total. Bubble count is dynamic (1–6 per spouse).
- Blue company branding; header with client name + date.

**US4 — Export (`reportView`, `server.js`)**
- Download SACS and TCC as separate print-ready PDFs; view inline
- Report history per client with re-download
- "Export to Canva" degrades gracefully: with `CANVA_API_KEY` set it would call
  the Canva Connect API; without it, it guides the user to download & import
  (Canva export is a documented nice-to-have)

---

## Known limitations / V2

- **Pixel-perfect template match:** the original SACS/TCC samples were referenced
  in the PRD as screenshots but not provided as files. The PDFs here are a
  faithful, polished interpretation of the described layouts. Drop the real
  sample PDFs in and coordinates in `pdf/sacs.js` / `pdf/tcc.js` can be nudged to
  match exactly.
- **Canva export** is stubbed behind `CANVA_API_KEY` (full OAuth flow is V2).
- No automated data pulling (RightCapital / Schwab / Pinnacle / Zillow) — manual
  entry only, intentionally, per the PRD.
- Single-tenant, no auth — intended for a 3-person internal team.

## Deployment (Railway)

Set a persistent volume and point `RAILWAY_DATABASE_PATH` at a file on it
(e.g. `/data/portal.db`). `npm start` runs the server on `$PORT`.
