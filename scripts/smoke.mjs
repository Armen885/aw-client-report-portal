const BASE = "http://localhost:3000";
const j = async (m, u, b) => {
  const r = await fetch(BASE + u, b ? { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) } : { method: m });
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { d = t; }
  if (!r.ok) throw new Error(`${m} ${u} -> ${r.status}: ${t}`);
  return d;
};

const client = await j("POST", "/api/clients", {
  client1: { firstName: "John", lastName: "Carter", dob: "1972-05-14", ssnLast4: "1234" },
  married: true,
  client2: { firstName: "Mary", lastName: "Carter", dob: "1975-09-02", ssnLast4: "5678" },
  monthlySalary: 15000, monthlyExpenseBudget: 11000, insuranceDeductibles: 5000,
  propertyAddress: "88 Peachtree Rd, Atlanta GA",
  accounts: [
    { owner: "client1", category: "retirement", accountType: "IRA", lastFour: "1111" },
    { owner: "client1", category: "retirement", accountType: "Roth IRA", lastFour: "2222" },
    { owner: "client2", category: "retirement", accountType: "401(k)", lastFour: "3333" },
    { owner: "joint", category: "non_retirement", accountType: "Brokerage", lastFour: "4444", isInvestment: true },
    { owner: "joint", category: "trust", accountType: "Primary Residence" },
    { owner: "joint", category: "liability", accountType: "Mortgage", lastFour: "9999", interestRate: 6.5 },
  ],
});
console.log("created client", client.id, "-", client.accounts.length, "accounts");

const acct = (type) => client.accounts.find((a) => a.accountType === type).id;
const report = await j("POST", `/api/clients/${client.id}/reports`, {
  reportDate: "2026-06-30",
  inflow: 15000, outflow: 11000, privateReserveBalance: 42000,
  balances: {
    [acct("IRA")]: { balance: 11000 },
    [acct("Roth IRA")]: { balance: 15000 },
    [acct("401(k)")]: { balance: 50000 },
    [acct("Brokerage")]: { balance: 50000, cashBalance: 5000 },
    [acct("Primary Residence")]: { balance: 450000 },
    [acct("Mortgage")]: { balance: 200000 },
  },
});
const t = report.calc.tcc, s = report.calc.sacs;
console.log("report", report.report.id, "| net worth", t.grandTotalNetWorth, "| excess/mo", s.excess);

const assert = (cond, msg) => { if (!cond) throw new Error("ASSERT FAIL: " + msg); };
assert(s.excess === 4000, "excess");
assert(s.privateReserveTarget === 71000, "reserve target");
assert(t.client1RetirementTotal === 26000, "c1 retirement");
assert(t.client2RetirementTotal === 50000, "c2 retirement");
assert(t.nonRetirementTotal === 50000, "non-retirement excludes trust");
assert(t.trustTotal === 450000, "trust");
assert(t.grandTotalNetWorth === 576000, "grand total");
assert(t.liabilitiesTotal === 200000, "liabilities separate");
console.log("all calculation assertions passed");

let rejected = false;
try {
  await j("POST", `/api/clients/${client.id}/reports`, { reportDate: "2026-06-30", inflow: 15000, outflow: 11000, privateReserveBalance: "", balances: {} });
} catch { rejected = true; }
assert(rejected, "incomplete report should be rejected");
console.log("incomplete report correctly rejected");

for (const kind of ["sacs", "tcc"]) {
  const r = await fetch(`${BASE}/api/reports/${report.report.id}/${kind}.pdf`);
  const buf = Buffer.from(await r.arrayBuffer());
  assert(r.ok && buf.slice(0, 5).toString() === "%PDF-", `${kind} pdf`);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`./data/${kind}.pdf`, buf);
  console.log(`${kind.toUpperCase()} PDF generated (${buf.length} bytes) -> data/${kind}.pdf`);
}

console.log("\nALL SMOKE TESTS PASSED");
