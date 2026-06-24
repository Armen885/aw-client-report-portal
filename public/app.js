(function () {
  "use strict";

  const app = document.getElementById("app");
  const toastEl = document.getElementById("toast");

  const ACCOUNT_TYPES = {
    retirement: ["IRA", "Roth IRA", "401(k)", "403(b)", "Pension", "SEP IRA", "Other"],
    non_retirement: ["Brokerage", "Joint Brokerage", "Checking", "Savings", "HSA", "529", "Other"],
    trust: ["Primary Residence", "Investment Property", "Other Property"],
    liability: ["Mortgage", "Auto Loan", "HELOC", "Student Loan", "Other"],
  };
  const CATEGORY_LABELS = {
    retirement: "Retirement Accounts",
    non_retirement: "Non-Retirement Accounts",
    trust: "Trust",
    liability: "Liabilities",
  };

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = Calc.fmtMoney;
  const clientName = Calc.clientName;
  const ageFrom = Calc.age;
  const qs = (sel, root) => (root || document).querySelector(sel);
  const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  async function api(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) throw new Error((data && data.error) || res.statusText);
    return data;
  }

  const routes = [
    [/^#\/$/, dashboard],
    [/^#\/clients\/new$/, () => clientForm(null)],
    [/^#\/clients\/(\d+)\/edit$/, (m) => clientForm(Number(m[1]))],
    [/^#\/clients\/(\d+)\/report$/, (m) => reportEntry(Number(m[1]))],
    [/^#\/clients\/(\d+)$/, (m) => clientDetail(Number(m[1]))],
    [/^#\/reports\/(\d+)$/, (m) => reportView(Number(m[1]))],
  ];

  function router() {
    const hash = location.hash || "#/";
    for (const [re, handler] of routes) {
      const m = hash.match(re);
      if (m) { handler(m); return; }
    }
    location.hash = "#/";
  }
  window.addEventListener("hashchange", router);
  window.addEventListener("load", router);

  function render(htmlStr) { app.innerHTML = htmlStr; }
  function loading() { render('<div class="empty"><div class="big">⏳</div>Loading…</div>'); }
  function errorView(e) { render(`<div class="card"><div class="banner error">${esc(e.message || e)}</div><a class="btn secondary" href="#/">← Back to clients</a></div>`); }

  async function dashboard() {
    loading();
    try {
      const clients = await api("GET", "/api/clients");
      if (!clients.length) {
        render(`
          <div class="page-head"><div><h2>Clients</h2><div class="muted">Your report-generation client list.</div></div>
            <a class="btn" href="#/clients/new">+ New Client</a></div>
          <div class="card empty"><div class="big">📋</div>
            <p>No clients yet. Add your first client to start generating SACS &amp; TCC reports.</p>
            <a class="btn" href="#/clients/new">+ Add Client</a></div>`);
        return;
      }
      const rows = clients.map((c) => `
        <tr class="clickable" data-id="${c.id}">
          <td><strong>${esc(clientName(c))}</strong></td>
          <td>${c.married ? '<span class="pill green">Married</span>' : '<span class="pill gray">Single</span>'}</td>
          <td>${c.reportCount} report${c.reportCount === 1 ? "" : "s"}</td>
          <td>${c.lastReportDate ? esc(new Date(c.lastReportDate).toLocaleDateString("en-US")) : '<span class="muted">—</span>'}</td>
          <td style="text-align:right"><a class="btn sm" href="#/clients/${c.id}/report">Generate Report</a></td>
        </tr>`).join("");
      render(`
        <div class="page-head"><div><h2>Clients</h2><div class="muted">${clients.length} client${clients.length === 1 ? "" : "s"} · click a row to view details</div></div>
          <a class="btn" href="#/clients/new">+ New Client</a></div>
        <div class="card" style="padding:6px 22px">
          <table>
            <thead><tr><th>Client</th><th>Type</th><th>Reports</th><th>Last Report</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`);
      qsa("tr.clickable").forEach((tr) =>
        tr.addEventListener("click", (e) => {
          if (e.target.closest("a")) return;
          location.hash = `#/clients/${tr.dataset.id}`;
        }));
    } catch (e) { errorView(e); }
  }

  let formAccounts = [];

  function ownerOptions(selected, married) {
    const opts = [["client1", "Client 1"], ["joint", "Joint"]];
    if (married) opts.splice(1, 0, ["client2", "Client 2"]);
    return opts.map(([v, l]) => `<option value="${v}" ${v === selected ? "selected" : ""}>${l}</option>`).join("");
  }

  function typeOptions(category, selected) {
    return (ACCOUNT_TYPES[category] || []).map((t) => `<option ${t === selected ? "selected" : ""}>${esc(t)}</option>`).join("");
  }

  function syncAccountsFromDom() {
    qsa(".acct-row").forEach((row) => {
      const i = Number(row.dataset.idx);
      const a = formAccounts[i];
      if (!a) return;
      if (a.category === "trust") {
        a.owner = "joint";
      } else {
        const owner = qs(".f-owner", row);
        if (owner) a.owner = owner.value;
      }
      a.accountType = qs(".f-type", row).value;
      a.lastFour = qs(".f-last4", row).value;
      const rate = qs(".f-rate", row);
      a.interestRate = rate ? rate.value : null;
      const inv = qs(".f-inv", row);
      a.isInvestment = inv ? inv.checked : false;
    });
  }

  function renderAccountGroups(married) {
    return Object.keys(CATEGORY_LABELS).map((cat) => {
      const items = formAccounts.map((a, i) => [a, i]).filter(([a]) => a.category === cat);
      const rows = items.map(([a, i]) => {
        const isLiab = cat === "liability";
        const showInv = cat === "non_retirement";
        const ownerSel = cat === "trust" ? "" : `<select class="f-owner">${ownerOptions(a.owner || "client1", married)}</select>`;
        return `<div class="acct-row" data-idx="${i}">
          <select class="f-type">${typeOptions(cat, a.accountType)}</select>
          ${cat === "trust" ? '<div class="muted" style="font-size:12px">Value entered each quarter (Zillow)</div>' : ownerSel}
          <input class="f-last4" placeholder="Last 4 #" maxlength="4" value="${esc(a.lastFour || "")}" />
          ${isLiab ? `<input class="f-rate" placeholder="Rate %" value="${esc(a.interestRate == null ? "" : a.interestRate)}" />` : "<div></div>"}
          ${showInv ? `<label class="invcell"><input type="checkbox" class="f-inv" ${a.isInvestment ? "checked" : ""}/> Invest.</label>` : "<div></div>"}
          <button type="button" class="icon-btn" data-rm="${i}" title="Remove">✕</button>
        </div>`;
      }).join("");
      return `<div class="acct-group">
        <h4>${CATEGORY_LABELS[cat]} <button type="button" class="btn secondary sm" data-add="${cat}">+ Add</button></h4>
        ${rows || '<div class="muted" style="font-size:13px">None added.</div>'}
      </div>`;
    }).join("");
  }

  function bindAccountControls(married) {
    qsa("[data-add]").forEach((b) => b.addEventListener("click", () => {
      syncAccountsFromDom();
      const cat = b.dataset.add;
      formAccounts.push({
        owner: cat === "trust" ? "joint" : "client1",
        category: cat,
        accountType: ACCOUNT_TYPES[cat][0],
        lastFour: "",
        interestRate: cat === "liability" ? "" : null,
        isInvestment: cat === "non_retirement" && ACCOUNT_TYPES[cat][0].includes("Brokerage"),
      });
      refreshAccounts(married);
    }));
    qsa("[data-rm]").forEach((b) => b.addEventListener("click", () => {
      syncAccountsFromDom();
      formAccounts.splice(Number(b.dataset.rm), 1);
      refreshAccounts(married);
    }));
    qsa(".acct-row").forEach((row) => {
      const t = qs(".f-type", row);
      const inv = qs(".f-inv", row);
      if (t && inv) t.addEventListener("change", () => { if (t.value.includes("Brokerage")) inv.checked = true; });
    });
  }

  function refreshAccounts(married) {
    qs("#acctGroups").innerHTML = renderAccountGroups(married);
    bindAccountControls(married);
  }

  async function clientForm(id) {
    loading();
    let client = null;
    if (id) {
      try { client = await api("GET", `/api/clients/${id}`); } catch (e) { return errorView(e); }
    }
    formAccounts = client ? client.accounts.map((a) => ({ ...a })) : [];
    const c1 = client ? client.client1 : {};
    const c2 = (client && client.client2) || {};
    const married = client ? client.married : false;

    render(`
      <div class="page-head"><div><h2>${id ? "Edit Client" : "New Client"}</h2>
        <div class="muted">Enter static client info once. You'll enter balances each quarter.</div></div>
        <a class="btn ghost" href="${id ? "#/clients/" + id : "#/"}">Cancel</a></div>

      <form id="clientForm">
        <div class="card">
          <h3>Client 1</h3>
          <div class="row">
            <div class="field"><label>First Name *</label><input name="c1first" value="${esc(c1.firstName || "")}" required /></div>
            <div class="field"><label>Last Name *</label><input name="c1last" value="${esc(c1.lastName || "")}" required /></div>
          </div>
          <div class="row">
            <div class="field"><label>Date of Birth <span id="c1age" class="hint"></span></label><input type="date" name="c1dob" value="${esc(c1.dob || "")}" /></div>
            <div class="field"><label>Last 4 of SSN</label><input name="c1ssn" maxlength="4" value="${esc(c1.ssnLast4 || "")}" /></div>
          </div>
          <label class="inline-check" style="margin-top:6px"><input type="checkbox" id="married" ${married ? "checked" : ""}/> Married — add Client 2</label>
        </div>

        <div class="card" id="c2card" style="${married ? "" : "display:none"}">
          <h3>Client 2 (Spouse)</h3>
          <div class="row">
            <div class="field"><label>First Name</label><input name="c2first" value="${esc(c2.firstName || "")}" /></div>
            <div class="field"><label>Last Name</label><input name="c2last" value="${esc(c2.lastName || "")}" /></div>
          </div>
          <div class="row">
            <div class="field"><label>Date of Birth <span id="c2age" class="hint"></span></label><input type="date" name="c2dob" value="${esc(c2.dob || "")}" /></div>
            <div class="field"><label>Last 4 of SSN</label><input name="c2ssn" maxlength="4" value="${esc(c2.ssnLast4 || "")}" /></div>
          </div>
        </div>

        <div class="card">
          <h3>Static Financials</h3>
          <div class="row">
            <div class="field"><label>Monthly Salary (after tax) <span class="hint">Inflow</span></label>
              <div class="money-input"><input name="salary" type="number" step="any" value="${esc(client ? client.monthlySalary : "")}" /></div></div>
            <div class="field"><label>Monthly Expense Budget <span class="hint">Outflow</span></label>
              <div class="money-input"><input name="budget" type="number" step="any" value="${esc(client ? client.monthlyExpenseBudget : "")}" /></div></div>
          </div>
          <div class="row">
            <div class="field"><label>Insurance Deductibles (total) <span class="hint">for reserve target</span></label>
              <div class="money-input"><input name="deductibles" type="number" step="any" value="${esc(client ? client.insuranceDeductibles : "")}" /></div></div>
            <div class="field"><label>Property Address <span class="hint">trust / Zillow lookup</span></label>
              <input name="address" value="${esc(client ? client.propertyAddress || "" : "")}" /></div>
          </div>
          <div class="muted" style="font-size:12px">Private Reserve Target is auto-calculated: (6 × expense budget) + insurance deductibles.</div>
        </div>

        <div class="card">
          <h3>Account Structure</h3>
          <div class="muted" style="margin-bottom:12px;font-size:13px">Define which accounts this client holds. Balances are entered each quarter.</div>
          <div id="acctGroups">${renderAccountGroups(married)}</div>
        </div>

        <div class="toolbar">
          <button class="btn green" type="submit">${id ? "Save Changes" : "Create Client"}</button>
          ${id ? `<button class="btn danger" type="button" id="deleteBtn">Delete Client</button>` : ""}
          <div class="spacer"></div>
          <a class="btn ghost" href="${id ? "#/clients/" + id : "#/"}">Cancel</a>
        </div>
      </form>`);

    const wireAge = (dobName, spanId) => {
      const inp = qs(`[name="${dobName}"]`); const span = qs("#" + spanId);
      const upd = () => { const a = ageFrom(inp.value); span.textContent = a != null ? `· age ${a}` : ""; };
      inp.addEventListener("input", upd); upd();
    };
    wireAge("c1dob", "c1age"); wireAge("c2dob", "c2age");

    const marriedBox = qs("#married");
    marriedBox.addEventListener("change", () => {
      qs("#c2card").style.display = marriedBox.checked ? "" : "none";
      syncAccountsFromDom();
      refreshAccounts(marriedBox.checked);
    });

    bindAccountControls(married);

    if (id) qs("#deleteBtn").addEventListener("click", async () => {
      if (!confirm("Delete this client and all their reports? This cannot be undone.")) return;
      try { await api("DELETE", `/api/clients/${id}`); toast("Client deleted"); location.hash = "#/"; }
      catch (e) { toast(e.message); }
    });

    qs("#clientForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      syncAccountsFromDom();
      if (formAccounts.length === 0 &&
          !confirm("This client has no accounts yet. You won't be able to generate a report until you add at least one account (use the \"+ Add\" buttons under Account Structure). Save anyway?")) {
        return;
      }
      const f = ev.target;
      const val = (name) => { const el = qs(`[name="${name}"]`, f); return el ? el.value : ""; };
      const isMarried = marriedBox.checked;
      const payload = {
        client1: { firstName: val("c1first").trim(), lastName: val("c1last").trim(), dob: val("c1dob") || null, ssnLast4: val("c1ssn").trim() || null },
        married: isMarried,
        client2: isMarried ? { firstName: val("c2first").trim(), lastName: val("c2last").trim(), dob: val("c2dob") || null, ssnLast4: val("c2ssn").trim() || null } : null,
        monthlySalary: val("salary"), monthlyExpenseBudget: val("budget"),
        insuranceDeductibles: val("deductibles"), propertyAddress: val("address").trim() || null,
        accounts: formAccounts.map((a) => ({ ...a, owner: a.category === "trust" ? "joint" : a.owner })),
      };
      try {
        const saved = id ? await api("PUT", `/api/clients/${id}`, payload) : await api("POST", "/api/clients", payload);
        toast(id ? "Client saved" : "Client created");
        location.hash = `#/clients/${saved.id}`;
      } catch (e) { toast(e.message); }
    });
  }

  async function clientDetail(id) {
    loading();
    try {
      const [client, reports] = await Promise.all([
        api("GET", `/api/clients/${id}`),
        api("GET", `/api/clients/${id}/reports`),
      ]);
      const acctSummary = (cat) => client.accounts.filter((a) => a.category === cat).map((a) => esc(a.accountType)).join(", ") || "—";
      const reserveTarget = 6 * Calc.num(client.monthlyExpenseBudget) + Calc.num(client.insuranceDeductibles);
      const reportRows = reports.length ? reports.map((r) => `
        <tr class="clickable" data-id="${r.id}">
          <td>${esc(new Date(r.reportDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }))}</td>
          <td>${money(r.calc.tcc.grandTotalNetWorth)}</td>
          <td>${money(r.calc.sacs.excess)}/mo excess</td>
          <td style="text-align:right">
            <a class="btn sm secondary" href="/api/reports/${r.id}/sacs.pdf" target="_blank">SACS</a>
            <a class="btn sm secondary" href="/api/reports/${r.id}/tcc.pdf" target="_blank">TCC</a>
          </td>
        </tr>`).join("") : `<tr><td colspan="4" class="muted">No reports yet.</td></tr>`;

      render(`
        <div class="page-head">
          <div><h2>${esc(clientName(client))}</h2>
            <div class="muted">${client.married ? "Married" : "Single"} · ${client.accounts.length} accounts</div></div>
          <div class="toolbar">
            <a class="btn green" href="#/clients/${id}/report">+ Generate Report</a>
            <a class="btn secondary" href="#/clients/${id}/edit">Edit</a>
          </div>
        </div>

        <div class="card">
          <h3>Profile</h3>
          <dl class="kv">
            <dt>Client 1</dt><dd>${esc(client.client1.firstName)} ${esc(client.client1.lastName)} ${client.client1.dob ? `· age ${ageFrom(client.client1.dob)}` : ""} ${client.client1.ssnLast4 ? `· SSN ••••${esc(client.client1.ssnLast4)}` : ""}</dd>
            ${client.married && client.client2 ? `<dt>Client 2</dt><dd>${esc(client.client2.firstName)} ${esc(client.client2.lastName)} ${client.client2.dob ? `· age ${ageFrom(client.client2.dob)}` : ""} ${client.client2.ssnLast4 ? `· SSN ••••${esc(client.client2.ssnLast4)}` : ""}</dd>` : ""}
            <dt>Monthly Inflow</dt><dd>${money(client.monthlySalary)}</dd>
            <dt>Monthly Outflow</dt><dd>${money(client.monthlyExpenseBudget)}</dd>
            <dt>Reserve Target</dt><dd>${money(reserveTarget)} <span class="muted">(6 × expenses + deductibles)</span></dd>
            <dt>Property</dt><dd>${esc(client.propertyAddress || "—")}</dd>
            <dt>Retirement</dt><dd>${acctSummary("retirement")}</dd>
            <dt>Non-Retirement</dt><dd>${acctSummary("non_retirement")}</dd>
            <dt>Trust</dt><dd>${acctSummary("trust")}</dd>
            <dt>Liabilities</dt><dd>${acctSummary("liability")}</dd>
          </dl>
        </div>

        <div class="card" style="padding:6px 22px">
          <h3 style="margin:18px 0 4px">Report History</h3>
          <table><thead><tr><th>Date</th><th>Net Worth</th><th>Cash Flow</th><th></th></tr></thead>
          <tbody>${reportRows}</tbody></table>
        </div>`);

      qsa("tr.clickable").forEach((tr) => tr.addEventListener("click", (e) => {
        if (e.target.closest("a")) return;
        location.hash = `#/reports/${tr.dataset.id}`;
      }));
    } catch (e) { errorView(e); }
  }

  async function reportEntry(clientId) {
    loading();
    let client, lastReport;
    try {
      const data = await api("GET", `/api/clients/${clientId}/prefill`);
      client = data.client; lastReport = data.lastReport;
    } catch (e) { return errorView(e); }

    if (!client.accounts.length) {
      return render(`<div class="card"><div class="banner warn">This client has no accounts defined yet. Add accounts before generating a report.</div>
        <a class="btn" href="#/clients/${clientId}/edit">Edit Client</a></div>`);
    }

    const lastBal = (lastReport && lastReport.balances) || {};
    const today = new Date().toISOString().slice(0, 10);

    const dynField = (id, label, value, last) => `
      <div class="dyn-field">
        <div>
          <label>${esc(label)}</label>
          <div class="money-input"><input data-field="${id}" type="number" step="any" value="${value == null ? "" : esc(value)}" placeholder="0" /></div>
          ${last != null ? `<div class="last-val">Last quarter: ${money(last)}</div>` : ""}
        </div>
        ${last != null ? `<button type="button" class="use-last" data-uselast="${id}" data-val="${last}">Use last</button>` : "<div></div>"}
      </div>`;

    const acctFields = (cat) => client.accounts.filter((a) => a.category === cat).map((a) => {
      const prev = lastBal[a.id] || {};
      const ownerTag = client.married && cat === "retirement" ? ` (${a.owner === "client2" ? client.client2.firstName : client.client1.firstName})` : "";
      const lbl = `${a.accountType}${a.lastFour ? " ••" + a.lastFour : ""}${ownerTag}${cat === "trust" ? " — Zillow value" : ""}`;
      let html = dynField("acct_" + a.id, lbl, prev.balance, prev.balance != null ? prev.balance : null);
      if (a.isInvestment) {
        html += dynField("cash_" + a.id, `↳ ${a.accountType} — cash balance`, prev.cashBalance, prev.cashBalance != null ? prev.cashBalance : null);
      }
      return html;
    }).join("");

    const sectionIfAny = (cat, title) => {
      const has = client.accounts.some((a) => a.category === cat);
      return has ? `<h3>${title}</h3>${acctFields(cat)}` : "";
    };

    render(`
      <div class="page-head"><div><h2>Generate Report — ${esc(clientName(client))}</h2>
        <div class="muted">Enter this quarter's balances. All math updates live; totals on the right.</div></div>
        <a class="btn ghost" href="#/clients/${clientId}">Cancel</a></div>

      <div class="report-layout">
        <div>
          <div class="card">
            <h3>Report Details</h3>
            <div class="field"><label>Report Date</label><input type="date" data-field="reportDate" value="${today}" /></div>
          </div>

          <div class="card">
            <h3>SACS — Cash Flow</h3>
            ${dynField("inflow", "Monthly Inflow (salary)", lastReport ? lastReport.inflow : client.monthlySalary, lastReport ? lastReport.inflow : null)}
            ${dynField("outflow", "Monthly Outflow (expense budget)", lastReport ? lastReport.outflow : client.monthlyExpenseBudget, lastReport ? lastReport.outflow : null)}
            ${dynField("privateReserveBalance", "Private Reserve Balance", null, lastReport ? lastReport.privateReserveBalance : null)}
          </div>

          <div class="card">
            <h3>TCC — Account Balances</h3>
            ${sectionIfAny("retirement", "Retirement")}
            ${sectionIfAny("non_retirement", "Non-Retirement")}
            ${sectionIfAny("trust", "Trust")}
            ${sectionIfAny("liability", "Liabilities")}
          </div>
        </div>

        <div class="totals-panel">
          <div class="card">
            <h3 style="margin-top:0">Live Totals</h3>
            <div id="banner"></div>
            <div id="totals"></div>
            <button class="btn green" id="genBtn" style="width:100%;justify-content:center;margin-top:14px" disabled>Generate Report</button>
          </div>
        </div>
      </div>`);

    function gather() {
      const get = (f) => { const el = qs(`[data-field="${f}"]`); return el ? el.value : ""; };
      const report = {
        reportDate: get("reportDate"),
        inflow: get("inflow"),
        outflow: get("outflow"),
        privateReserveBalance: get("privateReserveBalance"),
        balances: {},
      };
      client.accounts.forEach((a) => {
        report.balances[a.id] = { balance: get("acct_" + a.id), cashBalance: a.isInvestment ? get("cash_" + a.id) : null };
      });
      return report;
    }

    function recompute() {
      const report = gather();
      const calc = Calc.computeReport(client, report);
      const missing = Calc.missingFields(client, report);

      qsa("[data-field]").forEach((el) => {
        const f = el.dataset.field;
        if (f === "reportDate") return;
        const isMissing = missing.some((m) => m.id === f);
        el.classList.toggle("incomplete", isMissing && el.value === "");
      });

      const s = calc.sacs, t = calc.tcc;
      qs("#totals").innerHTML = `
        <div class="total-line"><span><span class="swatch" style="background:var(--green)"></span>Inflow</span><span class="v">${money(s.inflow)}</span></div>
        <div class="total-line"><span><span class="swatch" style="background:var(--red)"></span>Outflow</span><span class="v">${money(s.outflow)}</span></div>
        <div class="total-line"><span><span class="swatch" style="background:var(--blue)"></span>Excess → Reserve</span><span class="v">${money(s.excess)}/mo</span></div>
        <div class="total-line"><span>Reserve Target</span><span class="v">${money(s.privateReserveTarget)}</span></div>
        <div style="height:10px"></div>
        <div class="total-line"><span>Client 1 Retirement</span><span class="v">${money(t.client1RetirementTotal)}</span></div>
        ${client.married ? `<div class="total-line"><span>Client 2 Retirement</span><span class="v">${money(t.client2RetirementTotal)}</span></div>` : ""}
        <div class="total-line"><span>Non-Retirement</span><span class="v">${money(t.nonRetirementTotal)}</span></div>
        <div class="total-line"><span>Trust</span><span class="v">${money(t.trustTotal)}</span></div>
        <div class="total-line"><span>Liabilities <span class="muted">(separate)</span></span><span class="v">${money(t.liabilitiesTotal)}</span></div>
        <div class="total-line grand"><span>Grand Total Net Worth</span><span class="v">${money(t.grandTotalNetWorth)}</span></div>`;

      const banner = qs("#banner");
      if (missing.length) {
        banner.innerHTML = `<div class="banner warn">${missing.length} field${missing.length === 1 ? "" : "s"} incomplete — fill all balances to generate.</div>`;
      } else {
        banner.innerHTML = `<div class="banner ok">All fields complete. Ready to generate.</div>`;
      }
      qs("#genBtn").disabled = missing.length > 0;
    }

    qs(".report-layout").addEventListener("input", (e) => { if (e.target.matches("[data-field]")) recompute(); });
    qsa("[data-uselast]").forEach((b) => b.addEventListener("click", () => {
      const el = qs(`[data-field="${b.dataset.uselast}"]`);
      if (el) { el.value = b.dataset.val; recompute(); }
    }));

    qs("#genBtn").addEventListener("click", async () => {
      const report = gather();
      qs("#genBtn").disabled = true;
      try {
        const result = await api("POST", `/api/clients/${clientId}/reports`, report);
        toast("Report generated");
        location.hash = `#/reports/${result.report.id}`;
      } catch (e) { toast(e.message); qs("#genBtn").disabled = false; }
    });

    recompute();
  }

  async function reportView(id) {
    loading();
    try {
      const { report, client, calc } = await api("GET", `/api/reports/${id}`);
      const s = calc.sacs, t = calc.tcc;
      const dateStr = new Date(report.reportDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

      render(`
        <div class="page-head">
          <div><h2>Report — ${esc(clientName(client))}</h2><div class="muted">${esc(dateStr)}</div></div>
          <a class="btn ghost" href="#/clients/${client.id}">← Client</a>
        </div>

        <div class="card">
          <h3 style="margin-top:0">Downloads &amp; Export</h3>
          <div class="toolbar">
            <a class="btn" href="/api/reports/${id}/sacs.pdf?dl=1">⬇ Download SACS PDF</a>
            <a class="btn" href="/api/reports/${id}/tcc.pdf?dl=1">⬇ Download TCC PDF</a>
            <a class="btn secondary" href="/api/reports/${id}/sacs.pdf" target="_blank">View SACS</a>
            <a class="btn secondary" href="/api/reports/${id}/tcc.pdf" target="_blank">View TCC</a>
            <button class="btn secondary" id="canvaBtn">Export to Canva</button>
            <div class="spacer"></div>
            <button class="btn danger" id="delBtn">Delete</button>
          </div>
          <div id="canvaMsg"></div>
        </div>

        <div class="card">
          <h3>SACS — Cash Flow</h3>
          <dl class="kv">
            <dt>Inflow</dt><dd>${money(s.inflow)}/mo</dd>
            <dt>Outflow</dt><dd>${money(s.outflow)}/mo</dd>
            <dt>Excess to Reserve</dt><dd>${money(s.excess)}/mo</dd>
            <dt>Private Reserve Balance</dt><dd>${money(s.privateReserveBalance)}</dd>
            <dt>Reserve Target</dt><dd>${money(s.privateReserveTarget)}</dd>
            <dt>Investment (Schwab)</dt><dd>${money(s.investmentBalance)}</dd>
          </dl>
        </div>

        <div class="card">
          <h3>TCC — Net Worth</h3>
          <dl class="kv">
            <dt>Client 1 Retirement</dt><dd>${money(t.client1RetirementTotal)}</dd>
            ${client.married ? `<dt>Client 2 Retirement</dt><dd>${money(t.client2RetirementTotal)}</dd>` : ""}
            <dt>Non-Retirement</dt><dd>${money(t.nonRetirementTotal)}</dd>
            <dt>Trust</dt><dd>${money(t.trustTotal)}</dd>
            <dt><strong>Grand Total Net Worth</strong></dt><dd><strong>${money(t.grandTotalNetWorth)}</strong></dd>
            <dt>Liabilities (separate)</dt><dd>${money(t.liabilitiesTotal)} <span class="muted">not subtracted</span></dd>
          </dl>
        </div>`);

      qs("#delBtn").addEventListener("click", async () => {
        if (!confirm("Delete this report?")) return;
        try { await api("DELETE", `/api/reports/${id}`); toast("Report deleted"); location.hash = `#/clients/${client.id}`; }
        catch (e) { toast(e.message); }
      });
      qs("#canvaBtn").addEventListener("click", async () => {
        try {
          const r = await api("POST", `/api/reports/${id}/canva`);
          if (!r.ok && r.pdfs) {
            [r.pdfs.sacs, r.pdfs.tcc].forEach((url, i) => {
              const a = document.createElement("a");
              a.href = url; a.download = "";
              document.body.appendChild(a);
              setTimeout(() => { a.click(); a.remove(); }, i * 250);
            });
            qs("#canvaMsg").innerHTML = `<div class="banner ok" style="margin-top:12px">Downloaded both PDFs — import them into your Canva workspace for any last-minute edits. (Set <code>CANVA_API_KEY</code> to push directly into Canva.)</div>`;
            return;
          }
          qs("#canvaMsg").innerHTML = `<div class="banner ${r.ok ? "ok" : "warn"}" style="margin-top:12px">${esc(r.message)}</div>`;
        } catch (e) { toast(e.message); }
      });
    } catch (e) { errorView(e); }
  }
})();
