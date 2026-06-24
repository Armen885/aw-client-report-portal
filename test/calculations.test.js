const { test } = require("node:test");
const assert = require("node:assert/strict");
const Calc = require("../public/calculations");

function makeClient(overrides = {}) {
  return {
    married: true,
    client1: { firstName: "John", lastName: "Doe" },
    client2: { firstName: "Jane", lastName: "Doe" },
    monthlySalary: 15000,
    monthlyExpenseBudget: 11000,
    insuranceDeductibles: 5000,
    propertyAddress: "123 Main St",
    accounts: [
      { id: 1, owner: "client1", category: "retirement", accountType: "IRA" },
      { id: 2, owner: "client1", category: "retirement", accountType: "Roth IRA" },
      { id: 3, owner: "client2", category: "retirement", accountType: "401(k)" },
      { id: 4, owner: "joint", category: "non_retirement", accountType: "Brokerage", isInvestment: true },
      { id: 5, owner: "joint", category: "trust", accountType: "Primary Residence" },
      { id: 6, owner: "joint", category: "liability", accountType: "Mortgage", interestRate: 6.5 },
    ],
    ...overrides,
  };
}

function makeReport() {
  return {
    inflow: 15000,
    outflow: 11000,
    privateReserveBalance: 40000,
    balances: {
      1: { balance: 11000 },
      2: { balance: 15000 },
      3: { balance: 50000 },
      4: { balance: 50000, cashBalance: 5000 },
      5: { balance: 450000 },
      6: { balance: 200000 },
    },
  };
}

test("SACS excess = inflow - outflow", () => {
  assert.equal(Calc.computeReport(makeClient(), makeReport()).sacs.excess, 4000);
});

test("SACS reserve target = 6 x expenses + deductibles", () => {
  assert.equal(Calc.computeReport(makeClient(), makeReport()).sacs.privateReserveTarget, 6 * 11000 + 5000);
});

test("reserve target uses the report snapshot when present", () => {
  const report = { ...makeReport(), monthlyExpenseBudget: 9000, insuranceDeductibles: 3000 };
  assert.equal(Calc.computeReport(makeClient(), report).sacs.privateReserveTarget, 6 * 9000 + 3000);
});

test("Client 1 retirement total sums only client1 retirement accounts", () => {
  assert.equal(Calc.computeReport(makeClient(), makeReport()).tcc.client1RetirementTotal, 26000);
});

test("Client 2 retirement total sums only client2 retirement accounts", () => {
  assert.equal(Calc.computeReport(makeClient(), makeReport()).tcc.client2RetirementTotal, 50000);
});

test("single client: client2 total is 0 and all retirement folds into client1 (no money lost)", () => {
  const client = makeClient({ married: false, client2: null });
  const c = Calc.computeReport(client, makeReport());
  assert.equal(c.tcc.client2RetirementTotal, 0);
  assert.equal(c.tcc.client1RetirementTotal, 11000 + 15000 + 50000);
  assert.equal(c.tcc.grandTotalNetWorth, 76000 + 50000 + 450000);
});

test("Non-retirement total EXCLUDES the trust", () => {
  assert.equal(Calc.computeReport(makeClient(), makeReport()).tcc.nonRetirementTotal, 50000);
});

test("Grand total = c1 retirement + c2 retirement + non-retirement + trust", () => {
  assert.equal(Calc.computeReport(makeClient(), makeReport()).tcc.grandTotalNetWorth, 26000 + 50000 + 50000 + 450000);
});

test("Liabilities total is separate and NOT subtracted", () => {
  const c = Calc.computeReport(makeClient(), makeReport());
  assert.equal(c.tcc.liabilitiesTotal, 200000);
  assert.equal(c.tcc.grandTotalNetWorth, 576000);
});

test("Investment balance sums investment-flagged non-retirement accounts", () => {
  assert.equal(Calc.computeReport(makeClient(), makeReport()).sacs.investmentBalance, 50000);
});

test("missingFields flags every empty balance and the reserve balance", () => {
  const client = makeClient({ married: false, client2: null, accounts: [{ id: 1, owner: "client1", category: "retirement", accountType: "IRA" }] });
  const report = { inflow: 15000, outflow: 11000, privateReserveBalance: "", balances: { 1: { balance: "" } } };
  const ids = Calc.missingFields(client, report).map((m) => m.id);
  assert.ok(ids.includes("privateReserveBalance"));
  assert.ok(ids.includes("acct_1"));
  assert.equal(ids.includes("inflow"), false);
});

test("missingFields returns empty when all filled", () => {
  assert.equal(Calc.missingFields(makeClient(), makeReport()).length, 0);
});

test("num handles strings and comma-grouped input", () => {
  assert.equal(Calc.num("15000"), 15000);
  assert.equal(Calc.num("1,250,000"), 1250000);
  assert.equal(Calc.num(""), 0);
  assert.equal(Calc.num(null), 0);
});

test("fmtMoney rounds and groups", () => {
  assert.equal(Calc.fmtMoney(1250000.4), "$1,250,000");
  assert.equal(Calc.fmtMoney(0), "$0");
});
