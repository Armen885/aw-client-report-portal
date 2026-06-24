(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ACCOUNT_CATEGORIES = ["retirement", "non_retirement", "trust", "liability"];
  const OWNERS = ["client1", "client2", "joint"];

  function num(v) {
    if (typeof v === "string") v = v.replace(/,/g, "");
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  function fmtMoney(n) {
    return "$" + Math.round(num(n)).toLocaleString("en-US");
  }

  function fmtMoneyMo(n) {
    return fmtMoney(n) + "/mo";
  }

  function fmtPct(n) {
    if (n == null || n === "") return "";
    return Number(n).toFixed(2).replace(/\.00$/, "") + "%";
  }

  function age(dob) {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d)) return null;
    const now = new Date();
    let a = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
    return a;
  }

  function clientName(client) {
    const c1 = `${client.client1.firstName} ${client.client1.lastName}`.trim();
    if (client.married && client.client2 && client.client2.firstName) {
      const sameLast = client.client1.lastName === client.client2.lastName;
      if (sameLast) return `${client.client1.firstName} & ${client.client2.firstName} ${client.client1.lastName}`;
      return `${c1} & ${client.client2.firstName} ${client.client2.lastName}`.trim();
    }
    return c1;
  }

  function sumBalances(accounts, balances, predicate) {
    return accounts
      .filter(predicate)
      .reduce((total, acct) => total + num(balances[acct.id] && balances[acct.id].balance), 0);
  }

  function computeReport(client, report) {
    const accounts = client.accounts || [];
    const balances = report.balances || {};
    const married = !!client.married;

    const inflow = num(report.inflow != null ? report.inflow : client.monthlySalary);
    const outflow = num(report.outflow != null ? report.outflow : client.monthlyExpenseBudget);
    const excess = inflow - outflow;

    const expenseBudget = num(report.monthlyExpenseBudget != null ? report.monthlyExpenseBudget : client.monthlyExpenseBudget);
    const deductibles = num(report.insuranceDeductibles != null ? report.insuranceDeductibles : client.insuranceDeductibles);
    const privateReserveTarget = 6 * expenseBudget + deductibles;
    const privateReserveBalance = num(report.privateReserveBalance);
    const privateReserveGap = privateReserveTarget - privateReserveBalance;

    const investmentBalance = sumBalances(
      accounts,
      balances,
      (a) => a.category === "non_retirement" && a.isInvestment
    );

    const client1RetirementTotal = married
      ? sumBalances(accounts, balances, (a) => a.category === "retirement" && a.owner === "client1")
      : sumBalances(accounts, balances, (a) => a.category === "retirement");
    const client2RetirementTotal = married
      ? sumBalances(accounts, balances, (a) => a.category === "retirement" && a.owner === "client2")
      : 0;

    const nonRetirementTotal = sumBalances(accounts, balances, (a) => a.category === "non_retirement");
    const trustTotal = sumBalances(accounts, balances, (a) => a.category === "trust");

    const grandTotalNetWorth =
      client1RetirementTotal + client2RetirementTotal + nonRetirementTotal + trustTotal;

    const liabilitiesTotal = sumBalances(accounts, balances, (a) => a.category === "liability");

    return {
      sacs: {
        inflow,
        outflow,
        excess,
        privateReserveBalance,
        privateReserveTarget,
        privateReserveGap,
        investmentBalance,
      },
      tcc: {
        client1RetirementTotal,
        client2RetirementTotal,
        nonRetirementTotal,
        trustTotal,
        grandTotalNetWorth,
        liabilitiesTotal,
      },
    };
  }

  function missingFields(client, report) {
    const missing = [];
    const balances = report.balances || {};
    const has = (v) => v !== "" && v !== null && v !== undefined && Number.isFinite(parseFloat(v));

    if (!has(report.inflow)) missing.push({ id: "inflow", label: "Monthly Inflow" });
    if (!has(report.outflow)) missing.push({ id: "outflow", label: "Monthly Outflow" });
    if (!has(report.privateReserveBalance))
      missing.push({ id: "privateReserveBalance", label: "Private Reserve Balance" });

    for (const acct of client.accounts || []) {
      const b = balances[acct.id] || {};
      if (!has(b.balance)) {
        missing.push({ id: "acct_" + acct.id, label: acct.accountType + " balance" });
      }
    }
    return missing;
  }

  return {
    ACCOUNT_CATEGORIES,
    OWNERS,
    num,
    fmtMoney,
    fmtMoneyMo,
    fmtPct,
    age,
    clientName,
    computeReport,
    missingFields,
  };
});
