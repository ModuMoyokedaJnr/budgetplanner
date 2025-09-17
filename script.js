/* ============
  script.js
  Full functionality:
  - Chart of Accounts + persistence
  - Transactions (double-entry) + persistence + daily pie charts + all-time chart
  - Excel import for transactions
  - Stock management with Opening, Closing, auto roll-over, stock history, persistence
  - Stock report (working out) + Excel/PDF download
  - Shift reconciliation + PDF/Word download
  ============ */

/* ======= State & Persistence Keys ======= */
const KEY_ACCOUNTS = "pp_accounts_v1";
const KEY_TRANSACTIONS = "pp_transactions_v1";
const KEY_STOCK = "pp_stock_v1";            // array of stock items with opening, qty, price, closing
const KEY_STOCK_HISTORY = "pp_stock_hist_v1"; // array of {date,item,opening,closing,consumed,valueOpening,valueClosing}
const KEY_SHIFT = "pp_shift_v1";

let accounts = [];
let transactions = [];
let stock = [];
let stockHistory = []; // historical closing entries
let charts = [];
let allTimeChart = null;
let shiftReport = {};
let cashOnHand = 0;


/* ======= Helpers: load/save state ======= */
function saveAll() {
  localStorage.setItem(KEY_ACCOUNTS, JSON.stringify(accounts));
  localStorage.setItem(KEY_TRANSACTIONS, JSON.stringify(transactions));
  localStorage.setItem(KEY_STOCK, JSON.stringify(stock));
  localStorage.setItem(KEY_STOCK_HISTORY, JSON.stringify(stockHistory));
  localStorage.setItem(KEY_SHIFT, JSON.stringify(shiftReport));
}

function loadAll() {
  try {
    accounts = JSON.parse(localStorage.getItem(KEY_ACCOUNTS)) || [];
    transactions = JSON.parse(localStorage.getItem(KEY_TRANSACTIONS)) || [];
    stock = JSON.parse(localStorage.getItem(KEY_STOCK)) || [];
    stockHistory = JSON.parse(localStorage.getItem(KEY_STOCK_HISTORY)) || [];
    shiftReport = JSON.parse(localStorage.getItem(KEY_SHIFT)) || {};
  } catch (e) {
    console.warn("Failed to load saved data:", e);
    accounts = transactions = stock = stockHistory = [];
    shiftReport = {};
  }
}

/* ======= Initialization on load ======= */
window.addEventListener("load", () => {
  loadAll();
  updateAccountUI();
  updateTransactionUI();
  updateStockUI();
  updateCharts();
});

/* ==========================
   Accounts
   ========================== */
function addAccount() {
  const name = document.getElementById("accountName").value.trim();
  const type = document.getElementById("accountType").value;
  if (!name) { alert("Enter account name"); return; }
  if (accounts.some(a => a.name === name)) { alert("Account already exists"); return; }
  accounts.push({ name, type });
  saveAll();
  updateAccountUI();
  document.getElementById("accountName").value = "";
}

function clearAccounts() {
  if (!confirm("Clear all accounts? This will not remove transactions but may make them inconsistent.")) return;
  accounts = [];
  saveAll();
  updateAccountUI();
  updateTransactionUI();
}

function updateAccountUI() {
  const list = document.getElementById("accountsList");
  const debitSelect = document.getElementById("debitAccount");
  const creditSelect = document.getElementById("creditAccount");
  list.innerHTML = "";
  debitSelect.innerHTML = "";
  creditSelect.innerHTML = "";
  accounts.forEach(acc => {
    const li = document.createElement("li");
    li.textContent = `${acc.name} (${acc.type})`;
    list.appendChild(li);
    [debitSelect, creditSelect].forEach(sel => {
      const opt = document.createElement("option");
      opt.value = acc.name;
      opt.textContent = acc.name;
      sel.appendChild(opt);
    });
  });
}

function getAccountType(name) {
  const a = accounts.find(x => x.name === name);
  return a ? a.type : null;
}

/* ==========================
   Transactions (double-entry)
   ========================== */
function addTransaction(date, desc, debit, credit, amount) {
  if (!date || !desc || !debit || !credit || !amount) { alert("Fill all fields"); return; }
  if (!getAccountType(debit) || !getAccountType(credit)) { alert("Add the accounts first"); return; }
  transactions.push({ date, desc, debit, credit, amount: Number(amount) });
  saveAll();
  updateTransactionUI();
}

function addTransactionWrapper() {
  const date = document.getElementById("transactionDate").value;
  const desc = document.getElementById("transactionDesc").value.trim();
  const debit = document.getElementById("debitAccount").value;
  const credit = document.getElementById("creditAccount").value;
  const amount = parseFloat(document.getElementById("transactionAmount").value);
  addTransaction(date, desc, debit, credit, amount ? amount : 0);
  document.getElementById("transactionDate").value = "";
  document.getElementById("transactionDesc").value = "";
  document.getElementById("transactionAmount").value = "";
}

function resetTransactions() {
  if (!confirm("Reset all transactions?")) return;
  transactions = [];
  saveAll();
  updateTransactionUI();
}

/* ==========================
   Excel import (transactions)
   expects sheet named "Transactions" with columns:
   Date | Description | Debit Account | Credit Account | Amount
   ========================== */
function importExcel() {
  const file = document.getElementById("excelFile").files[0];
  if (!file) { alert("Select Excel file"); return; }
  const reader = new FileReader();
  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, { type: "array" });
    wb.SheetNames.forEach(sheetName => {
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet);
      if (sheetName.toLowerCase() === "transactions") {
        rows.forEach(r => {
          const d = r["Date"] || r["date"];
          const desc = r["Description"] || r["description"];
          const dr = r["Debit Account"] || r["debit account"];
          const cr = r["Credit Account"] || r["credit account"];
          const amt = Number(r["Amount"] || r["amount"] || 0);
          if (!dr || !cr || !d) return;
          if (!getAccountType(dr) || !getAccountType(cr)) {
            console.warn("Skipping transaction; missing account:", r);
            return;
          }
          transactions.push({ date: d, desc, debit: dr, credit: cr, amount: amt });
        });
      }
    });
    saveAll();
    updateTransactionUI();
    alert("Excel imported.");
  };
  reader.readAsArrayBuffer(file);
}

/* ==========================
   UI + Charts
   ========================== */
function updateTransactionUI() {
  const list = document.getElementById("transactionList");
  list.innerHTML = "";
  transactions.forEach(tx => {
    const li = document.createElement("li");
    li.textContent = `${tx.date} | ${tx.desc} | Debit: ${tx.debit} | Credit: ${tx.credit} | K${tx.amount}`;
    list.appendChild(li);
  });
  updateCharts();
}

/* Color helpers */
function colorForType(type) {
  const pal = {
    Expense: ["#ff6b6b", "#ef5350", "#e53935"],
    Liability: ["#ff8a80", "#ff5252"],
    Revenue: ["#4caf50", "#66bb6a"],
    Asset: ["#42a5f5", "#29b6f6"],
    Equity: ["#ab47bc", "#ba68c8"]
  };
  return pal[type] || ["#90a4ae"];
}

function sliceColorByTransaction(tx) {
  const dt = getAccountType(tx.debit);
  const ct = getAccountType(tx.credit);
  if (dt === "Expense") return "#ef5350";
  if (ct === "Revenue") return "#43a047";
  if (dt === "Asset") return "#42a5f5";
  if (ct === "Liability") return "#e53935";
  if (ct === "Equity") return "#8e24aa";
  return "#90a4ae";
}

/* Build balances for all-time chart */
function buildAllTimeBalances() {
  const b = {};
  accounts.forEach(a => b[a.name] = 0);
  transactions.forEach(tx => {
    b[tx.debit] += tx.amount;
    b[tx.credit] -= tx.amount;
  });
  return b;
}

/* Update charts: daily pies (transactions slices), all-time pie */
function updateCharts() {
  const container = document.getElementById("chartsContainer");
  container.innerHTML = "";
  charts.forEach(c => c.destroy?.()); charts = [];

  // group by date
  const grouped = {};
  transactions.forEach(tx => {
    if (!grouped[tx.date]) grouped[tx.date] = [];
    grouped[tx.date].push(tx);
  });

  Object.keys(grouped).sort().forEach(date => {
    const dayTx = grouped[date];
    const labels = dayTx.map(t => t.desc);
    const data = dayTx.map(t => t.amount);
    const colors = dayTx.map(t => sliceColorByTransaction(t));

    const card = document.createElement("div"); card.className = "chartCard";
    const title = document.createElement("h4"); title.textContent = `Transactions Pie — ${date}`;
    card.appendChild(title);
    const canvas = document.createElement("canvas");
    card.appendChild(canvas);

    const btn = document.createElement("button");
    btn.textContent = "Download Pie";
    btn.className = "downloadBtn";
    btn.onclick = () => downloadChart(canvas, `Pie-${date}`);
    card.appendChild(btn);

    container.appendChild(card);

    const pie = new Chart(canvas.getContext("2d"), {
      type: "pie",
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 1 }] },
      options: {
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: ctx => {
            const total = ctx.dataset.data.reduce((a,b)=>a+b,0);
            const pct = total ? ((ctx.raw/total)*100).toFixed(2) : "0.00";
            return `${ctx.label}: K${ctx.raw} (${pct}%)`;
          } } },
          datalabels: { color: "#fff", font:{weight:"bold",size:12}, formatter:(v,ctx)=> {
            const total = ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0); return total?((v/total)*100).toFixed(1)+'%':''; } }
        }
      },
      plugins: [ChartDataLabels]
    });
    charts.push(pie);
  });

  // all-time
  const balances = buildAllTimeBalances();
  const labels = [], data = [], colors = [];
  const pickers = {
    Asset: colorForType("Asset"),
    Liability: colorForType("Liability"),
    Equity: colorForType("Equity"),
    Revenue: colorForType("Revenue"),
    Expense: colorForType("Expense")
  };
  const colorIndex = {}; // cycle each type
  accounts.forEach(acc => {
    const bal = balances[acc.name] || 0;
    if (bal !== 0) {
      labels.push(`${acc.name} (${acc.type})`);
      data.push(Math.abs(bal));
      const arr = pickers[acc.type] || ["#b0bec5"];
      colorIndex[acc.type] = (colorIndex[acc.type] || 0) % arr.length;
      colors.push(arr[colorIndex[acc.type]]);
      colorIndex[acc.type] += 1;
    }
  });

  const allTimeCtx = document.getElementById("allTimeChart").getContext("2d");
  if (allTimeChart) allTimeChart.destroy();
  if (labels.length) {
    allTimeChart = new Chart(allTimeCtx, {
      type: "pie",
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 1 }] },
      options: {
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: ctx => {
            const total = ctx.dataset.data.reduce((a,b)=>a+b,0);
            const pct = total?((ctx.raw/total)*100).toFixed(2):"0.00";
            return `${ctx.label}: K${ctx.raw} (${pct}%)`;
          } } },
          datalabels: { color:"#fff", font:{weight:"bold",size:12}, formatter:(v,ctx) => {
            const total = ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0);
            return total?((v/total)*100).toFixed(1)+'%':'';
          } }
        }
      },
      plugins: [ChartDataLabels]
    });
  }
}

/* Download helpers */
function downloadChart(canvas, filename) {
  const link = document.createElement("a");
  link.download = filename + ".png";
  link.href = canvas.toDataURL("image/png", 1);
  link.click();
}
function downloadAllCharts() {
  charts.forEach((c,i) => downloadChart(c.canvas, `Chart-${i+1}`));
  if (allTimeChart) downloadChart(allTimeChart.canvas, "AllTimeChart");
}
function downloadChartsPDF() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p","mm","a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  let y = 10;
  const toAdd = [...charts]; if (allTimeChart) toAdd.push(allTimeChart);
  if (!toAdd.length) return alert("No charts to export.");
  toAdd.forEach(chart => {
    const img = chart.toBase64Image();
    const props = pdf.getImageProperties(img);
    const w = pageW - 20;
    const h = (props.height * w) / props.width;
    if (y + h > pageH) { pdf.addPage(); y = 10; }
    pdf.addImage(img, "PNG", 10, y, w, h);
    y += h + 8;
  });
  pdf.save("AllCharts.pdf");
}

/* ==========================
   Stock management
   - stock[] items shape:
     { name, qty (current opening), price, closing (last closing qty|null) }
   - stockHistory: array of { date, item, opening, closing, consumed, valueOpening, valueClosing }
   ========================== */

function addStockItem() {
  const name = document.getElementById("itemName").value.trim();
  const qty = parseInt(document.getElementById("itemQty").value, 10);
  const price = parseFloat(document.getElementById("itemPrice").value);
  if (!name || isNaN(qty) || isNaN(price)) { alert("Fill all stock fields"); return; }
  if (stock.find(s => s.name === name)) { alert("Item exists - use balance/closing to update"); return; }
  stock.push({ name, qty, price, closing: null });
  saveAll();
  updateStockUI();
  document.getElementById("itemName").value = "";
  document.getElementById("itemQty").value = "";
  document.getElementById("itemPrice").value = "";
}

/* Quick balance update (use during counting) */
function updateStockBalance() {
  const name = document.getElementById("balanceItemName").value.trim();
  const counted = parseInt(document.getElementById("balanceQty").value, 10);
  if (!name || isNaN(counted)) { alert("Enter name and counted qty"); return; }
  const item = stock.find(s => s.name === name);
  if (!item) { alert("Item not found"); return; }
  const variance = counted - item.qty;
  item.qty = counted;
  saveAll();
  updateStockUI();
  alert(`Balance updated for ${name}. Variance: ${variance >= 0 ? "+" : ""}${variance}`);
}

/* Record closing stock via separate form.
   - store history entry (opening, closing, consumed, values)
   - update item.closing and roll closing qty into next opening (auto roll-over)
*/
function recordClosingStock() {
  const name = document.getElementById("closingItemName").value.trim();
  const closingQty = parseInt(document.getElementById("closingQty").value, 10);
  if (!name || isNaN(closingQty)) { alert("Enter item and closing qty"); return; }
  const item = stock.find(s => s.name === name);
  if (!item) { alert("Item not found"); return; }
  const date = new Date().toISOString().slice(0,10);
  const openingQty = (typeof item.qty === "number") ? item.qty : 0;
  const consumed = openingQty - closingQty;
  const valueOpening = openingQty * item.price;
  const valueClosing = closingQty * item.price;
  // push history
  stockHistory.push({ date, item: name, opening: openingQty, closing: closingQty, consumed, valueOpening, valueClosing });
  // set closing and roll to opening for next day
  item.closing = closingQty;
  item.qty = closingQty; // roll-over: closing becomes next opening
  saveAll();
  updateStockUI();
  alert(`Closing recorded for ${name}. Consumed: ${consumed}`);
  document.getElementById("closingItemName").value = "";
  document.getElementById("closingQty").value = "";
}

/* Check available */
function checkAvailableStock() {
  const name = document.getElementById("availableItemName").value.trim();
  if (!name) { alert("Enter item name"); return; }
  const item = stock.find(s => s.name === name);
  if (!item) { alert("Item not found"); return; }
  document.getElementById("availableResult").textContent = `Available: ${item.qty} units (Unit price: K${item.price})`;
}

/* Build stock report UI with working-out */
function updateStockUI() {
  const list = document.getElementById("stockList");
  const summary = document.getElementById("stockSummary");
  const report = document.getElementById("stockReport");
  list.innerHTML = "";
  summary.innerHTML = "";
  report.innerHTML = "";

  let totalValue = 0;
  stock.forEach(item => {
    const li = document.createElement("li");
    li.textContent = `${item.name} | Opening (current): ${item.qty} | Unit Price: K${item.price} | Closing (last): ${item.closing ?? "N/A"}`;
    list.appendChild(li);
    totalValue += item.qty * item.price;
  });

  summary.innerHTML = `<h3>Stock Summary</h3>Total Items: ${stock.length}<br>Total Value (opening * price): K${totalValue.toFixed(2)}`;

  // stock report working out: show latest history entries grouped by item (descending)
  let reportHtml = "<h3>Stock Take Report & Working Out</h3>";
  if (stockHistory.length === 0) {
    reportHtml += "<em>No closing stock records yet.</em>";
  } else {
    // latest per item
    const grouped = {};
    stockHistory.slice().reverse().forEach(h => { // reverse so newest first
      if (!grouped[h.item]) grouped[h.item] = [];
      grouped[h.item].push(h);
    });
    Object.keys(grouped).forEach(itemName => {
      reportHtml += `<strong>${itemName}</strong><br>`;
      grouped[itemName].forEach(h => {
        reportHtml += `- ${h.date}: Opening ${h.opening} (K${h.valueOpening.toFixed(2)}) — Closing ${h.closing} (K${h.valueClosing.toFixed(2)}) — Consumed ${h.consumed}<br>`;
      });
      reportHtml += `<br>`;
    });
  }
  report.innerHTML = reportHtml;
}

/* Stock reset */
function resetStock() {
  if (!confirm("Reset stock and history?")) return;
  stock = [];
  stockHistory = [];
  saveAll();
  updateStockUI();
}

/* Download stock as Excel (stock + history) */
function downloadStockExcel() {
  const wb = XLSX.utils.book_new();
  const stockSheet = XLSX.utils.json_to_sheet(stock.map(s => ({
    name: s.name, opening_qty: s.qty, unit_price: s.price, last_closing: s.closing
  })));
  const histSheet = XLSX.utils.json_to_sheet(stockHistory);
  XLSX.utils.book_append_sheet(wb, stockSheet, "Stock");
  XLSX.utils.book_append_sheet(wb, histSheet, "StockHistory");
  XLSX.writeFile(wb, "StockReport.xlsx");
}

/* Download stock report as simple PDF */
function downloadStockPDF() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  let y = 12;
  pdf.setFontSize(14);
  pdf.text("Stock Report", 10, y); y += 8;
  pdf.setFontSize(11);
  stock.forEach(item => {
    pdf.text(`${item.name} — Opening: ${item.qty} — Unit: K${item.price} — Last Closing: ${item.closing ?? "N/A"}`, 10, y);
    y += 6;
    if (y > 270) { pdf.addPage(); y = 12; }
  });
  y += 6;
  pdf.setFontSize(12);
  pdf.text("Stock History (latest first)", 10, y); y += 8;
  stockHistory.slice().reverse().forEach(h => {
    const line = `${h.date} | ${h.item} | Opening:${h.opening} Closing:${h.closing} Consumed:${h.consumed} ValueOpen:K${h.valueOpening.toFixed(2)} ValueClose:K${h.valueClosing.toFixed(2)}`;
    pdf.text(line, 10, y); y += 6;
    if (y > 270) { pdf.addPage(); y = 12; }
  });
  pdf.save("StockReport.pdf");
}

/* =========================
   Shift Report (unchanged)
   ========================= */
function generateShiftReport() {
  const date = document.getElementById("shiftDate").value;
  const shiftTime = document.getElementById("shiftTime").value;
  const employee = document.getElementById("employeeName").value;
  const openingCash = parseFloat(document.getElementById("openingCash").value) || 0;
  const sales = parseFloat(document.getElementById("cashSales").value) || 0;
  const payments = parseFloat(document.getElementById("cashPayments").value) || 0;
  const actualCash = parseFloat(document.getElementById("actualCash").value) || 0;
  const expectedCash = openingCash + sales - payments;
  const variance = expectedCash - actualCash;

  const html = `
    <h3>End-of-Shift Cash Reconciliation</h3>
    <strong>Date:</strong> ${date}<br>
    <strong>Shift:</strong> ${shiftTime}<br>
    <strong>Employee:</strong> ${employee}<br><br>
    <strong>Opening Cash (Float):</strong> K${openingCash.toFixed(2)}<br>
    <strong>Total Cash Receipts/Sales:</strong> K${sales.toFixed(2)}<br>
    <strong>Total Cash Disbursements/Payments:</strong> K${payments.toFixed(2)}<br>
    <strong>Expected Cash on Hand:</strong> K${expectedCash.toFixed(2)}<br>
    <strong>Actual Cash on Hand:</strong> K${actualCash.toFixed(2)}<br>
    <strong>Variance:</strong> K${variance.toFixed(2)}<br>
    <strong>Notes/Comments:</strong> ____________________________<br>
  `;

  document.getElementById("shiftReportContainer").innerHTML = html;
  shiftReport = { date, shiftTime, employee, openingCash, sales, payments, actualCash, expectedCash, variance };
  saveAll();
}

function downloadShiftPDF() {
  if (!shiftReport.date) return alert("Generate the shift report first");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14); pdf.text("End-of-Shift Cash Reconciliation", 10, y); y += 10;
  pdf.setFontSize(12);
  Object.entries(shiftReport).forEach(([k, v]) => { pdf.text(`${k}: ${v}`, 10, y); y += 8; });
  pdf.save(`Shift-${shiftReport.date}.pdf`);
}

function downloadShiftWord() {
  if (!shiftReport.date) return alert("Generate the shift report first");
  let content = `<html><head><meta charset="utf-8"><title>Shift Report</title></head><body>`;
  content += `<h2>End-of-Shift Cash Reconciliation</h2>`;
  Object.entries(shiftReport).forEach(([k, v]) => { content += `<strong>${k}:</strong> ${v}<br>`; });
  content += `</body></html>`;
  const blob = new Blob([content], { type: "application/msword" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Shift-${shiftReport.date}.doc`;
  link.click();
}

/* ========== Save state wrapper ========== */
function saveAll() {
  localStorage.setItem(KEY_ACCOUNTS, JSON.stringify(accounts));
  localStorage.setItem(KEY_TRANSACTIONS, JSON.stringify(transactions));
  localStorage.setItem(KEY_STOCK, JSON.stringify(stock));
  localStorage.setItem(KEY_STOCK_HISTORY, JSON.stringify(stockHistory));
  localStorage.setItem(KEY_SHIFT, JSON.stringify(shiftReport));
}

/* We already defined loadAll at top; keep it consistent */
function loadAll() {
  try {
    accounts = JSON.parse(localStorage.getItem(KEY_ACCOUNTS)) || [];
    transactions = JSON.parse(localStorage.getItem(KEY_TRANSACTIONS)) || [];
    stock = JSON.parse(localStorage.getItem(KEY_STOCK)) || [];
    stockHistory = JSON.parse(localStorage.getItem(KEY_STOCK_HISTORY)) || [];
    shiftReport = JSON.parse(localStorage.getItem(KEY_SHIFT)) || {};
  } catch (e) {
    accounts = transactions = stock = stockHistory = [];
    shiftReport = {};
  }
}

/* Expose a helper to download all records (accounts, transactions, stock, stockHistory) */
function downloadAllRecords() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accounts), "Accounts");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transactions), "Transactions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stock), "Stock");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockHistory), "StockHistory");
  XLSX.writeFile(wb, "AllRecords.xlsx");
}

/* ensure initial load/save hooks (re-run to rebind if script replaced) */
loadAll();
updateAccountUI();
updateTransactionUI();
updateStockUI();
updateCharts();

/* ========== Page switching: Main <-> Stock Take ========== */
function showStockTake() {
  document.getElementById("accountsSection").style.display = "none";
  document.getElementById("transactionSection").style.display = "none";
  document.getElementById("chartsSection").style.display = "none";
  document.getElementById("stockTakeSection").style.display = "block";
}

function showMainPage() {
  document.getElementById("accountsSection").style.display = "block";
  document.getElementById("transactionSection").style.display = "block";
  document.getElementById("chartsSection").style.display = "block";
  document.getElementById("stockTakeSection").style.display = "none";
}

function setCashOnHand() {
  const val = parseFloat(document.getElementById("cashOnHandInput").value);
  if (isNaN(val) || val < 0) { alert("Enter valid cash amount"); return; }
  cashOnHand = val;
  saveAll();
  updateCashSummary();
  updateCashTable();
}

function updateCashSummary() {
  document.getElementById("cashSummary").innerHTML = 
    `<strong>Cash on Hand:</strong> K${cashOnHand.toFixed(2)}`;
}

function updateCashTable() {
  const tbody = document.querySelector("#cashTable tbody");
  tbody.innerHTML = "";

  let balance = cashOnHand;
  transactions.forEach(tx => {
    // Only subtract if transaction is an Expense
    if (getAccountType(tx.debit) === "Expense") {
      balance -= tx.amount;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${tx.date}</td>
      <td>${tx.desc}</td>
      <td>${tx.debit}</td>
      <td>${tx.credit}</td>
      <td>K${tx.amount.toFixed(2)}</td>
      <td>K${balance.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}
function saveAll() {
  localStorage.setItem(KEY_ACCOUNTS, JSON.stringify(accounts));
  localStorage.setItem(KEY_TRANSACTIONS, JSON.stringify(transactions));
  localStorage.setItem(KEY_STOCK, JSON.stringify(stock));
  localStorage.setItem(KEY_STOCK_HISTORY, JSON.stringify(stockHistory));
  localStorage.setItem(KEY_SHIFT, JSON.stringify(shiftReport));
  localStorage.setItem("cashOnHand", cashOnHand);
}

function loadAll() {
  try {
    accounts = JSON.parse(localStorage.getItem(KEY_ACCOUNTS)) || [];
    transactions = JSON.parse(localStorage.getItem(KEY_TRANSACTIONS)) || [];
    stock = JSON.parse(localStorage.getItem(KEY_STOCK)) || [];
    stockHistory = JSON.parse(localStorage.getItem(KEY_STOCK_HISTORY)) || [];
    shiftReport = JSON.parse(localStorage.getItem(KEY_SHIFT)) || {};
    cashOnHand = parseFloat(localStorage.getItem("cashOnHand")) || 0;
  } catch (e) {
    accounts = transactions = stock = stockHistory = [];
    shiftReport = {};
    cashOnHand = 0;
  }
}

function updateTransactionUI() {
  const list = document.getElementById("transactionList");
  list.innerHTML = "";
  transactions.forEach(tx => {
    const li = document.createElement("li");
    li.textContent = `${tx.date} | ${tx.desc} | Debit: ${tx.debit} | Credit: ${tx.credit} | K${tx.amount}`;
    list.appendChild(li);
  });
  updateCharts();
  updateCashSummary();
  updateCashTable();
}
