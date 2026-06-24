const express = require("express");
const path = require("path");
const store = require("./db");
const Calc = require("./public/calculations");
const { generateSacs } = require("./pdf/sacs");
const { generateTcc } = require("./pdf/tcc");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
    }
  };
}

app.get("/api/clients", wrap((req, res) => {
  res.json(store.listClients());
}));

app.get("/api/clients/:id", wrap((req, res) => {
  const client = store.getClient(Number(req.params.id));
  if (!client) return res.status(404).json({ error: "Client not found" });
  res.json(client);
}));

function validateClient(data) {
  if (!data || !data.client1 || !data.client1.firstName || !data.client1.lastName) {
    return "Client 1 first and last name are required.";
  }
  if (data.married && (!data.client2 || !data.client2.firstName)) {
    return "Married clients require Client 2 details.";
  }
  return null;
}

app.post("/api/clients", wrap((req, res) => {
  const err = validateClient(req.body);
  if (err) return res.status(400).json({ error: err });
  res.status(201).json(store.createClient(req.body));
}));

app.put("/api/clients/:id", wrap((req, res) => {
  const id = Number(req.params.id);
  if (!store.getClient(id)) return res.status(404).json({ error: "Client not found" });
  const err = validateClient(req.body);
  if (err) return res.status(400).json({ error: err });
  res.json(store.updateClient(id, req.body));
}));

app.delete("/api/clients/:id", wrap((req, res) => {
  store.deleteClient(Number(req.params.id));
  res.json({ ok: true });
}));

app.get("/api/clients/:id/prefill", wrap((req, res) => {
  const client = store.getClient(Number(req.params.id));
  if (!client) return res.status(404).json({ error: "Client not found" });
  res.json({ client, lastReport: store.latestReport(client.id) });
}));

app.get("/api/clients/:id/reports", wrap((req, res) => {
  const client = store.getClient(Number(req.params.id));
  if (!client) return res.status(404).json({ error: "Client not found" });
  const reports = store.listReports(client.id).map((r) => ({ ...r, calc: Calc.computeReport(client, r) }));
  res.json(reports);
}));

app.post("/api/clients/:id/reports", wrap((req, res) => {
  const client = store.getClient(Number(req.params.id));
  if (!client) return res.status(404).json({ error: "Client not found" });
  const data = req.body || {};
  if (!data.reportDate) return res.status(400).json({ error: "Report date is required." });
  if (!client.accounts.length) {
    return res.status(400).json({ error: "Client has no accounts. Add accounts before generating a report." });
  }
  const missing = Calc.missingFields(client, data);
  if (missing.length > 0) {
    return res.status(400).json({ error: "Missing required fields.", missing });
  }
  const report = store.createReport(client.id, data, client);
  res.status(201).json({ report, calc: Calc.computeReport(client, report) });
}));

function loadReport(id) {
  const report = store.getReport(id);
  if (!report) return null;
  const client = store.getClient(report.clientId);
  const calc = Calc.computeReport(client, report);
  calc.reportDate = report.reportDate;
  return { report, client, calc };
}

app.get("/api/reports/:id", wrap((req, res) => {
  const data = loadReport(Number(req.params.id));
  if (!data) return res.status(404).json({ error: "Report not found" });
  res.json(data);
}));

app.delete("/api/reports/:id", wrap((req, res) => {
  store.deleteReport(Number(req.params.id));
  res.json({ ok: true });
}));

function safeName(client, kind) {
  let base = `${client.client1.lastName}_${kind}`.replace(/[^a-z0-9_]/gi, "");
  if (base === "_" + kind || base === kind) base = `client${client.id}_${kind}`;
  return `${base}.pdf`;
}

function sendPdf(generate) {
  return wrap(async (req, res) => {
    const data = loadReport(Number(req.params.id));
    if (!data) return res.status(404).json({ error: "Report not found" });
    const buf = await generate(data);
    const disposition = req.query.dl ? "attachment" : "inline";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeName(data.client, req.params.kind)}"`);
    res.send(buf);
  });
}

app.get("/api/reports/:id/sacs.pdf", (req, res, next) => { req.params.kind = "SACS"; next(); },
  sendPdf((data) => generateSacs(data.client, data.calc)));

app.get("/api/reports/:id/tcc.pdf", (req, res, next) => { req.params.kind = "TCC"; next(); },
  sendPdf((data) => generateTcc(data.client, data.report, data.calc)));

app.post("/api/reports/:id/canva", wrap((req, res) => {
  const data = loadReport(Number(req.params.id));
  if (!data) return res.status(404).json({ error: "Report not found" });
  if (!process.env.CANVA_API_KEY) {
    return res.status(200).json({
      ok: false,
      configured: false,
      message:
        "Canva export is not configured (set CANVA_API_KEY to enable). For now, download the PDFs and import them into your Canva workspace for any last-minute edits.",
      pdfs: {
        sacs: `/api/reports/${data.report.id}/sacs.pdf?dl=1`,
        tcc: `/api/reports/${data.report.id}/tcc.pdf?dl=1`,
      },
    });
  }
  res.status(501).json({ ok: false, configured: true, message: "Canva upload flow not implemented in V1." });
}));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`AW Client Report Portal running at http://localhost:${PORT}`);
  console.log(`Database: ${store.DB_PATH}`);
});

module.exports = app;
