const { createClient: createLibsqlClient } = require("@libsql/client");
const path = require("path");
const fs = require("fs");

function makeClient() {
  if (process.env.TURSO_DATABASE_URL) {
    return createLibsqlClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  const file = process.env.RAILWAY_DATABASE_PATH || path.join(__dirname, "data", "portal.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return createLibsqlClient({ url: "file:" + file });
}

const db = makeClient();
const DB_TARGET = process.env.TURSO_DATABASE_URL || "file:./data/portal.db";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client1_first TEXT NOT NULL,
    client1_last TEXT NOT NULL,
    client1_dob TEXT,
    client1_ssn_last4 TEXT,
    married INTEGER NOT NULL DEFAULT 0,
    client2_first TEXT,
    client2_last TEXT,
    client2_dob TEXT,
    client2_ssn_last4 TEXT,
    monthly_salary REAL NOT NULL DEFAULT 0,
    monthly_expense_budget REAL NOT NULL DEFAULT 0,
    insurance_deductibles REAL NOT NULL DEFAULT 0,
    property_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    owner TEXT NOT NULL,
    category TEXT NOT NULL,
    account_type TEXT NOT NULL,
    last_four TEXT,
    interest_rate REAL,
    is_investment INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    report_date TEXT NOT NULL,
    inflow REAL NOT NULL DEFAULT 0,
    outflow REAL NOT NULL DEFAULT 0,
    private_reserve_balance REAL NOT NULL DEFAULT 0,
    monthly_expense_budget REAL,
    insurance_deductibles REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    balance REAL NOT NULL DEFAULT 0,
    cash_balance REAL
  );
  CREATE INDEX IF NOT EXISTS idx_accounts_client ON accounts(client_id);
  CREATE INDEX IF NOT EXISTS idx_reports_client ON reports(client_id);
  CREATE INDEX IF NOT EXISTS idx_balances_report ON balances(report_id);
`;

let readyPromise;
function ready() {
  if (!readyPromise) readyPromise = init();
  return readyPromise;
}

async function init() {
  await db.executeMultiple(SCHEMA);
  const cols = (await db.execute("PRAGMA table_info(reports)")).rows.map((r) => r.name);
  if (!cols.includes("monthly_expense_budget")) await db.execute("ALTER TABLE reports ADD COLUMN monthly_expense_budget REAL");
  if (!cols.includes("insurance_deductibles")) await db.execute("ALTER TABLE reports ADD COLUMN insurance_deductibles REAL");
}

const run = (sql, args = []) => db.execute({ sql, args });
const rows = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const one = async (sql, args = []) => (await db.execute({ sql, args })).rows[0] || null;
const id = (result) => Number(result.lastInsertRowid);

function mapAccount(row) {
  return {
    id: Number(row.id),
    owner: row.owner,
    category: row.category,
    accountType: row.account_type,
    lastFour: row.last_four,
    interestRate: row.interest_rate,
    isInvestment: !!row.is_investment,
    sortOrder: Number(row.sort_order),
  };
}

function mapClient(row, accounts) {
  return {
    id: Number(row.id),
    client1: {
      firstName: row.client1_first,
      lastName: row.client1_last,
      dob: row.client1_dob,
      ssnLast4: row.client1_ssn_last4,
    },
    married: !!row.married,
    client2: row.married
      ? {
          firstName: row.client2_first,
          lastName: row.client2_last,
          dob: row.client2_dob,
          ssnLast4: row.client2_ssn_last4,
        }
      : null,
    monthlySalary: row.monthly_salary,
    monthlyExpenseBudget: row.monthly_expense_budget,
    insuranceDeductibles: row.insurance_deductibles,
    propertyAddress: row.property_address,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    accounts: accounts || [],
  };
}

async function getAccountsForClient(clientId) {
  return (await rows("SELECT * FROM accounts WHERE client_id = ? ORDER BY sort_order, id", [clientId])).map(mapAccount);
}

const insertAccountSql = `
  INSERT INTO accounts (client_id, owner, category, account_type, last_four, interest_rate, is_investment, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

function accountArgs(clientId, a, index) {
  const rate = a.interestRate != null && a.interestRate !== "" ? Number(a.interestRate) : null;
  return [
    clientId,
    a.owner || "client1",
    a.category,
    a.accountType || "",
    a.lastFour || null,
    rate,
    a.isInvestment ? 1 : 0,
    a.sortOrder != null ? a.sortOrder : index,
  ];
}

async function listClients() {
  await ready();
  const out = [];
  for (const row of await rows("SELECT * FROM clients ORDER BY client1_last, client1_first")) {
    const last = await one("SELECT report_date FROM reports WHERE client_id = ? ORDER BY report_date DESC, id DESC LIMIT 1", [row.id]);
    const count = await one("SELECT COUNT(*) c FROM reports WHERE client_id = ?", [row.id]);
    const client = mapClient(row, []);
    client.lastReportDate = last ? last.report_date : null;
    client.reportCount = Number(count.c);
    out.push(client);
  }
  return out;
}

async function getClient(clientId) {
  await ready();
  const row = await one("SELECT * FROM clients WHERE id = ?", [clientId]);
  if (!row) return null;
  return mapClient(row, await getAccountsForClient(Number(row.id)));
}

const clientCols = [
  "client1_first", "client1_last", "client1_dob", "client1_ssn_last4", "married",
  "client2_first", "client2_last", "client2_dob", "client2_ssn_last4",
  "monthly_salary", "monthly_expense_budget", "insurance_deductibles", "property_address",
];

function clientArgs(data) {
  const married = data.married ? 1 : 0;
  const c2 = data.married && data.client2 ? data.client2 : {};
  return [
    data.client1.firstName,
    data.client1.lastName,
    data.client1.dob || null,
    data.client1.ssnLast4 || null,
    married,
    married ? c2.firstName : null,
    married ? c2.lastName : null,
    married ? c2.dob || null : null,
    married ? c2.ssnLast4 || null : null,
    Number(data.monthlySalary) || 0,
    Number(data.monthlyExpenseBudget) || 0,
    Number(data.insuranceDeductibles) || 0,
    data.propertyAddress || null,
  ];
}

async function createClient(data) {
  await ready();
  const placeholders = clientCols.map(() => "?").join(", ");
  const res = await run(`INSERT INTO clients (${clientCols.join(", ")}) VALUES (${placeholders})`, clientArgs(data));
  const clientId = id(res);
  const accts = data.accounts || [];
  if (accts.length) {
    await db.batch(accts.map((a, i) => ({ sql: insertAccountSql, args: accountArgs(clientId, a, i) })), "write");
  }
  return getClient(clientId);
}

async function updateClient(clientId, data) {
  await ready();
  const setClause = clientCols.map((c) => `${c} = ?`).join(", ");
  await run(`UPDATE clients SET ${setClause}, updated_at = datetime('now') WHERE id = ?`, [...clientArgs(data), clientId]);

  const incomingIds = new Set((data.accounts || []).filter((a) => a.id).map((a) => Number(a.id)));
  const existing = await rows("SELECT id FROM accounts WHERE client_id = ?", [clientId]);
  const stmts = [];
  for (const row of existing) {
    if (!incomingIds.has(Number(row.id))) stmts.push({ sql: "DELETE FROM accounts WHERE id = ?", args: [row.id] });
  }
  (data.accounts || []).forEach((a, i) => {
    const args = accountArgs(clientId, a, i);
    if (a.id && incomingIds.has(Number(a.id))) {
      stmts.push({
        sql: "UPDATE accounts SET owner=?, category=?, account_type=?, last_four=?, interest_rate=?, is_investment=?, sort_order=? WHERE id=?",
        args: [...args.slice(1), Number(a.id)],
      });
    } else {
      stmts.push({ sql: insertAccountSql, args });
    }
  });
  if (stmts.length) await db.batch(stmts, "write");

  return getClient(clientId);
}

async function deleteClient(clientId) {
  await ready();
  await run("DELETE FROM clients WHERE id = ?", [clientId]);
}

async function mapReport(row) {
  const balRows = await rows("SELECT * FROM balances WHERE report_id = ?", [row.id]);
  const balances = {};
  for (const b of balRows) {
    balances[Number(b.account_id)] = { balance: b.balance, cashBalance: b.cash_balance };
  }
  return {
    id: Number(row.id),
    clientId: Number(row.client_id),
    reportDate: row.report_date,
    inflow: row.inflow,
    outflow: row.outflow,
    privateReserveBalance: row.private_reserve_balance,
    monthlyExpenseBudget: row.monthly_expense_budget,
    insuranceDeductibles: row.insurance_deductibles,
    createdAt: row.created_at,
    balances,
  };
}

async function getReport(reportId) {
  await ready();
  const row = await one("SELECT * FROM reports WHERE id = ?", [reportId]);
  return row ? mapReport(row) : null;
}

async function listReports(clientId) {
  await ready();
  const result = await rows("SELECT * FROM reports WHERE client_id = ? ORDER BY report_date DESC, id DESC", [clientId]);
  return Promise.all(result.map(mapReport));
}

async function latestReport(clientId) {
  await ready();
  const row = await one("SELECT * FROM reports WHERE client_id = ? ORDER BY report_date DESC, id DESC LIMIT 1", [clientId]);
  return row ? mapReport(row) : null;
}

async function createReport(clientId, data, client) {
  await ready();
  const res = await run(
    `INSERT INTO reports (client_id, report_date, inflow, outflow, private_reserve_balance, monthly_expense_budget, insurance_deductibles)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      clientId,
      data.reportDate,
      Number(data.inflow) || 0,
      Number(data.outflow) || 0,
      Number(data.privateReserveBalance) || 0,
      client ? Number(client.monthlyExpenseBudget) || 0 : null,
      client ? Number(client.insuranceDeductibles) || 0 : null,
    ]
  );
  const reportId = id(res);
  const balances = data.balances || {};
  const stmts = Object.keys(balances).map((accountId) => {
    const b = balances[accountId];
    return {
      sql: "INSERT INTO balances (report_id, account_id, balance, cash_balance) VALUES (?, ?, ?, ?)",
      args: [
        reportId,
        Number(accountId),
        Number(b.balance) || 0,
        b.cashBalance != null && b.cashBalance !== "" ? Number(b.cashBalance) : null,
      ],
    };
  });
  if (stmts.length) await db.batch(stmts, "write");
  return getReport(reportId);
}

async function deleteReport(reportId) {
  await ready();
  await run("DELETE FROM reports WHERE id = ?", [reportId]);
}

module.exports = {
  db,
  ready,
  DB_TARGET,
  listClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  getReport,
  listReports,
  latestReport,
  createReport,
  deleteReport,
};
