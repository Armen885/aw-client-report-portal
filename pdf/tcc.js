const PDFDocument = require("pdfkit");
const { COLORS, PAGE, fmtMoney, fmtPct, age, drawHeader, drawFooter } = require("./theme");
const { num } = require("../public/calculations");

const X0 = PAGE.margin;
const W = PAGE.width - PAGE.margin * 2;
const BOTTOM = PAGE.height - 48;

function ensureSpace(doc, cursor, h) {
  if (cursor.y + h > BOTTOM) {
    drawFooter(doc);
    doc.addPage();
    drawHeader(doc, "TCC", "Total Client Chart — continued", cursor.client, cursor.reportDate);
    cursor.y = 92;
  }
}

function sectionHeading(doc, cursor, text) {
  ensureSpace(doc, cursor, 34);
  doc.save();
  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.brand);
  doc.text(text, X0, cursor.y);
  doc.moveTo(X0, cursor.y + 18).lineTo(X0 + W, cursor.y + 18).lineWidth(1).strokeColor(COLORS.line).stroke();
  doc.restore();
  cursor.y += 30;
}

function subHeading(doc, cursor, text) {
  ensureSpace(doc, cursor, 20);
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COLORS.text).text(text, X0, cursor.y);
  cursor.y += 18;
}

function accountBubble(doc, x, y, w, h, account, bal) {
  doc.save();
  doc.roundedRect(x, y, w, h, 8).fillAndStroke(COLORS.white, COLORS.grayBoxBorder);
  doc.rect(x, y, w, 4).fill(account.category === "non_retirement" ? COLORS.reserve : COLORS.brand);
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLORS.text);
  doc.text(account.accountType || "Account", x + 10, y + 10, { width: w - 20, ellipsis: true, lineBreak: false });
  if (account.lastFour) {
    doc.font("Helvetica").fontSize(8).fillColor(COLORS.textMuted);
    doc.text("••" + account.lastFour, x + 10, y + 23, { width: w - 20, lineBreak: false });
  }
  doc.font("Helvetica-Bold").fontSize(15).fillColor(COLORS.text);
  doc.text(fmtMoney(num(bal.balance)), x + 10, y + 36, { width: w - 20, lineBreak: false });
  if (account.isInvestment && bal.cashBalance != null && bal.cashBalance !== "") {
    doc.font("Helvetica").fontSize(8).fillColor(COLORS.textMuted);
    doc.text("Cash: " + fmtMoney(num(bal.cashBalance)), x + 10, y + 55, { width: w - 20, lineBreak: false });
  }
  doc.restore();
}

function bubbleGrid(doc, cursor, accounts, balances) {
  const N = 3;
  const gap = 12;
  const bw = (W - gap * (N - 1)) / N;
  const bh = 72;
  for (let i = 0; i < accounts.length; i += N) {
    ensureSpace(doc, cursor, bh + 10);
    const row = accounts.slice(i, i + N);
    row.forEach((acct, j) => {
      const x = X0 + j * (bw + gap);
      accountBubble(doc, x, cursor.y, bw, bh, acct, balances[acct.id] || {});
    });
    cursor.y += bh + 10;
  }
  if (accounts.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(COLORS.textMuted);
    doc.text("None", X0, cursor.y);
    cursor.y += 16;
  }
}

function summaryBox(doc, cursor, label, value, opts = {}) {
  const h = opts.prominent ? 56 : 40;
  ensureSpace(doc, cursor, h + 10);
  const fill = opts.prominent ? COLORS.brand : COLORS.grayBox;
  const border = opts.prominent ? COLORS.brandDark : COLORS.grayBoxBorder;
  const labelColor = opts.prominent ? "#cdd9ec" : COLORS.textMuted;
  const valueColor = opts.prominent ? COLORS.white : COLORS.text;
  doc.save();
  doc.roundedRect(X0, cursor.y, W, h, 6).fillAndStroke(fill, border);
  doc.font("Helvetica-Bold").fontSize(opts.prominent ? 12 : 10).fillColor(labelColor);
  doc.text(label, X0 + 16, cursor.y + (opts.prominent ? 12 : 8), { width: W - 200, lineBreak: false });
  if (opts.note) {
    doc.font("Helvetica").fontSize(8).fillColor(labelColor);
    doc.text(opts.note, X0 + 16, cursor.y + (opts.prominent ? 32 : 24), { width: W - 200, lineBreak: false });
  }
  doc.font("Helvetica-Bold").fontSize(opts.prominent ? 22 : 15).fillColor(valueColor);
  doc.text(value, X0 + W - 216, cursor.y + (opts.prominent ? 14 : 10), { width: 200, align: "right", lineBreak: false });
  doc.restore();
  cursor.y += h + 12;
}

function clientInfoBubbles(doc, cursor, client) {
  const people = [{ p: client.client1 }];
  if (client.married && client.client2) people.push({ p: client.client2 });
  const gap = 16;
  const bw = people.length === 2 ? (W - gap) / 2 : W;
  const bh = 64;
  ensureSpace(doc, cursor, bh + 8);
  people.forEach((entry, i) => {
    const x = X0 + i * (bw + gap);
    const { p } = entry;
    doc.save();
    doc.roundedRect(x, cursor.y, bw, bh, 10).fillAndStroke("#eaf5ee", COLORS.inflow);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.inflowDark);
    doc.text(`${p.firstName} ${p.lastName}`.trim(), x + 14, cursor.y + 12, { width: bw - 28, lineBreak: false });
    const a = age(p.dob);
    const bits = [];
    if (a != null) bits.push(`Age ${a}`);
    if (p.dob) bits.push(`DOB ${new Date(p.dob).toLocaleDateString("en-US")}`);
    if (p.ssnLast4) bits.push(`SSN ••••${p.ssnLast4}`);
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray);
    doc.text(bits.join("   ·   "), x + 14, cursor.y + 34, { width: bw - 28, lineBreak: false });
    doc.restore();
  });
  cursor.y += bh + 16;
}

function trustSection(doc, cursor, client, report) {
  const trustAccts = (client.accounts || []).filter((a) => a.category === "trust");
  if (trustAccts.length === 0) return;
  sectionHeading(doc, cursor, "Trust");
  trustAccts.forEach((acct) => {
    const bal = (report.balances && report.balances[acct.id]) || {};
    const h = 56;
    ensureSpace(doc, cursor, h + 10);
    doc.save();
    doc.roundedRect(X0, cursor.y, W, h, 8).fillAndStroke("#f1edfa", COLORS.trust);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.trust);
    doc.text(acct.accountType || "Trust", X0 + 16, cursor.y + 10, { lineBreak: false });
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray);
    doc.text(client.propertyAddress || "Primary residence", X0 + 16, cursor.y + 28, { width: W - 220, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(18).fillColor(COLORS.text);
    doc.text(fmtMoney(num(bal.balance)), X0 + W - 216, cursor.y + 18, { width: 200, align: "right", lineBreak: false });
    doc.restore();
    cursor.y += h + 12;
  });
}

function liabilitiesSection(doc, cursor, client, report, calc) {
  const liabilities = (client.accounts || []).filter((a) => a.category === "liability");
  sectionHeading(doc, cursor, "Liabilities");
  if (liabilities.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(COLORS.textMuted).text("None", X0, cursor.y);
    cursor.y += 16;
  }
  liabilities.forEach((acct) => {
    const bal = (report.balances && report.balances[acct.id]) || {};
    const h = 40;
    ensureSpace(doc, cursor, h + 8);
    doc.save();
    doc.roundedRect(X0, cursor.y, W, h, 6).fillAndStroke(COLORS.white, COLORS.grayBoxBorder);
    doc.rect(X0, cursor.y, 4, h).fill(COLORS.outflow);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.text);
    doc.text(acct.accountType || "Liability", X0 + 14, cursor.y + 8, { lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.textMuted);
    const meta = [];
    if (acct.lastFour) meta.push("••" + acct.lastFour);
    if (acct.interestRate != null && acct.interestRate !== "") meta.push(fmtPct(acct.interestRate) + " APR");
    doc.text(meta.join("   ·   "), X0 + 14, cursor.y + 23, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(14).fillColor(COLORS.outflowDark);
    doc.text(fmtMoney(num(bal.balance)), X0 + W - 216, cursor.y + 11, { width: 200, align: "right", lineBreak: false });
    doc.restore();
    cursor.y += h + 8;
  });
  summaryBox(doc, cursor, "Liabilities Total", fmtMoney(calc.tcc.liabilitiesTotal), {
    note: "Shown separately — NOT subtracted from net worth",
  });
}

function generateTcc(client, report, calc) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "letter", margin: PAGE.margin, autoFirstPage: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      drawHeader(doc, "TCC", "Total Client Chart — Net Worth Overview", client, calc.reportDate);
      const cursor = { y: 88, client, reportDate: calc.reportDate };
      const balances = report.balances || {};
      const accts = client.accounts || [];

      clientInfoBubbles(doc, cursor, client);

      sectionHeading(doc, cursor, "Retirement Accounts");
      subHeading(doc, cursor, `${client.client1.firstName || "Client 1"} — Retirement`);
      bubbleGrid(doc, cursor, accts.filter((a) => a.category === "retirement" && a.owner === "client1"), balances);
      summaryBox(doc, cursor, "Client 1 Retirement Total", fmtMoney(calc.tcc.client1RetirementTotal));

      if (client.married && client.client2) {
        subHeading(doc, cursor, `${client.client2.firstName || "Client 2"} — Retirement`);
        bubbleGrid(doc, cursor, accts.filter((a) => a.category === "retirement" && a.owner === "client2"), balances);
        summaryBox(doc, cursor, "Client 2 Retirement Total", fmtMoney(calc.tcc.client2RetirementTotal));
      }

      sectionHeading(doc, cursor, "Non-Retirement Accounts");
      bubbleGrid(doc, cursor, accts.filter((a) => a.category === "non_retirement"), balances);
      summaryBox(doc, cursor, "Non-Retirement Total", fmtMoney(calc.tcc.nonRetirementTotal), { note: "Excludes trust" });

      trustSection(doc, cursor, client, report);

      summaryBox(doc, cursor, "Grand Total Net Worth", fmtMoney(calc.tcc.grandTotalNetWorth), {
        prominent: true,
        note: "Retirement + Non-Retirement + Trust",
      });

      liabilitiesSection(doc, cursor, client, report, calc);

      drawFooter(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateTcc };
