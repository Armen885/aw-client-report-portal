const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

const DB_PATH = process.env.RAILWAY_DATABASE_PATH || path.join(__dirname, "data", "portal.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
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
`);

function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn("reports", "monthly_expense_budget", "monthly_expense_budget REAL");
ensureColumn("reports", "insurance_deductibles", "insurance_deductibles REAL");

function mapAccount(row) {
  return {
    id: row.id,
    owner: row.owner,
    category: row.category,
    accountType: row.account_type,
    lastFour: row.last_four,
    interestRate: row.interest_rate,
    isInvestment: !!row.is_investment,
    sortOrder: row.sort_order,
  };
}

function mapClient(row, accounts) {
  return {
    id: row.id,
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

function getAccountsForClient(clientId) {
  return db
    .prepare("SELECT * FROM accounts WHERE client_id = ? ORDER BY sort_order, id")
    .all(clientId)
    .map(mapAccount);
}

const insertAccountStmt = db.prepare(`
  INSERT INTO accounts (client_id, owner, category, account_type, last_four, interest_rate, is_investment, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

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

function listClients() {
  const rows = db.prepare("SELECT * FROM clients ORDER BY client1_last, client1_first").all();
  return rows.map((row) => {
    const last = db
      .prepare("SELECT report_date FROM reports WHERE client_id = ? ORDER BY report_date DESC, id DESC LIMIT 1")
      .get(row.id);
    const client = mapClient(row, []);
    client.lastReportDate = last ? last.report_date : null;
    client.reportCount = db.prepare("SELECT COUNT(*) c FROM reports WHERE client_id = ?").get(row.id).c;
    return client;
  });
}

function getClient(id) {
  const row = db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
  if (!row) return null;
  return mapClient(row, getAccountsForClient(id));
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

function createClient(data) {
  const placeholders = clientCols.map(() => "?").join(", ");
  const info = db
    .prepare(`INSERT INTO clients (${clientCols.join(", ")}) VALUES (${placeholders})`)
    .run(...clientArgs(data));
  const clientId = info.lastInsertRowid;
  (data.accounts || []).forEach((a, i) => insertAccountStmt.run(...accountArgs(clientId, a, i)));
  return getClient(clientId);
}

function updateClient(id, data) {
  const setClause = clientCols.map((c) => `${c} = ?`).join(", ");
  db.prepare(`UPDATE clients SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(
    ...clientArgs(data),
    id
  );

  const incomingIds = new Set((data.accounts || []).filter((a) => a.id).map((a) => Number(a.id)));
  for (const row of db.prepare("SELECT id FROM accounts WHERE client_id = ?").all(id)) {
    if (!incomingIds.has(row.id)) db.prepare("DELETE FROM accounts WHERE id = ?").run(row.id);
  }
  const updateStmt = db.prepare(
    "UPDATE accounts SET owner=?, category=?, account_type=?, last_four=?, interest_rate=?, is_investment=?, sort_order=? WHERE id=?"
  );
  (data.accounts || []).forEach((a, i) => {
    const args = accountArgs(id, a, i);
    if (a.id && incomingIds.has(Number(a.id))) {
      updateStmt.run(...args.slice(1), Number(a.id));
    } else {
      insertAccountStmt.run(...args);
    }
  });

  return getClient(id);
}

function deleteClient(id) {
  db.prepare("DELETE FROM clients WHERE id = ?").run(id);
}

function mapReport(row) {
  const balRows = db.prepare("SELECT * FROM balances WHERE report_id = ?").all(row.id);
  const balances = {};
  for (const b of balRows) {
    balances[b.account_id] = { balance: b.balance, cashBalance: b.cash_balance };
  }
  return {
    id: row.id,
    clientId: row.client_id,
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

function getReport(id) {
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
  return row ? mapReport(row) : null;
}

function listReports(clientId) {
  return db
    .prepare("SELECT * FROM reports WHERE client_id = ? ORDER BY report_date DESC, id DESC")
    .all(clientId)
    .map(mapReport);
}

function latestReport(clientId) {
  const row = db
    .prepare("SELECT * FROM reports WHERE client_id = ? ORDER BY report_date DESC, id DESC LIMIT 1")
    .get(clientId);
  return row ? mapReport(row) : null;
}

function createReport(clientId, data, client) {
  const info = db
    .prepare(
      `INSERT INTO reports
         (client_id, report_date, inflow, outflow, private_reserve_balance, monthly_expense_budget, insurance_deductibles)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      clientId,
      data.reportDate,
      Number(data.inflow) || 0,
      Number(data.outflow) || 0,
      Number(data.privateReserveBalance) || 0,
      client ? Number(client.monthlyExpenseBudget) || 0 : null,
      client ? Number(client.insuranceDeductibles) || 0 : null
    );
  const reportId = info.lastInsertRowid;
  const stmt = db.prepare(
    "INSERT INTO balances (report_id, account_id, balance, cash_balance) VALUES (?, ?, ?, ?)"
  );
  const balances = data.balances || {};
  for (const accountId of Object.keys(balances)) {
    const b = balances[accountId];
    stmt.run(
      reportId,
      Number(accountId),
      Number(b.balance) || 0,
      b.cashBalance != null && b.cashBalance !== "" ? Number(b.cashBalance) : null
    );
  }
  return getReport(reportId);
}

function deleteReport(id) {
  db.prepare("DELETE FROM reports WHERE id = ?").run(id);
}

module.exports = {
  db,
  DB_PATH,
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
