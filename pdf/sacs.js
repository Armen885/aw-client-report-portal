const PDFDocument = require("pdfkit");
const { COLORS, PAGE, fmtMoney, fmtMoneyMo, drawHeader, drawFooter } = require("./theme");

const CX = PAGE.width / 2;

function drawBubble(doc, cx, cy, r, fill, stroke, lines) {
  doc.save();
  doc.circle(cx, cy, r).fillAndStroke(fill, stroke);
  doc.lineWidth(2).circle(cx, cy, r).stroke(stroke);
  let totalH = 0;
  const measured = lines.map((l) => {
    doc.font(l.bold ? "Helvetica-Bold" : "Helvetica").fontSize(l.size);
    const h = doc.currentLineHeight();
    totalH += h + (l.gap || 0);
    return h;
  });
  let y = cy - totalH / 2;
  lines.forEach((l, i) => {
    doc.font(l.bold ? "Helvetica-Bold" : "Helvetica").fontSize(l.size).fillColor(l.color || COLORS.white);
    doc.text(l.text, cx - r, y, { width: r * 2, align: "center" });
    y += measured[i] + (l.gap || 0);
  });
  doc.restore();
}

function arrowDown(doc, cx, y1, y2, color, label) {
  doc.save();
  doc.lineWidth(3).strokeColor(color);
  doc.moveTo(cx, y1).lineTo(cx, y2 - 8).stroke();
  doc.fillColor(color);
  doc.moveTo(cx - 7, y2 - 9).lineTo(cx + 7, y2 - 9).lineTo(cx, y2).fill();
  if (label) {
    doc.font("Helvetica-Bold").fontSize(11).fillColor(color);
    doc.text(label.title, cx + 14, (y1 + y2) / 2 - 14, { lineBreak: false });
    if (label.value) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor(color);
      doc.text(label.value, cx + 14, (y1 + y2) / 2 + 1, { lineBreak: false });
    }
  }
  doc.restore();
}

function drawExpenseBranch(doc, cx, cy, r, amount) {
  doc.save();
  const startX = cx + r;
  const endX = cx + r + 120;
  doc.lineWidth(3).strokeColor(COLORS.outflow);
  doc.moveTo(startX, cy).lineTo(endX - 8, cy).stroke();
  doc.fillColor(COLORS.outflow);
  doc.moveTo(endX - 9, cy - 7).lineTo(endX - 9, cy + 7).lineTo(endX, cy).fill();
  doc.lineWidth(2.5).strokeColor(COLORS.outflowDark);
  const xc = (startX + endX) / 2;
  doc.moveTo(xc - 6, cy - 16).lineTo(xc + 6, cy - 4).stroke();
  doc.moveTo(xc + 6, cy - 16).lineTo(xc - 6, cy - 4).stroke();
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.outflowDark);
  doc.text("Expenses", endX - 40, cy + 10, { width: 90, align: "left", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.outflowDark);
  doc.text(fmtMoneyMo(amount), endX - 40, cy + 24, { width: 110, align: "left", lineBreak: false });
  doc.restore();
}

function page1(doc, client, calc) {
  drawHeader(doc, "SACS", "Simple Automated Cash Flow System", client, calc.reportDate);
  const s = calc.sacs;

  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.text);
  doc.text("Monthly Cash Flow", PAGE.margin, 92);
  doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.textMuted);
  doc.text("How each month's take-home pay flows through to savings.", PAGE.margin, 110);

  const r = 64;
  const inflowY = 200;
  const outflowY = 390;
  const reserveY = 590;

  drawBubble(doc, CX, inflowY, r, COLORS.inflow, COLORS.inflowDark, [
    { text: "INFLOW", size: 11, bold: true, gap: 2 },
    { text: fmtMoney(s.inflow), size: 20, bold: true, gap: 1 },
    { text: "per month", size: 9 },
  ]);
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.textMuted);
  doc.text("Take-home pay", CX - r, inflowY + r + 6, { width: r * 2, align: "center" });

  arrowDown(doc, CX, inflowY + r + 22, outflowY - r, COLORS.gray, null);

  drawBubble(doc, CX, outflowY, r, COLORS.outflow, COLORS.outflowDark, [
    { text: "OUTFLOW", size: 11, bold: true, gap: 2 },
    { text: fmtMoney(s.outflow), size: 20, bold: true, gap: 1 },
    { text: "per month", size: 9 },
  ]);
  drawExpenseBranch(doc, CX, outflowY, r, s.outflow);

  arrowDown(doc, CX, outflowY + r + 4, reserveY - r, COLORS.reserve, {
    title: "Excess",
    value: fmtMoneyMo(s.excess),
  });

  drawBubble(doc, CX, reserveY, r, COLORS.reserve, COLORS.reserveDark, [
    { text: "PRIVATE", size: 11, bold: true, gap: 0 },
    { text: "RESERVE", size: 11, bold: true, gap: 2 },
    { text: fmtMoney(s.excess), size: 18, bold: true, gap: 1 },
    { text: "added/mo", size: 9 },
  ]);
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.textMuted);
  doc.text("Excess savings accumulate here", CX - r - 30, reserveY + r + 6, {
    width: r * 2 + 60,
    align: "center",
  });

  drawFooter(doc);
}

function statCard(doc, x, y, w, h, label, value, accent) {
  doc.save();
  doc.roundedRect(x, y, w, h, 8).fillAndStroke(COLORS.grayBox, COLORS.grayBoxBorder);
  doc.rect(x, y, 5, h).fill(accent);
  doc.font("Helvetica").fontSize(10).fillColor(COLORS.textMuted);
  doc.text(label, x + 16, y + 14, { width: w - 28 });
  doc.font("Helvetica-Bold").fontSize(20).fillColor(COLORS.text);
  doc.text(value, x + 16, y + 32, { width: w - 28 });
  doc.restore();
}

function page2(doc, client, calc) {
  doc.addPage();
  drawHeader(doc, "SACS", "Private Reserve Detail", client, calc.reportDate);
  const s = calc.sacs;

  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.text);
  doc.text("Private Reserve & Investments", PAGE.margin, 92);

  const x = PAGE.margin;
  const w = PAGE.width - PAGE.margin * 2;
  const colW = (w - 16) / 2;
  let y = 130;

  statCard(doc, x, y, colW, 80, "Private Reserve Balance", fmtMoney(s.privateReserveBalance), COLORS.reserve);
  statCard(doc, x + colW + 16, y, colW, 80, "Target Savings", fmtMoney(s.privateReserveTarget), COLORS.brand);

  y += 100;
  statCard(doc, x, y, colW, 80, "Investment Balance (Schwab)", fmtMoney(s.investmentBalance), COLORS.trust);
  const gapLabel = s.privateReserveGap > 0 ? "Remaining to Target" : "Surplus Over Target";
  statCard(doc, x + colW + 16, y, colW, 80, gapLabel, fmtMoney(Math.abs(s.privateReserveGap)), s.privateReserveGap > 0 ? COLORS.outflow : COLORS.inflow);

  y += 120;
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.text);
  doc.text("Progress Toward Reserve Target", x, y);
  y += 20;
  const barW = w;
  const pct = s.privateReserveTarget > 0 ? Math.min(1, s.privateReserveBalance / s.privateReserveTarget) : 0;
  doc.roundedRect(x, y, barW, 22, 11).fillAndStroke(COLORS.grayBox, COLORS.grayBoxBorder);
  if (pct > 0) {
    doc.roundedRect(x, y, Math.max(22, barW * pct), 22, 11).fill(COLORS.reserve);
  }
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.text);
  doc.text(Math.round(pct * 100) + "% of target", x, y + 30);

  doc.font("Helvetica").fontSize(9).fillColor(COLORS.textMuted);
  doc.text("Target = 6 months of monthly expenses + all insurance deductibles.", x, y + 50, { width: w });

  drawFooter(doc);
}

function generateSacs(client, calc) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "letter", margin: PAGE.margin, autoFirstPage: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      page1(doc, client, calc);
      page2(doc, client, calc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateSacs };
