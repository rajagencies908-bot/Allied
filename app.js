/* =========================================================
   ALLIED DASHBOARD V3
   Local Excel Upload Version
========================================================= */

const STORAGE = {
  PARTY: "allied_party_master_v3",
  SALES: "allied_sales_data_v3",
  STOCK: "allied_stock_data_v3",
  META: "allied_upload_meta_v3",
  ORDERS: "allied_orders_v3"
};

let DATA = {
  party: [],
  sales: [],
  stock: []
};

let MONTHS = [];


/* =========================================================
   BASIC HELPERS
========================================================= */

function clean(v) {
  return String(v ?? "").trim();
}

function num(v) {
  if (typeof v === "number") return v;

  let s = clean(v)
    .replace(/,/g, "")
    .replace(/₹/g, "");

  const n = parseFloat(s);

  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return "₹" + Math.round(num(v)).toLocaleString("en-IN");
}

function pct(v) {
  return Number.isFinite(v) ? v.toFixed(1) + "%" : "0.0%";
}

function escapeHTML(v) {
  return clean(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function unique(arr) {
  return [...new Set(arr.filter(v => clean(v) !== ""))];
}


/* =========================================================
   STORAGE
========================================================= */

function loadStorage() {
  try {
    DATA.party =
      JSON.parse(localStorage.getItem(STORAGE.PARTY) || "[]");

    DATA.sales =
      JSON.parse(localStorage.getItem(STORAGE.SALES) || "[]");

    DATA.stock =
      JSON.parse(localStorage.getItem(STORAGE.STOCK) || "[]");
  } catch (e) {
    console.error("Storage load error", e);
  }
}

function saveData(key, rows) {
  localStorage.setItem(key, JSON.stringify(rows));
}

function getMeta() {
  try {
    return JSON.parse(
      localStorage.getItem(STORAGE.META) || "{}"
    );
  } catch {
    return {};
  }
}

function setMeta(type, info) {
  const meta = getMeta();

  meta[type] = info;

  localStorage.setItem(
    STORAGE.META,
    JSON.stringify(meta)
  );
}


/* =========================================================
   EXCEL HEADER NORMALIZATION
========================================================= */

function excelDateToMonth(value) {

  if (!value) return "";

  if (value instanceof Date) {
    return value.toLocaleString("en-US", {
      month: "short"
    }) + "-" +
      String(value.getFullYear()).slice(-2);
  }

  return clean(value);
}

function normalizeHeaders(headers) {
  return headers.map(h => excelDateToMonth(h));
}


/* =========================================================
   READ EXCEL
========================================================= */

async function readWorkbook(file) {

  const buffer = await file.arrayBuffer();

  return XLSX.read(buffer, {
    type: "array",
    cellDates: true
  });
}

function findSheet(workbook, possibleNames) {

  const wanted =
    possibleNames.map(n =>
      clean(n).toLowerCase()
    );

  const sheetName =
    workbook.SheetNames.find(name =>
      wanted.includes(
        clean(name).toLowerCase()
      )
    );

  return sheetName || null;
}

function sheetToRows(sheet) {

  const matrix =
    XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false
    });

  if (!matrix.length) return [];

  const headers =
    normalizeHeaders(matrix[0]);

  return matrix
    .slice(1)
    .filter(row =>
      row.some(v => clean(v) !== "")
    )
    .map(row => {

      const obj = {};

      headers.forEach((header, i) => {
        if (header) {
          obj[header] =
            row[i] !== undefined
              ? row[i]
              : "";
        }
      });

      return obj;
    });
}


/* =========================================================
   VALIDATION
========================================================= */

function validateHeaders(rows, required, title) {

  if (!rows.length) {
    throw new Error(title + " ma data rows nathi.");
  }

  const headers =
    Object.keys(rows[0]);

  const missing =
    required.filter(h =>
      !headers.includes(h)
    );

  if (missing.length) {
    throw new Error(
      title +
      " ma aa columns missing che: " +
      missing.join(", ")
    );
  }
}


/* =========================================================
   PARTY MASTER UPLOAD
========================================================= */

async function uploadPartyMaster(file) {

  const wb = await readWorkbook(file);

  let sheetName =
    findSheet(wb, [
      "Party Master file",
      "Party Master"
    ]);

  /*
   CSV / single-sheet upload support
  */
  if (!sheetName && wb.SheetNames.length === 1) {
    sheetName = wb.SheetNames[0];
  }

  if (!sheetName) {
    throw new Error(
      'Excel ma "Party Master file" sheet mali nathi.'
    );
  }

  const rows =
    sheetToRows(wb.Sheets[sheetName]);

  validateHeaders(
    rows,
    [
      "Document",
      "Name",
      "Budget",
      "PartyGrp"
    ],
    "Party Master"
  );

  DATA.party = rows;

  saveData(
    STORAGE.PARTY,
    rows
  );

  setMeta("party", {
    file: file.name,
    rows: rows.length,
    time: new Date().toISOString()
  });

  afterDataChange();
}


/* =========================================================
   SALES UPLOAD
========================================================= */

async function uploadSalesData(file) {

  const wb = await readWorkbook(file);

  let sheetName =
    findSheet(wb, [
      "Sales data",
      "Sales Data",
      "Sales"
    ]);

  if (!sheetName && wb.SheetNames.length === 1) {
    sheetName = wb.SheetNames[0];
  }

  if (!sheetName) {
    throw new Error(
      'Excel ma "Sales data" sheet mali nathi.'
    );
  }

  const rows =
    sheetToRows(wb.Sheets[sheetName]);

  validateHeaders(
    rows,
    [
      "Document",
      "ItemCode",
      "ItemName"
    ],
    "Sales Data"
  );

  DATA.sales = rows;

  saveData(
    STORAGE.SALES,
    rows
  );

  setMeta("sales", {
    file: file.name,
    rows: rows.length,
    time: new Date().toISOString()
  });

  afterDataChange();
}


/* =========================================================
   STOCK UPLOAD
========================================================= */

async function uploadStockData(file) {

  const wb = await readWorkbook(file);

  let sheetName =
    findSheet(wb, [
      "stock",
      "Stock",
      "Stock Data"
    ]);

  if (!sheetName && wb.SheetNames.length === 1) {
    sheetName = wb.SheetNames[0];
  }

  if (!sheetName) {
    throw new Error(
      'Excel ma "stock" sheet mali nathi.'
    );
  }

  const rows =
    sheetToRows(wb.Sheets[sheetName]);

  /*
    Empty stock file pan accept.
    Header validation mate worksheet headers direct read.
  */

  if (rows.length) {
    validateHeaders(
      rows,
      [
        "ItemCode",
        "ItemDescription",
        "ClosingQty"
      ],
      "Stock"
    );
  }

  DATA.stock = rows;

  saveData(
    STORAGE.STOCK,
    rows
  );

  setMeta("stock", {
    file: file.name,
    rows: rows.length,
    time: new Date().toISOString()
  });

  afterDataChange();
}


/* =========================================================
   CRITICAL DOCUMENT FILTER
========================================================= */

function validDocuments() {

  return new Set(
    DATA.party
      .map(p => clean(p.Document))
      .filter(Boolean)
  );
}

function validSales() {

  const docs = validDocuments();

  return DATA.sales.filter(row =>
    docs.has(
      clean(row.Document)
    )
  );
}


/* =========================================================
   MONTH DETECTION
========================================================= */

function detectMonths() {

  const monthRegex =
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2}$/i;

  const found = [];

  DATA.sales.forEach(row => {
    Object.keys(row).forEach(key => {
      if (
        monthRegex.test(clean(key)) &&
        !found.includes(key)
      ) {
        found.push(key);
      }
    });
  });

  const monthIndex = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11
  };

  found.sort((a, b) => {

    const [ma, ya] = a.split("-");
    const [mb, yb] = b.split("-");

    const da =
      2000 + Number(ya);

    const db =
      2000 + Number(yb);

    if (da !== db) return da - db;

    return (
      monthIndex[ma] -
      monthIndex[mb]
    );
  });

  MONTHS = found;
}


/* =========================================================
   PARTY GROUP
========================================================= */

function groupBudget(group) {

  const budgets =
    DATA.party
      .filter(p =>
        clean(p.PartyGrp) === clean(group)
      )
      .map(p => num(p.Budget))
      .filter(v => v > 0);

  if (!budgets.length) return 0;

  /*
   IMPORTANT:
   Same PartyGrp ma Budget multiply nathi karvanu.
   Common monthly group Budget.
  */

  return Math.max(...budgets);
}

function partyByDocument(doc) {
  return DATA.party.find(
    p =>
      clean(p.Document) === clean(doc)
  );
}


/* =========================================================
   FILTERS
========================================================= */

function setupFilters() {

  const customer =
    document.getElementById("customerFilter");

  const group =
    document.getElementById("groupFilter");

  const month =
    document.getElementById("monthFilter");

  const item =
    document.getElementById("itemFilter");


  const oldCustomer = customer.value;
  const oldGroup = group.value;
  const oldMonth = month.value;
  const oldItem = item.value;


  customer.innerHTML =
    `<option value="">All Customers</option>` +
    DATA.party
      .slice()
      .sort((a,b) =>
        clean(a.Name).localeCompare(clean(b.Name))
      )
      .map(p =>
        `<option value="${escapeHTML(p.Document)}">
          ${escapeHTML(p.Name)} (${escapeHTML(p.Document)})
        </option>`
      )
      .join("");


  const groups =
    unique(
      DATA.party.map(p =>
        clean(p.PartyGrp)
      )
    ).sort();


  group.innerHTML =
    `<option value="">All Groups</option>` +
    groups.map(g =>
      `<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`
    ).join("");


  month.innerHTML =
    `<option value="">All Months</option>` +
    MONTHS.map(m =>
      `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`
    ).join("");


  const items =
    new Map();

  validSales().forEach(row => {

    const code =
      clean(row.ItemCode);

    if (code && !items.has(code)) {
      items.set(
        code,
        clean(row.ItemName) || code
      );
    }
  });


  item.innerHTML =
    `<option value="">All Products</option>` +
    [...items.entries()]
      .sort((a,b) =>
        a[1].localeCompare(b[1])
      )
      .map(([code,name]) =>
        `<option value="${escapeHTML(code)}">
          ${escapeHTML(name)}
        </option>`
      )
      .join("");


  if (
    [...customer.options]
      .some(o => o.value === oldCustomer)
  ) {
    customer.value = oldCustomer;
  }

  if (
    [...group.options]
      .some(o => o.value === oldGroup)
  ) {
    group.value = oldGroup;
  }

  if (
    [...month.options]
      .some(o => o.value === oldMonth)
  ) {
    month.value = oldMonth;
  }

  if (
    [...item.options]
      .some(o => o.value === oldItem)
  ) {
    item.value = oldItem;
  }
}


function selectedState() {

  const customerDoc =
    clean(
      document.getElementById("customerFilter").value
    );

  let group =
    clean(
      document.getElementById("groupFilter").value
    );

  const month =
    clean(
      document.getElementById("monthFilter").value
    );

  const item =
    clean(
      document.getElementById("itemFilter").value
    );


  /*
   Customer selected =>
   Automatically its complete PartyGrp.
  */

  if (customerDoc) {

    const party =
      partyByDocument(customerDoc);

    if (party) {
      group = clean(party.PartyGrp);
    }
  }


  let parties =
    DATA.party.slice();


  if (group) {
    parties =
      parties.filter(p =>
        clean(p.PartyGrp) === group
      );
  }


  const docs =
    new Set(
      parties.map(p =>
        clean(p.Document)
      )
    );


  let sales =
    validSales()
      .filter(row =>
        docs.has(clean(row.Document))
      );


  if (item) {
    sales =
      sales.filter(row =>
        clean(row.ItemCode) === item
      );
  }


  return {
    customerDoc,
    group,
    month,
    item,
    parties,
    sales
  };
}


/* =========================================================
   SALES CALCULATIONS
========================================================= */

function rowSales(row, selectedMonth = "") {

  if (selectedMonth) {
    return num(row[selectedMonth]);
  }

  return MONTHS.reduce(
    (total, m) =>
      total + num(row[m]),
    0
  );
}

function salesTotal(rows, month = "") {

  return rows.reduce(
    (total, row) =>
      total + rowSales(row, month),
    0
  );
}


/* =========================================================
   KPI
========================================================= */

function renderKPI() {

  const state =
    selectedState();

  const sales =
    salesTotal(
      state.sales,
      state.month
    );


  const groups =
    unique(
      state.parties.map(p =>
        clean(p.PartyGrp)
      )
    );


  const monthCount =
    state.month
      ? 1
      : MONTHS.length;


  let budget = 0;

  groups.forEach(g => {
    budget +=
      groupBudget(g) *
      monthCount;
  });


  const achievement =
    budget > 0
      ? (sales / budget) * 100
      : 0;


  document.getElementById(
    "totalSales"
  ).textContent = money(sales);


  document.getElementById(
    "totalBudget"
  ).textContent = money(budget);


  document.getElementById(
    "achievement"
  ).textContent = pct(achievement);


  document.getElementById(
    "customerCount"
  ).textContent =
    state.parties.length;


  document.getElementById(
    "groupCount"
  ).textContent =
    groups.length;
}


/* =========================================================
   GROUP SUMMARY
========================================================= */

function renderGroupSummary() {

  const tbody =
    document.querySelector(
      "#groupTable tbody"
    );

  const state =
    selectedState();


  const groups =
    unique(
      state.parties.map(p =>
        clean(p.PartyGrp)
      )
    );


  if (!groups.length) {
    tbody.innerHTML =
      `<tr>
        <td colspan="7" class="empty">
          No Party Master data
        </td>
      </tr>`;
    return;
  }


  tbody.innerHTML =
    groups.map(group => {

      const parties =
        state.parties.filter(p =>
          clean(p.PartyGrp) === group
        );

      const docs =
        new Set(
          parties.map(p =>
            clean(p.Document)
          )
        );

      const salesRows =
        state.sales.filter(row =>
          docs.has(
            clean(row.Document)
          )
        );

      const sales =
        salesTotal(
          salesRows,
          state.month
        );

      const monthlyBudget =
        groupBudget(group);

      const budget =
        monthlyBudget *
        (
          state.month
            ? 1
            : MONTHS.length
        );

      const diff =
        sales - budget;

      const achievement =
        budget > 0
          ? sales / budget * 100
          : 0;


      return `
        <tr>
          <td>${escapeHTML(group)}</td>
          <td class="num">${parties.length}</td>
          <td class="num">${money(monthlyBudget)}</td>
          <td class="num">${money(sales)}</td>
          <td class="num">${money(budget)}</td>
          <td class="num ${diff >= 0 ? "positive" : "negative"}">
            ${money(diff)}
          </td>
          <td class="num">
            ${pct(achievement)}
          </td>
        </tr>
      `;

    }).join("");
}


/* =========================================================
   CUSTOMER / GROUP BUDGET VS ACTUAL
========================================================= */

function renderBudgetTable() {

  const table =
    document.getElementById(
      "budgetTable"
    );

  const state =
    selectedState();


  const displayMonths =
    state.month
      ? [state.month]
      : MONTHS;


  let header = `
    <tr>
      <th>Party Group</th>
      <th>Customer / Shops</th>
  `;


  displayMonths.forEach(m => {
    header += `
      <th>${escapeHTML(m)} Sales</th>
      <th>${escapeHTML(m)} Budget</th>
      <th>${escapeHTML(m)} Diff</th>
    `;
  });


  header += `
      <th>Total Sales</th>
      <th>Total Budget</th>
      <th>Total Diff</th>
    </tr>
  `;


  table.querySelector("thead").innerHTML =
    header;


  const groups =
    unique(
      state.parties.map(p =>
        clean(p.PartyGrp)
      )
    );


  if (!groups.length) {

    table.querySelector("tbody").innerHTML =
      `<tr>
        <td colspan="50" class="empty">
          No data
        </td>
      </tr>`;

    return;
  }


  let body = "";


  groups.forEach(group => {

    const parties =
      state.parties.filter(p =>
        clean(p.PartyGrp) === group
      );

    const docs =
      new Set(
        parties.map(p =>
          clean(p.Document)
        )
      );

    const rows =
      state.sales.filter(row =>
        docs.has(
          clean(row.Document)
        )
      );

    const monthlyBudget =
      groupBudget(group);


    let totalSales = 0;
    let totalBudget = 0;


    body += `
      <tr>
        <td>
          <strong>${escapeHTML(group)}</strong>
        </td>

        <td>
          ${parties
            .map(p => escapeHTML(p.Name))
            .join("<br>")}
        </td>
    `;


    displayMonths.forEach(month => {

      const sales =
        salesTotal(rows, month);

      const budget =
        monthlyBudget;

      const diff =
        sales - budget;


      totalSales += sales;
      totalBudget += budget;


      body += `
        <td class="num">${money(sales)}</td>
        <td class="num">${money(budget)}</td>

        <td class="num ${diff >= 0 ? "positive" : "negative"}">
          ${money(diff)}
        </td>
      `;
    });


    const totalDiff =
      totalSales - totalBudget;


    body += `
        <td class="num">
          <strong>${money(totalSales)}</strong>
        </td>

        <td class="num">
          <strong>${money(totalBudget)}</strong>
        </td>

        <td class="num ${totalDiff >= 0 ? "positive" : "negative"}">
          <strong>${money(totalDiff)}</strong>
        </td>

      </tr>
    `;
  });


  table.querySelector("tbody").innerHTML =
    body;
}


/* =========================================================
   PRODUCT SALES
========================================================= */

function renderProductTable() {

  const table =
    document.getElementById(
      "productTable"
    );

  const state =
    selectedState();


  const displayMonths =
    state.month
      ? [state.month]
      : MONTHS;


  table.querySelector("thead").innerHTML =
    `
      <tr>
        <th>Item Code</th>
        <th>Item Name</th>

        ${displayMonths
          .map(m =>
            `<th>${escapeHTML(m)}</th>`
          )
          .join("")}

        <th>Total</th>
      </tr>
    `;


  const products =
    new Map();


  state.sales.forEach(row => {

    const code =
      clean(row.ItemCode);

    if (!code) return;


    if (!products.has(code)) {

      products.set(code, {
        code,
        name:
          clean(row.ItemName) ||
          code,
        months: {}
      });


      displayMonths.forEach(m => {
        products.get(code).months[m] = 0;
      });
    }


    const product =
      products.get(code);


    displayMonths.forEach(m => {
      product.months[m] +=
        num(row[m]);
    });
  });


  const rows =
    [...products.values()]
      .sort((a,b) =>
        a.name.localeCompare(b.name)
      );


  if (!rows.length) {

    table.querySelector("tbody").innerHTML =
      `<tr>
        <td colspan="50" class="empty">
          No product sales
        </td>
      </tr>`;

    return;
  }


  table.querySelector("tbody").innerHTML =
    rows.map(p => {

      const total =
        displayMonths.reduce(
          (sum,m) =>
            sum + p.months[m],
          0
        );


      return `
        <tr>
          <td>${escapeHTML(p.code)}</td>
          <td>${escapeHTML(p.name)}</td>

          ${displayMonths
            .map(m =>
              `<td class="num">
                ${money(p.months[m])}
              </td>`
            )
            .join("")}

          <td class="num">
            <strong>${money(total)}</strong>
          </td>
        </tr>
      `;

    }).join("");
}


/* =========================================================
   STOCK
========================================================= */

function renderStock() {

  const tbody =
    document.querySelector(
      "#stockTable tbody"
    );

  const search =
    clean(
      document.getElementById(
        "stockSearch"
      ).value
    ).toLowerCase();


  const rows =
    DATA.stock.filter(row => {

      if (!search) return true;

      return [
        row.ItemGroup,
        row.ItemCode,
        row.ItemDescription
      ]
      .join(" ")
      .toLowerCase()
      .includes(search);

    });


  if (!rows.length) {

    tbody.innerHTML =
      `<tr>
        <td colspan="6" class="empty">
          No stock data
        </td>
      </tr>`;

    return;
  }


  tbody.innerHTML =
    rows.map(row => `
      <tr>
        <td>${escapeHTML(row.ItemGroup)}</td>
        <td>${escapeHTML(row.ItemCode)}</td>
        <td>${escapeHTML(row.ItemDescription)}</td>
        <td>${escapeHTML(row.Unit)}</td>

        <td class="num">
          ${num(row.ClosingQty).toLocaleString("en-IN")}
        </td>

        <td class="num">
          ${money(row.HORate)}
        </td>
      </tr>
    `).join("");
}


/* =========================================================
   RAW TABLE
========================================================= */

function renderRawTable(
  elementId,
  rows
) {

  const table =
    document.getElementById(
      elementId
    );


  if (!rows.length) {

    table.innerHTML =
      `<tbody>
        <tr>
          <td class="empty">
            No data uploaded
          </td>
        </tr>
      </tbody>`;

    return;
  }


  const headers =
    Object.keys(rows[0]);


  table.innerHTML =
    `
      <thead>
        <tr>
          ${headers
            .map(h =>
              `<th>${escapeHTML(h)}</th>`
            )
            .join("")}
        </tr>
      </thead>

      <tbody>

        ${rows
          .slice(0,500)
          .map(row => `
            <tr>
              ${headers
                .map(h =>
                  `<td>${escapeHTML(row[h])}</td>`
                )
                .join("")}
            </tr>
          `)
          .join("")}

      </tbody>
    `;
}


/* =========================================================
   UPLOAD STATUS
========================================================= */

function renderUploadStatus() {

  const meta =
    getMeta();


  renderOneStatus(
    "partyStatus",
    meta.party,
    DATA.party.length
  );


  renderOneStatus(
    "salesStatus",
    meta.sales,
    DATA.sales.length
  );


  renderOneStatus(
    "stockStatus",
    meta.stock,
    DATA.stock.length
  );
}

function renderOneStatus(
  id,
  meta,
  rows
) {

  const el =
    document.getElementById(id);


  if (!meta) {

    el.className =
      "upload-info";

    el.textContent =
      "No data uploaded";

    return;
  }


  const date =
    new Date(meta.time);


  el.className =
    "upload-info success";


  el.innerHTML =
    `${rows.toLocaleString("en-IN")} rows<br>` +
    `${escapeHTML(meta.file)}<br>` +
    `Updated: ${date.toLocaleString("en-IN")}`;
}


/* =========================================================
   ORDER
========================================================= */

function setupOrder() {

  const customer =
    document.getElementById(
      "orderCustomer"
    );

  const item =
    document.getElementById(
      "orderItem"
    );


  customer.innerHTML =
    DATA.party
      .slice()
      .sort((a,b) =>
        clean(a.Name).localeCompare(clean(b.Name))
      )
      .map(p =>
        `<option value="${escapeHTML(p.Document)}">
          ${escapeHTML(p.Name)} (${escapeHTML(p.Document)})
        </option>`
      )
      .join("");


  const items =
    new Map();


  DATA.stock.forEach(row => {

    const code =
      clean(row.ItemCode);

    if (code) {

      items.set(
        code,
        clean(row.ItemDescription) ||
        code
      );
    }
  });


  validSales().forEach(row => {

    const code =
      clean(row.ItemCode);

    if (
      code &&
      !items.has(code)
    ) {

      items.set(
        code,
        clean(row.ItemName) ||
        code
      );
    }
  });


  item.innerHTML =
    [...items.entries()]
      .sort((a,b) =>
        a[1].localeCompare(b[1])
      )
      .map(([code,name]) =>
        `<option value="${escapeHTML(code)}">
          ${escapeHTML(name)}
        </option>`
      )
      .join("");
}


function openOrderModal() {

  setupOrder();

  document
    .getElementById("orderModal")
    .classList.add("show");
}


function closeOrderModal() {

  document
    .getElementById("orderModal")
    .classList.remove("show");
}


function saveOrder() {

  const documentNo =
    clean(
      document.getElementById(
        "orderCustomer"
      ).value
    );

  const itemCode =
    clean(
      document.getElementById(
        "orderItem"
      ).value
    );

  const qty =
    num(
      document.getElementById(
        "orderQty"
      ).value
    );

  const remark =
    clean(
      document.getElementById(
        "orderRemark"
      ).value
    );


  if (!documentNo || !itemCode || qty <= 0) {

    document.getElementById(
      "orderMessage"
    ).textContent =
      "Customer, Item and Quantity required.";

    return;
  }


  const party =
    partyByDocument(documentNo);


  const order = {

    id:
      "ORD-" + Date.now(),

    createdAt:
      new Date().toISOString(),

    document:
      documentNo,

    customer:
      party
        ? party.Name
        : "",

    partyGrp:
      party
        ? party.PartyGrp
        : "",

    itemCode,

    qty,

    remark

  };


  const orders =
    JSON.parse(
      localStorage.getItem(
        STORAGE.ORDERS
      ) || "[]"
    );


  orders.push(order);


  localStorage.setItem(
    STORAGE.ORDERS,
    JSON.stringify(orders)
  );


  document.getElementById(
    "orderMessage"
  ).innerHTML =
    `<span class="positive">
      Order saved: ${escapeHTML(order.id)}
    </span>`;
}


/* =========================================================
   TABS
========================================================= */

function setupTabs() {

  document
    .querySelectorAll(".tab")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(".tab")
            .forEach(b =>
              b.classList.remove("active")
            );


          document
            .querySelectorAll(".tab-content")
            .forEach(c =>
              c.classList.remove("active")
            );


          button.classList.add(
            "active"
          );


          document
            .getElementById(
              button.dataset.tab
            )
            .classList.add(
              "active"
            );
        }
      );
    });
}


/* =========================================================
   RESET FILTER
========================================================= */

function resetFilters() {

  document.getElementById(
    "customerFilter"
  ).value = "";

  document.getElementById(
    "groupFilter"
  ).value = "";

  document.getElementById(
    "monthFilter"
  ).value = "";

  document.getElementById(
    "itemFilter"
  ).value = "";

  renderDashboard();
}


/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {

  renderKPI();

  renderGroupSummary();

  renderBudgetTable();

  renderProductTable();

  renderStock();

  renderRawTable(
    "salesDataTable",
    validSales()
  );

  renderRawTable(
    "stockDataTable",
    DATA.stock
  );
}


function afterDataChange() {

  detectMonths();

  setupFilters();

  setupOrder();

  renderUploadStatus();

  renderDashboard();
}


/* =========================================================
   FILE INPUT EVENTS
========================================================= */

function setupUploadEvents() {

  document
    .getElementById("partyFile")
    .addEventListener(
      "change",
      async event => {

        const file =
          event.target.files[0];

        if (!file) return;


        const status =
          document.getElementById(
            "partyStatus"
          );


        try {

          status.className =
            "upload-info";

          status.textContent =
            "Uploading...";


          await uploadPartyMaster(file);


        } catch (e) {

          console.error(e);

          status.className =
            "upload-info error";

          status.textContent =
            e.message;
        }


        event.target.value = "";
      }
    );


  document
    .getElementById("salesFile")
    .addEventListener(
      "change",
      async event => {

        const file =
          event.target.files[0];

        if (!file) return;


        const status =
          document.getElementById(
            "salesStatus"
          );


        try {

          status.className =
            "upload-info";

          status.textContent =
            "Uploading...";


          await uploadSalesData(file);


        } catch (e) {

          console.error(e);

          status.className =
            "upload-info error";

          status.textContent =
            e.message;
        }


        event.target.value = "";
      }
    );


  document
    .getElementById("stockFile")
    .addEventListener(
      "change",
      async event => {

        const file =
          event.target.files[0];

        if (!file) return;


        const status =
          document.getElementById(
            "stockStatus"
          );


        try {

          status.className =
            "upload-info";

          status.textContent =
            "Uploading...";


          await uploadStockData(file);


        } catch (e) {

          console.error(e);

          status.className =
            "upload-info error";

          status.textContent =
            e.message;
        }


        event.target.value = "";
      }
    );
}


/* =========================================================
   FILTER EVENTS
========================================================= */

function setupFilterEvents() {

  [
    "customerFilter",
    "groupFilter",
    "monthFilter",
    "itemFilter"
  ].forEach(id => {

    document
      .getElementById(id)
      .addEventListener(
        "change",
        renderDashboard
      );
  });


  document
    .getElementById(
      "stockSearch"
    )
    .addEventListener(
      "input",
      renderStock
    );
}


/* =========================================================
   START
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    loadStorage();

    detectMonths();

    setupUploadEvents();

    setupFilterEvents();

    setupTabs();

    setupFilters();

    setupOrder();

    renderUploadStatus();

    renderDashboard();

  }
);
