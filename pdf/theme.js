const Calc = require("../public/calculations");

const COLORS = {
  brand: "#1d3f72",
  brandDark: "#142d52",
  brandLight: "#e8eef7",
  inflow: "#2e9e5b",
  inflowDark: "#1f6e3f",
  outflow: "#d24a43",
  outflowDark: "#9c322c",
  reserve: "#2f6fb0",
  reserveDark: "#1d4d80",
  trust: "#7a5cc0",
  gray: "#5b6470",
  grayBox: "#eef1f5",
  grayBoxBorder: "#cdd5df",
  text: "#1f2733",
  textMuted: "#6b7480",
  white: "#ffffff",
  line: "#c4ccd6",
};

const PAGE = { width: 612, height: 792, margin: 48 };

const { fmtMoney, fmtMoneyMo, fmtPct, age, clientName } = Calc;

function drawHeader(doc, title, subtitle, client, reportDate) {
  const { margin, width } = PAGE;
  doc.save();
  doc.rect(0, 0, width, 70).fill(COLORS.brand);
  doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(18).text(title, margin, 20);
  doc.font("Helvetica").fontSize(10).fillColor("#cdd9ec").text(subtitle, margin, 44);

  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.white).text(clientName(client), width / 2, 24, {
    width: width / 2 - margin,
    align: "right",
  });
  const dateStr = new Date(reportDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.font("Helvetica").fontSize(10).fillColor("#cdd9ec").text(dateStr, width / 2, 44, {
    width: width / 2 - margin,
    align: "right",
  });
  doc.restore();
}

function drawFooter(doc) {
  const { margin, width, height } = PAGE;
  doc.save();
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.textMuted);
  doc.text("Windbrook Solutions · Confidential — prepared for client review", margin, height - 32, {
    width: width - margin * 2,
    align: "center",
  });
  doc.restore();
}

module.exports = { COLORS, PAGE, fmtMoney, fmtMoneyMo, fmtPct, age, clientName, drawHeader, drawFooter };
