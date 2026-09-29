(() => {
  "use strict";

  const CFG = window.ALLIED_CONFIG;

  if (!CFG?.SUPABASE_URL || !CFG?.SUPABASE_KEY) {
    alert("Supabase configuration missing.");
    return;
  }

  const sb = window.supabase.createClient(
    CFG.SUPABASE_URL,
    CFG.SUPABASE_KEY
  );

  const state = {
    session: null,
    profile: null,

    party: [],
    sales: [],
    stock: [],
    orders: [],
    users: [],

    months: [],

    filters: {
      month: "",
      group: "",
      document: ""
    },

    groupPage: 1,
    groupPageSize: 25,

    budgetPage: 1,
    budgetPageSize: 25,

    orderItems: []
  };


  /* =========================================================
     HELPERS
  ========================================================= */

  const $ = id => document.getElementById(id);

  const text = value =>
    String(value ?? "").trim();

  const lower = value =>
    text(value).toLowerCase();

  const num = value => {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return 0;
    }

    const n = Number(
      String(value)
        .replace(/,/g, "")
        .replace(/[₹\s]/g, "")
    );

    return Number.isFinite(n) ? n : 0;
  };

  const money = value =>
    new Intl.NumberFormat(
      "en-IN",
      {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
      }
    ).format(num(value));

  const numberFormat = value =>
    new Intl.NumberFormat(
      "en-IN",
      {
        maximumFractionDigits: 2
      }
    ).format(num(value));

  const escapeHtml = value =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function showToast(message) {
    const el = $("toast");

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(
      () => el.classList.remove("show"),
      3000
    );
  }

  function showLoading(show = true) {
    $("loadingScreen")
      .classList
      .toggle("hidden", !show);
  }

  function setMessage(
    element,
    message,
    type = "error"
  ) {
    element.textContent = message || "";

    element.classList.remove(
      "message-error",
      "message-success"
    );

    if (message) {
      element.classList.add(
        type === "success"
          ? "message-success"
          : "message-error"
      );
    }
  }

  function monthSort(a, b) {
    const parse = value => {
      const m = text(value).match(
        /^([A-Za-z]{3})-(\d{2,4})$/
      );

      if (!m) {
        return Number.MAX_SAFE_INTEGER;
      }

      const months = [
        "jan", "feb", "mar", "apr",
        "may", "jun", "jul", "aug",
        "sep", "oct", "nov", "dec"
      ];

      let year = Number(m[2]);

      if (year < 100) {
        year += 2000;
      }

      return (
        year * 12 +
        months.indexOf(
          m[1].toLowerCase()
        )
      );
    };

    return parse(a) - parse(b);
  }

  function dateTime(value) {
    if (!value) return "";

    return new Date(value)
      .toLocaleString("en-IN");
  }


  /* =========================================================
     AUTH
  ========================================================= */

  async function init() {
    showLoading(true);

    bindEvents();

    const {
      data: { session }
    } = await sb.auth.getSession();

    if (!session) {
      showLogin();
      showLoading(false);
      return;
    }

    await startSession(session);
  }

  async function login(event) {
    event.preventDefault();

    const button = $("loginButton");

    setMessage(
      $("loginMessage"),
      ""
    );

    button.disabled = true;
    button.textContent = "Signing in...";

    try {
      const {
        data,
        error
      } = await sb.auth.signInWithPassword({
        email: text($("loginEmail").value),
        password: $("loginPassword").value
      });

      if (error) {
        throw error;
      }

      await startSession(data.session);

    } catch (error) {
      setMessage(
        $("loginMessage"),
        error.message || "Login failed."
      );
    } finally {
      button.disabled = false;
      button.textContent = "Login";
    }
  }

  async function startSession(session) {
    showLoading(true);

    try {
      state.session = session;

      const {
        data: profile,
        error
      } = await sb
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (error) throw error;

      if (!profile?.is_active) {
        await sb.auth.signOut();
        throw new Error(
          "Your account is inactive. Contact Admin."
        );
      }

      state.profile = profile;

      await loadDatabase();

      showApp();

      if (profile.role === "admin") {
        loadUsers();
      }

    } catch (error) {
      console.error(error);

      await sb.auth.signOut();

      showLogin();

      setMessage(
        $("loginMessage"),
        error.message || "Unable to start session."
      );

    } finally {
      showLoading(false);
    }
  }

  async function logout() {
    await sb.auth.signOut();

    state.session = null;
    state.profile = null;

    showLogin();
  }

  function showLogin() {
    $("appScreen").classList.add("hidden");
    $("loginScreen").classList.remove("hidden");
  }

  function showApp() {
    $("loginScreen").classList.add("hidden");
    $("appScreen").classList.remove("hidden");

    const isAdmin =
      state.profile.role === "admin";

    document
      .querySelectorAll(".admin-only")
      .forEach(el =>
        el.classList.toggle(
          "hidden",
          !isAdmin
        )
      );

    const canSeeTargets =
      isAdmin ||
      state.profile.target_access === true;

    document
      .querySelectorAll(".target-section")
      .forEach(el =>
        el.classList.toggle(
          "hidden",
          !canSeeTargets
        )
      );

    $("headerUserName").textContent =
      state.profile.full_name ||
      state.session.user.email ||
      "User";

    $("headerUserRole").textContent =
      state.profile.role.toUpperCase();

    $("orderTakenBy").value =
      state.profile.full_name ||
      state.session.user.email ||
      "";

    renderAll();
  }


  /* =========================================================
     DATABASE LOAD
  ========================================================= */

  async function fetchAllRows(table, columns = "*") {
    const pageSize = 1000;
    let from = 0;
    let rows = [];

    while (true) {
      const {
        data,
        error
      } = await sb
        .from(table)
        .select(columns)
        .range(
          from,
          from + pageSize - 1
        );

      if (error) throw error;

      rows.push(...(data || []));

      if (!data || data.length < pageSize) {
        break;
      }

      from += pageSize;
    }

    return rows;
  }

  async function loadDatabase() {
    const [
      party,
      sales,
      stock
    ] = await Promise.all([
      fetchAllRows("party_master"),
      fetchAllRows("sales_data"),
      fetchAllRows("stock")
    ]);

    state.party = party;
    state.sales = sales;
    state.stock = stock;

    detectMonths();

    await loadOrders();
  }

  async function refreshDatabase() {
    showLoading(true);

    try {
      await loadDatabase();
      renderAll();

      showToast(
        "Dashboard refreshed successfully."
      );
    } catch (error) {
      console.error(error);
      showToast(
        error.message || "Refresh failed."
      );
    } finally {
      showLoading(false);
    }
  }


  /* =========================================================
     MONTHS / FILTERING
  ========================================================= */

  function detectMonths() {
    const months = new Set();

    state.sales.forEach(row => {
      const obj = row.month_sales || {};

      Object.keys(obj).forEach(key => {
        if (
          /^[A-Za-z]{3}-\d{2,4}$/.test(key)
        ) {
          months.add(key);
        }
      });
    });

    state.months =
      [...months].sort(monthSort);

    if (
      !state.filters.month ||
      !state.months.includes(
        state.filters.month
      )
    ) {
      state.filters.month =
        state.months[0] || "";
    }
  }

  function validDocumentSet() {
    return new Set(
      state.party
        .map(p => text(p.document))
        .filter(Boolean)
    );
  }

  function validSales() {
    const docs = validDocumentSet();

    return state.sales.filter(row =>
      docs.has(text(row.document))
    );
  }

  function selectedPartyRows() {
    return state.party.filter(row => {

      if (
        state.filters.group &&
        text(row.party_grp) !==
        state.filters.group
      ) {
        return false;
      }

      if (
        state.filters.document &&
        text(row.document) !==
        state.filters.document
      ) {
        return false;
      }

      return true;
    });
  }

  function selectedDocuments() {
    return new Set(
      selectedPartyRows()
        .map(row => text(row.document))
    );
  }

  function selectedSalesRows() {
    const docs = selectedDocuments();

    return validSales().filter(row =>
      docs.has(text(row.document))
    );
  }

  function rowSalesForMonth(row, month) {
    return num(
      row?.month_sales?.[month]
    );
  }

  function rowSalesAllMonths(row) {
    return state.months.reduce(
      (sum, month) =>
        sum +
        rowSalesForMonth(row, month),
      0
    );
  }

  function selectedRowSales(row) {
    if (state.filters.month) {
      return rowSalesForMonth(
        row,
        state.filters.month
      );
    }

    return rowSalesAllMonths(row);
  }


  /* =========================================================
     BUDGET RULE
  ========================================================= */

  function monthlyGroupBudget(group) {
    const budgets =
      state.party
        .filter(
          p =>
            text(p.party_grp) ===
            text(group)
        )
        .map(p => num(p.budget))
        .filter(v => v > 0);

    return budgets.length
      ? Math.max(...budgets)
      : 0;
  }

  function selectedBudgetMultiplier() {
    return state.filters.month
      ? 1
      : Math.max(
          state.months.length,
          1
        );
  }


  /* =========================================================
     RENDER FILTERS
  ========================================================= */

  function renderFilters() {
    const month = $("monthFilter");

    month.innerHTML =
      `<option value="">All Months</option>` +
      state.months
        .map(
          m =>
            `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`
        )
        .join("");

    month.value =
      state.filters.month;


    const groups =
      [...new Set(
        state.party
          .map(p => text(p.party_grp))
          .filter(Boolean)
      )]
      .sort((a,b) =>
        a.localeCompare(b)
      );

    $("groupFilter").innerHTML =
      `<option value="">All Party Groups</option>` +
      groups
        .map(
          g =>
            `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`
        )
        .join("");

    $("groupFilter").value =
      state.filters.group;


    const customers =
      state.party
        .filter(row =>
          !state.filters.group ||
          text(row.party_grp) ===
          state.filters.group
        )
        .slice()
        .sort((a,b) =>
          text(a.name).localeCompare(
            text(b.name)
          )
        );

    $("customerFilter").innerHTML =
      `<option value="">All Customers</option>` +
      customers
        .map(row =>
          `<option value="${escapeHtml(row.document)}">
             ${escapeHtml(row.name || row.document)}
           </option>`
        )
        .join("");

    $("customerFilter").value =
      state.filters.document;
  }


  /* =========================================================
     KPI
  ========================================================= */

  function renderKpis() {
    const salesRows =
      selectedSalesRows();

    const sales =
      salesRows.reduce(
        (sum,row) =>
          sum +
          selectedRowSales(row),
        0
      );

    const partyRows =
      selectedPartyRows();

    const groups =
      [...new Set(
        partyRows
          .map(p => text(p.party_grp))
          .filter(Boolean)
      )];

    const multiplier =
      selectedBudgetMultiplier();

    const budget =
      groups.reduce(
        (sum,g) =>
          sum +
          monthlyGroupBudget(g) *
          multiplier,
        0
      );

    const achievement =
      budget > 0
        ? sales / budget * 100
        : 0;

    $("kpiSales").textContent =
      money(sales);

    $("kpiBudget").textContent =
      money(budget);

    $("kpiAchievement").textContent =
      `${achievement.toFixed(1)}%`;

    $("kpiCustomers").textContent =
      partyRows.length;

    $("kpiGroups").textContent =
      groups.length;
  }


  /* =========================================================
     GROUP TABLE
  ========================================================= */

  function getGroupRows() {
    const partyRows =
      selectedPartyRows();

    const groups =
      [...new Set(
        partyRows
          .map(p => text(p.party_grp))
          .filter(Boolean)
      )];

    const salesRows =
      selectedSalesRows();

    const multiplier =
      selectedBudgetMultiplier();

    return groups.map(group => {

      const docs = new Set(
        partyRows
          .filter(
            p =>
              text(p.party_grp) ===
              group
          )
          .map(p => text(p.document))
      );

      const sales =
        salesRows
          .filter(row =>
            docs.has(
              text(row.document)
            )
          )
          .reduce(
            (sum,row) =>
              sum +
              selectedRowSales(row),
            0
          );

      const budget =
        monthlyGroupBudget(group) *
        multiplier;

      const diff =
        sales - budget;

      const achievement =
        budget > 0
          ? sales / budget * 100
          : 0;

      return {
        group,
        budget,
        sales,
        diff,
        achievement
      };
    });
  }

  function renderGroupTable() {
    let rows = getGroupRows();

    const search =
      lower($("groupSearch").value);

    if (search) {
      rows = rows.filter(row =>
        lower(row.group).includes(search)
      );
    }

    rows.sort(
      (a,b) =>
        a.group.localeCompare(b.group)
    );

    const result = paginate(
      rows,
      state.groupPage,
      state.groupPageSize
    );

    state.groupPage =
      result.page;

    $("groupTableBody").innerHTML =
      result.rows.length
        ? result.rows.map(row => `
            <tr>
              <td><strong>${escapeHtml(row.group)}</strong></td>
              <td class="num">${money(row.budget)}</td>
              <td class="num">${money(row.sales)}</td>
              <td class="num ${row.diff >= 0 ? "positive" : "negative"}">
                ${money(row.diff)}
              </td>
              <td class="num">${row.achievement.toFixed(1)}%</td>
            </tr>
          `).join("")
        : emptyRow(5);

    renderPagination(
      $("groupPagination"),
      result,
      page => {
        state.groupPage = page;
        renderGroupTable();
      }
    );
  }


  /* =========================================================
     CUSTOMER BUDGET TABLE
  ========================================================= */

  function getBudgetRows() {
    const partyRows =
      selectedPartyRows();

    const salesRows =
      selectedSalesRows();

    const multiplier =
      selectedBudgetMultiplier();

    return partyRows.map(customer => {

      const document =
        text(customer.document);

      const sales =
        salesRows
          .filter(
            row =>
              text(row.document) ===
              document
          )
          .reduce(
            (sum,row) =>
              sum +
              selectedRowSales(row),
            0
          );

      /*
        PartyGrp monthly target applies to the group.
        Customer rows show the same group target context,
        without multiplying it into KPI/group totals.
      */
      const budget =
        monthlyGroupBudget(
          customer.party_grp
        ) * multiplier;

      return {
        document,
        customer:
          customer.name ||
          document,
        group:
          customer.party_grp || "",
        budget,
        sales,
        diff:
          sales - budget
      };
    });
  }

  function renderBudgetTable() {
    let rows = getBudgetRows();

    const search =
      lower($("budgetSearch").value);

    if (search) {
      rows = rows.filter(row =>
        lower(row.customer)
          .includes(search) ||
        lower(row.group)
          .includes(search) ||
        lower(row.document)
          .includes(search)
      );
    }

    rows.sort(
      (a,b) =>
        a.customer.localeCompare(
          b.customer
        )
    );

    const result = paginate(
      rows,
      state.budgetPage,
      state.budgetPageSize
    );

    state.budgetPage =
      result.page;

    $("budgetTableBody").innerHTML =
      result.rows.length
        ? result.rows.map(row => `
            <tr>
              <td>
                <strong>${escapeHtml(row.customer)}</strong>
                <div class="muted">${escapeHtml(row.document)}</div>
              </td>

              <td>${escapeHtml(row.group)}</td>

              <td class="num">
                ${money(row.budget)}
              </td>

              <td class="num">
                ${money(row.sales)}
              </td>

              <td class="num ${row.diff >= 0 ? "positive" : "negative"}">
                ${money(row.diff)}
              </td>
            </tr>
          `).join("")
        : emptyRow(5);

    renderPagination(
      $("budgetPagination"),
      result,
      page => {
        state.budgetPage = page;
        renderBudgetTable();
      }
    );
  }


  /* =========================================================
     PRODUCT TABLE
  ========================================================= */

  function renderProductTable() {
    const salesRows =
      selectedSalesRows();

    const map = new Map();

    salesRows.forEach(row => {
      const code =
        text(row.item_code);

      const name =
        text(row.item_name);

      const key =
        `${code}|||${name}`;

      if (!map.has(key)) {
        map.set(key, {
          code,
          name,
          months: {},
          total: 0
        });
      }

      const item =
        map.get(key);

      state.months.forEach(month => {
        const value =
          rowSalesForMonth(
            row,
            month
          );

        item.months[month] =
          num(item.months[month]) +
          value;

        item.total += value;
      });
    });

    let rows =
      [...map.values()];

    const search =
      lower($("productSearch").value);

    if (search) {
      rows = rows.filter(row =>
        lower(row.code).includes(search) ||
        lower(row.name).includes(search)
      );
    }

    rows.sort(
      (a,b) =>
        b.total - a.total
    );

    const months =
      state.filters.month
        ? [state.filters.month]
        : state.months;

    $("productTableHead").innerHTML = `
      <tr>
        <th>Item Code</th>
        <th>Item Name</th>
        ${months
          .map(
            m =>
              `<th class="num">${escapeHtml(m)}</th>`
          )
          .join("")}
        <th class="num">Total</th>
      </tr>
    `;

    $("productTableBody").innerHTML =
      rows.length
        ? rows.map(row => {

            const displayedTotal =
              months.reduce(
                (sum,m) =>
                  sum +
                  num(row.months[m]),
                0
              );

            return `
              <tr>
                <td>${escapeHtml(row.code)}</td>
                <td>${escapeHtml(row.name)}</td>

                ${months
                  .map(
                    m =>
                      `<td class="num">${money(row.months[m])}</td>`
                  )
                  .join("")}

                <td class="num">
                  <strong>${money(displayedTotal)}</strong>
                </td>
              </tr>
            `;
          }).join("")
        : emptyRow(
            3 + months.length
          );
  }


  /* =========================================================
     STOCK
  ========================================================= */

  function renderStock() {
    const search =
      lower($("stockSearch").value);

    let rows =
      state.stock.slice();

    if (search) {
      rows = rows.filter(row =>
        [
          row.item_group,
          row.item_code,
          row.item_description,
          row.unit
        ].some(v =>
          lower(v).includes(search)
        )
      );
    }

    rows.sort(
      (a,b) =>
        text(a.item_description)
          .localeCompare(
            text(b.item_description)
          )
    );

    $("stockCount").textContent =
      `${rows.length} items`;

    $("stockTableBody").innerHTML =
      rows.length
        ? rows.map(row => `
            <tr>
              <td>${escapeHtml(row.item_group)}</td>
              <td><strong>${escapeHtml(row.item_code)}</strong></td>
              <td>${escapeHtml(row.item_description)}</td>
              <td>${escapeHtml(row.unit)}</td>
              <td class="num">${numberFormat(row.closing_qty)}</td>
              <td class="num">${money(row.ho_rate)}</td>
            </tr>
          `).join("")
        : emptyRow(6);
  }


  /* =========================================================
     PAGINATION
  ========================================================= */

  function paginate(
    rows,
    requestedPage,
    size
  ) {
    if (size === "all") {
      return {
        rows,
        page: 1,
        pages: 1,
        total: rows.length
      };
    }

    const pageSize =
      Number(size) || 25;

    const pages =
      Math.max(
        1,
        Math.ceil(
          rows.length / pageSize
        )
      );

    const page =
      Math.min(
        Math.max(
          Number(requestedPage) || 1,
          1
        ),
        pages
      );

    const start =
      (page - 1) * pageSize;

    return {
      rows:
        rows.slice(
          start,
          start + pageSize
        ),
      page,
      pages,
      total: rows.length
    };
  }

  function renderPagination(
    container,
    result,
    onPage
  ) {
    if (
      result.pages <= 1
    ) {
      container.innerHTML =
        `<span class="muted">${result.total} rows</span>`;
      return;
    }

    const buttons = [];

    buttons.push(`
      <button
        class="page-btn"
        data-page="${Math.max(1,result.page - 1)}"
      >
        ‹
      </button>
    `);

    let start =
      Math.max(
        1,
        result.page - 2
      );

    let end =
      Math.min(
        result.pages,
        start + 4
      );

    start =
      Math.max(
        1,
        end - 4
      );

    for (
      let p = start;
      p <= end;
      p++
    ) {
      buttons.push(`
        <button
          class="page-btn ${p === result.page ? "active" : ""}"
          data-page="${p}"
        >
          ${p}
        </button>
      `);
    }

    buttons.push(`
      <button
        class="page-btn"
        data-page="${Math.min(result.pages,result.page + 1)}"
      >
        ›
      </button>
    `);

    container.innerHTML =
      `<span class="muted">${result.total} rows</span>` +
      buttons.join("");

    container
      .querySelectorAll(
        "[data-page]"
      )
      .forEach(btn => {
        btn.onclick = () =>
          onPage(
            Number(
              btn.dataset.page
            )
          );
      });
  }

  function emptyRow(cols) {
    return `
      <tr>
        <td
          colspan="${cols}"
          class="empty-cell"
        >
          No data found
        </td>
      </tr>
    `;
  }


  /* =========================================================
     ORDERS
  ========================================================= */

  async function loadOrders() {
    let query =
      sb
        .from("sales_orders")
        .select(`
          *,
          sales_order_items (
            id,
            item_code,
            item_name,
            qty
          )
        `)
        .order(
          "created_at",
          { ascending: false }
        );

    const {
      data,
      error
    } = await query;

    if (error) {
      console.error(error);
      state.orders = [];
      return;
    }

    state.orders = data || [];
  }

  function renderOrders() {
    $("ordersTableBody").innerHTML =
      state.orders.length
        ? state.orders.map(order => `
            <tr>
              <td>
                <strong>${escapeHtml(order.order_no)}</strong>
              </td>

              <td>
                ${escapeHtml(dateTime(order.created_at))}
              </td>

              <td>
                ${escapeHtml(order.customer_name)}
              </td>

              <td>
                ${escapeHtml(order.party_grp)}
              </td>

              <td>
                ${escapeHtml(order.order_taken_by)}
              </td>

              <td>
                <span class="status status-${lower(order.status)}">
                  ${escapeHtml(order.status)}
                </span>
              </td>

              <td class="num">
                ${order.sales_order_items?.length || 0}
              </td>
            </tr>
          `).join("")
        : emptyRow(7);
  }

  function openOrderModal() {
    state.orderItems = [];

    populateOrderCustomers();
    populateOrderStock();

    $("orderRemark").value = "";

    $("orderTakenBy").value =
      state.profile.full_name ||
      state.session.user.email ||
      "";

    renderOrderItems();

    $("orderModal")
      .classList
      .remove("hidden");
  }

  function closeOrderModal() {
    $("orderModal")
      .classList
      .add("hidden");
  }

  function populateOrderCustomers() {
    const rows =
      state.party
        .slice()
        .sort(
          (a,b) =>
            text(a.name)
              .localeCompare(
                text(b.name)
              )
        );

    $("orderCustomer").innerHTML =
      `<option value="">Select Customer</option>` +
      rows.map(row => `
        <option value="${escapeHtml(row.document)}">
          ${escapeHtml(row.name || row.document)}
        </option>
      `).join("");

    $("orderPartyGroup").value = "";
  }

  function populateOrderStock() {
    const rows =
      state.stock
        .slice()
        .sort(
          (a,b) =>
            text(a.item_description)
              .localeCompare(
                text(b.item_description)
              )
        );

    $("orderItemCode").innerHTML =
      `<option value="">Select Item</option>` +
      rows.map(row => `
        <option value="${escapeHtml(row.item_code)}">
          ${escapeHtml(row.item_code)} - ${escapeHtml(row.item_description)}
        </option>
      `).join("");

    $("orderItemName").value = "";
    $("orderQty").value = 1;
  }

  function orderCustomerChanged() {
    const document =
      text($("orderCustomer").value);

    const customer =
      state.party.find(
        row =>
          text(row.document) ===
          document
      );

    $("orderPartyGroup").value =
      customer?.party_grp || "";
  }

  function orderItemChanged() {
    const code =
      text($("orderItemCode").value);

    const item =
      state.stock.find(
        row =>
          text(row.item_code) === code
      );

    $("orderItemName").value =
      item?.item_description || "";
  }

  function addOrderItem() {
    const code =
      text($("orderItemCode").value);

    const qty =
      num($("orderQty").value);

    const item =
      state.stock.find(
        row =>
          text(row.item_code) === code
      );

    if (!item) {
      showToast(
        "Please select an item."
      );
      return;
    }

    if (qty <= 0) {
      showToast(
        "Qty must be greater than zero."
      );
      return;
    }

    const existing =
      state.orderItems.find(
        row =>
          row.item_code === code
      );

    if (existing) {
      existing.qty += qty;
    } else {
      state.orderItems.push({
        item_code:
          item.item_code,
        item_name:
          item.item_description,
        qty
      });
    }

    $("orderQty").value = 1;

    renderOrderItems();
  }

  function renderOrderItems() {
    $("orderItemsBody").innerHTML =
      state.orderItems.length
        ? state.orderItems
          .map((item,index) => `
            <tr>
              <td>${index + 1}</td>

              <td>
                ${escapeHtml(item.item_code)}
              </td>

              <td>
                ${escapeHtml(item.item_name)}
              </td>

              <td class="num">
                ${numberFormat(item.qty)}
              </td>

              <td>
                <button
                  class="btn btn-danger btn-small remove-order-item"
                  data-index="${index}"
                >
                  Remove
                </button>
              </td>
            </tr>
          `).join("")
        : emptyRow(5);

    document
      .querySelectorAll(
        ".remove-order-item"
      )
      .forEach(btn => {
        btn.onclick = () => {
          state.orderItems.splice(
            Number(btn.dataset.index),
            1
          );

          renderOrderItems();
        };
      });
  }

  function clearOrder() {
    state.orderItems = [];

    $("orderCustomer").value = "";
    $("orderPartyGroup").value = "";
    $("orderItemCode").value = "";
    $("orderItemName").value = "";
    $("orderQty").value = 1;
    $("orderRemark").value = "";

    renderOrderItems();
  }

  async function submitOrder() {
    const document =
      text($("orderCustomer").value);

    const customer =
      state.party.find(
        row =>
          text(row.document) ===
          document
      );

    if (!customer) {
      showToast(
        "Please select customer."
      );
      return;
    }

    if (!state.orderItems.length) {
      showToast(
        "Add at least one sales order item."
      );
      return;
    }

    const button =
      $("submitOrderBtn");

    button.disabled = true;
    button.textContent =
      "Submitting...";

    try {
      const {
        data: order,
        error: orderError
      } = await sb
        .from("sales_orders")
        .insert({
          user_id:
            state.session.user.id,

          document:
            customer.document,

          customer_name:
            customer.name ||
            customer.document,

          party_grp:
            customer.party_grp || "",

          order_taken_by:
            state.profile.full_name ||
            state.session.user.email,

          status:
            "Pending",

          remark:
            text($("orderRemark").value)
        })
        .select()
        .single();

      if (orderError) {
        throw orderError;
      }

      const items =
        state.orderItems.map(item => ({
          order_id:
            order.id,

          item_code:
            item.item_code,

          item_name:
            item.item_name,

          qty:
            item.qty
        }));

      const {
        error: itemError
      } = await sb
        .from("sales_order_items")
        .insert(items);

      if (itemError) {
        /*
          Best-effort cleanup if item insert fails.
        */
        await sb
          .from("sales_orders")
          .delete()
          .eq("id", order.id);

        throw itemError;
      }

      showToast(
        `Order ${order.order_no} submitted successfully.`
      );

      closeOrderModal();

      await loadOrders();
      renderOrders();

    } catch (error) {
      console.error(error);

      showToast(
        error.message ||
        "Unable to submit order."
      );

    } finally {
      button.disabled = false;
      button.textContent =
        "Submit Order";
    }
  }


  /* =========================================================
     EXCEL
  ========================================================= */

  async function readExcel(file) {
    const buffer =
      await file.arrayBuffer();

    const workbook =
      XLSX.read(
        buffer,
        {
          type: "array",
          cellDates: false
        }
      );

    const sheet =
      workbook.Sheets[
        workbook.SheetNames[0]
      ];

    return XLSX.utils.sheet_to_json(
      sheet,
      {
        defval: "",
        raw: false
      }
    );
  }

  function normalizeHeader(value) {
    return text(value)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function getCell(row, wanted) {
    const wantedNormalized =
      wanted.map(normalizeHeader);

    for (
      const [key,value]
      of Object.entries(row)
    ) {
      if (
        wantedNormalized.includes(
          normalizeHeader(key)
        )
      ) {
        return value;
      }
    }

    return "";
  }

  async function uploadParty(file) {
    const status =
      $("partyUploadStatus");

    try {
      status.textContent =
        "Reading Excel...";

      const raw =
        await readExcel(file);

      const rows =
        raw.map(row => ({
          document:
            text(
              getCell(
                row,
                ["Document"]
              )
            ),

          name:
            text(
              getCell(
                row,
                ["Name"]
              )
            ),

          budget:
            num(
              getCell(
                row,
                ["Budget"]
              )
            ),

          party_grp:
            text(
              getCell(
                row,
                ["PartyGrp"]
              )
            ),

          salesman:
            text(
              getCell(
                row,
                ["Salesman"]
              )
            ),

          area:
            text(
              getCell(
                row,
                ["Area"]
              )
            ),

          city:
            text(
              getCell(
                row,
                ["City"]
              )
            ),

          mobile:
            text(
              getCell(
                row,
                ["Mobile"]
              )
            ),

          segment:
            text(
              getCell(
                row,
                ["Segment"]
              )
            ),

          order_value:
            num(
              getCell(
                row,
                ["Order"]
              )
            ),

          target:
            num(
              getCell(
                row,
                ["Target"]
              )
            )
        }))
        .filter(row =>
          row.document
        );

      if (!rows.length) {
        throw new Error(
          "No valid Party Master rows found."
        );
      }

      status.textContent =
        `Uploading ${rows.length} rows...`;

      const {
        data,
        error
      } = await sb.rpc(
        "replace_party_master",
        {
          p_rows: rows
        }
      );

      if (error) throw error;

      status.textContent =
        `${data?.rows || rows.length} rows uploaded successfully.`;

      showToast(
        "Party Master updated."
      );

      await refreshDatabase();

    } catch (error) {
      console.error(error);

      status.textContent =
        `Error: ${error.message}`;
    } finally {
      $("partyFile").value = "";
    }
  }

  async function uploadSales(file) {
    const status =
      $("salesUploadStatus");

    try {
      status.textContent =
        "Reading Excel...";

      const raw =
        await readExcel(file);

      if (!raw.length) {
        throw new Error(
          "Sales file is empty."
        );
      }

      const headers =
        Object.keys(raw[0]);

      const monthHeaders =
        headers.filter(header =>
          /^[A-Za-z]{3}-\d{2,4}$/.test(
            text(header)
          )
        );

      if (!monthHeaders.length) {
        throw new Error(
          "No month columns found. Example: Apr-26"
        );
      }

      const rows =
        raw.map(row => {

          const month_sales = {};

          monthHeaders.forEach(month => {
            month_sales[text(month)] =
              num(row[month]);
          });

          return {
            party:
              text(
                getCell(
                  row,
                  ["Party"]
                )
              ),

            mobile:
              text(
                getCell(
                  row,
                  ["Mobile"]
                )
              ),

            main_grp:
              text(
                getCell(
                  row,
                  ["MainGrp"]
                )
              ),

            item_code:
              text(
                getCell(
                  row,
                  ["ItemCode"]
                )
              ),

            item_name:
              text(
                getCell(
                  row,
                  ["ItemName"]
                )
              ),

            document:
              text(
                getCell(
                  row,
                  ["Document"]
                )
              ),

            month_sales
          };
        });

      status.textContent =
        `Uploading ${rows.length} rows...`;

      const {
        data,
        error
      } = await sb.rpc(
        "replace_sales_data",
        {
          p_rows: rows
        }
      );

      if (error) throw error;

      status.textContent =
        `${data?.rows || rows.length} rows uploaded successfully.`;

      showToast(
        "Sales Data updated."
      );

      await refreshDatabase();

    } catch (error) {
      console.error(error);

      status.textContent =
        `Error: ${error.message}`;
    } finally {
      $("salesFile").value = "";
    }
  }

  async function uploadStock(file) {
    const status =
      $("stockUploadStatus");

    try {
      status.textContent =
        "Reading Excel...";

      const raw =
        await readExcel(file);

      const rows =
        raw.map(row => ({
          item_group:
            text(
              getCell(
                row,
                ["ItemGroup"]
              )
            ),

          item_code:
            text(
              getCell(
                row,
                ["ItemCode"]
              )
            ),

          item_description:
            text(
              getCell(
                row,
                ["ItemDescription"]
              )
            ),

          unit:
            text(
              getCell(
                row,
                ["Unit"]
              )
            ),

          closing_qty:
            num(
              getCell(
                row,
                ["ClosingQty"]
              )
            ),

          ho_rate:
            num(
              getCell(
                row,
                ["HORate"]
              )
            )
        }))
        .filter(row =>
          row.item_code
        );

      if (!rows.length) {
        throw new Error(
          "No valid Stock rows found."
        );
      }

      status.textContent =
        `Uploading ${rows.length} rows...`;

      const {
        data,
        error
      } = await sb.rpc(
        "replace_stock",
        {
          p_rows: rows
        }
      );

      if (error) throw error;

      status.textContent =
        `${data?.rows || rows.length} rows uploaded successfully.`;

      showToast(
        "Stock updated."
      );

      await refreshDatabase();

    } catch (error) {
      console.error(error);

      status.textContent =
        `Error: ${error.message}`;
    } finally {
      $("stockFile").value = "";
    }
  }


  /* =========================================================
     USER MANAGEMENT
  ========================================================= */

  async function callUserFunction(payload) {
    const {
      data: {
        session
      }
    } = await sb.auth.getSession();

    if (!session) {
      throw new Error(
        "Login session expired."
      );
    }

    const url =
      `${CFG.SUPABASE_URL}/functions/v1/${CFG.USER_FUNCTION}`;

    const response =
      await fetch(
        url,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "apikey":
              CFG.SUPABASE_KEY,

            "Authorization":
              `Bearer ${session.access_token}`
          },

          body:
            JSON.stringify(payload)
        }
      );

    const result =
      await response.json();

    if (
      !response.ok ||
      result.success === false
    ) {
      throw new Error(
        result.message ||
        "User operation failed."
      );
    }

    return result;
  }

  async function loadUsers() {
    if (
      state.profile?.role !== "admin"
    ) {
      return;
    }

    try {
      const result =
        await callUserFunction({
          action: "list"
        });

      state.users =
        result.users || [];

      renderUsers();

    } catch (error) {
      console.error(error);

      showToast(
        `User list: ${error.message}`
      );
    }
  }

  function renderUsers() {
    $("usersTableBody").innerHTML =
      state.users.length
        ? state.users.map(user => `
            <tr>
              <td>
                <strong>${escapeHtml(user.full_name)}</strong>
              </td>

              <td>
                ${escapeHtml(user.email)}
              </td>

              <td>
                ${escapeHtml(user.mobile)}
              </td>

              <td>
                ${escapeHtml(user.role)}
              </td>

              <td>
                ${user.target_access ? "Yes" : "No"}
              </td>

              <td>
                <span class="status ${user.is_active ? "status-active" : "status-inactive"}">
                  ${user.is_active ? "Active" : "Inactive"}
                </span>
              </td>

              <td>
                <button
                  class="btn btn-outline btn-small edit-user"
                  data-id="${escapeHtml(user.id)}"
                >
                  Edit
                </button>
              </td>
            </tr>
          `).join("")
        : emptyRow(7);

    document
      .querySelectorAll(
        ".edit-user"
      )
      .forEach(button => {
        button.onclick = () =>
          openEditUser(
            button.dataset.id
          );
      });
  }

  function openNewUser() {
    $("userModalTitle").textContent =
      "Add User";

    $("editUserId").value = "";
    $("userName").value = "";
    $("userEmail").value = "";
    $("userEmail").disabled = false;
    $("userMobile").value = "";
    $("userPassword").value = "";
    $("userRole").value = "user";
    $("userTargetAccess").value = "true";
    $("userStatus").value = "true";

    $("userStatusBox")
      .classList
      .add("hidden");

    setMessage(
      $("userFormMessage"),
      ""
    );

    $("userModal")
      .classList
      .remove("hidden");
  }

  function openEditUser(id) {
    const user =
      state.users.find(
        row =>
          row.id === id
      );

    if (!user) return;

    $("userModalTitle").textContent =
      "Edit User";

    $("editUserId").value =
      user.id;

    $("userName").value =
      user.full_name || "";

    $("userEmail").value =
      user.email || "";

    /*
      Current Edge Function update does not
      change email, so keep it read-only.
    */
    $("userEmail").disabled = true;

    $("userMobile").value =
      user.mobile || "";

    $("userPassword").value = "";

    $("userRole").value =
      user.role || "user";

    $("userTargetAccess").value =
      String(
        user.target_access === true
      );

    $("userStatus").value =
      String(
        user.is_active === true
      );

    $("userStatusBox")
      .classList
      .remove("hidden");

    setMessage(
      $("userFormMessage"),
      ""
    );

    $("userModal")
      .classList
      .remove("hidden");
  }

  function closeUserModal() {
    $("userModal")
      .classList
      .add("hidden");
  }

  async function saveUser() {
    const id =
      text($("editUserId").value);

    const name =
      text($("userName").value);

    const email =
      text($("userEmail").value);

    const mobile =
      text($("userMobile").value);

    const password =
      $("userPassword").value;

    if (!name) {
      setMessage(
        $("userFormMessage"),
        "Name required."
      );
      return;
    }

    if (!id && !email) {
      setMessage(
        $("userFormMessage"),
        "Email required."
      );
      return;
    }

    if (
      !id &&
      password.length < 6
    ) {
      setMessage(
        $("userFormMessage"),
        "Password minimum 6 characters."
      );
      return;
    }

    const button =
      $("saveUserBtn");

    button.disabled = true;
    button.textContent =
      "Saving...";

    setMessage(
      $("userFormMessage"),
      ""
    );

    try {
      if (id) {
        const payload = {
          action: "update",
          user_id: id,
          full_name: name,
          mobile,
          role:
            $("userRole").value,
          target_access:
            $("userTargetAccess").value ===
            "true",
          is_active:
            $("userStatus").value ===
            "true"
        };

        if (password) {
          if (password.length < 6) {
            throw new Error(
              "Password minimum 6 characters."
            );
          }

          payload.password =
            password;
        }

        await callUserFunction(
          payload
        );

      } else {
        await callUserFunction({
          action: "create",
          full_name: name,
          email,
          mobile,
          password,
          role:
            $("userRole").value,
          target_access:
            $("userTargetAccess").value ===
            "true"
        });
      }

      setMessage(
        $("userFormMessage"),
        "User saved successfully.",
        "success"
      );

      await loadUsers();

      setTimeout(
        closeUserModal,
        500
      );

    } catch (error) {
      console.error(error);

      setMessage(
        $("userFormMessage"),
        error.message ||
        "Unable to save user."
      );

    } finally {
      button.disabled = false;
      button.textContent =
        "Save User";
    }
  }


  /* =========================================================
     DATA COUNTS
  ========================================================= */

  function renderDatabaseCounts() {
    $("dbPartyCount").textContent =
      state.party.length;

    $("dbSalesCount").textContent =
      state.sales.length;

    $("dbStockCount").textContent =
      state.stock.length;
  }


  /* =========================================================
     NAVIGATION
  ========================================================= */

  function navigate(page) {
    if (
      (
        page === "users" ||
        page === "data"
      ) &&
      state.profile.role !== "admin"
    ) {
      return;
    }

    document
      .querySelectorAll(".page")
      .forEach(el =>
        el.classList.remove("active")
      );

    document
      .querySelectorAll(".nav-item")
      .forEach(el =>
        el.classList.remove("active")
      );

    $(`page-${page}`)
      ?.classList
      .add("active");

    document
      .querySelector(
        `.nav-item[data-page="${page}"]`
      )
      ?.classList
      .add("active");

    $("sidebar")
      .classList
      .remove("open");

    if (
      page === "users" &&
      state.profile.role === "admin"
    ) {
      loadUsers();
    }

    if (page === "orders") {
      loadOrders()
        .then(renderOrders);
    }
  }


  /* =========================================================
     MAIN RENDER
  ========================================================= */

  function renderDashboard() {
    renderFilters();
    renderKpis();
    renderGroupTable();
    renderBudgetTable();
    renderProductTable();
  }

  function renderAll() {
    renderDashboard();
    renderStock();
    renderOrders();
    renderDatabaseCounts();
  }


  /* =========================================================
     EVENTS
  ========================================================= */

  function bindEvents() {
    $("loginForm")
      .addEventListener(
        "submit",
        login
      );

    $("passwordToggle")
      .addEventListener(
        "click",
        () => {
          const input =
            $("loginPassword");

          const show =
            input.type ===
            "password";

          input.type =
            show
              ? "text"
              : "password";

          $("passwordToggle")
            .textContent =
              show
                ? "Hide"
                : "Show";
        }
      );

    $("logoutBtn")
      .addEventListener(
        "click",
        logout
      );

    $("mobileMenuBtn")
      .addEventListener(
        "click",
        () =>
          $("sidebar")
            .classList
            .toggle("open")
      );

    document
      .querySelectorAll(
        ".nav-item"
      )
      .forEach(item => {
        item.addEventListener(
          "click",
          () =>
            navigate(
              item.dataset.page
            )
        );
      });


    /* FILTERS */

    $("monthFilter")
      .addEventListener(
        "change",
        () => {
          state.filters.month =
            $("monthFilter").value;

          state.groupPage = 1;
          state.budgetPage = 1;

          renderDashboard();
        }
      );

    $("groupFilter")
      .addEventListener(
        "change",
        () => {
          state.filters.group =
            $("groupFilter").value;

          state.filters.document = "";

          state.groupPage = 1;
          state.budgetPage = 1;

          renderDashboard();
        }
      );

    $("customerFilter")
      .addEventListener(
        "change",
        () => {
          state.filters.document =
            $("customerFilter").value;

          if (
            state.filters.document
          ) {
            const customer =
              state.party.find(
                row =>
                  text(row.document) ===
                  state.filters.document
              );

            if (customer) {
              state.filters.group =
                text(
                  customer.party_grp
                );
            }
          }

          state.groupPage = 1;
          state.budgetPage = 1;

          renderDashboard();
        }
      );

    $("resetFiltersBtn")
      .addEventListener(
        "click",
        () => {
          state.filters = {
            month:
              state.months[0] || "",
            group: "",
            document: ""
          };

          state.groupPage = 1;
          state.budgetPage = 1;

          renderDashboard();
        }
      );


    /* TABLE SEARCH */

    $("groupSearch")
      .addEventListener(
        "input",
        () => {
          state.groupPage = 1;
          renderGroupTable();
        }
      );

    $("groupPageSize")
      .addEventListener(
        "change",
        () => {
          state.groupPageSize =
            $("groupPageSize").value;

          state.groupPage = 1;

          renderGroupTable();
        }
      );

    $("budgetSearch")
      .addEventListener(
        "input",
        () => {
          state.budgetPage = 1;
          renderBudgetTable();
        }
      );

    $("budgetPageSize")
      .addEventListener(
        "change",
        () => {
          state.budgetPageSize =
            $("budgetPageSize").value;

          state.budgetPage = 1;

          renderBudgetTable();
        }
      );

    $("productSearch")
      .addEventListener(
        "input",
        renderProductTable
      );

    $("stockSearch")
      .addEventListener(
        "input",
        renderStock
      );


    /* ORDER */

    $("openOrderBtn")
      .addEventListener(
        "click",
        openOrderModal
      );

    $("openOrderBtn2")
      .addEventListener(
        "click",
        openOrderModal
      );

    $("closeOrderModal")
      .addEventListener(
        "click",
        closeOrderModal
      );

    $("orderModal")
      .querySelector(
        ".modal-backdrop"
      )
      .addEventListener(
        "click",
        closeOrderModal
      );

    $("orderCustomer")
      .addEventListener(
        "change",
        orderCustomerChanged
      );

    $("orderItemCode")
      .addEventListener(
        "change",
        orderItemChanged
      );

    $("addOrderItemBtn")
      .addEventListener(
        "click",
        addOrderItem
      );

    $("clearOrderBtn")
      .addEventListener(
        "click",
        clearOrder
      );

    $("submitOrderBtn")
      .addEventListener(
        "click",
        submitOrder
      );


    /* USERS */

    $("addUserBtn")
      .addEventListener(
        "click",
        openNewUser
      );

    $("closeUserModal")
      .addEventListener(
        "click",
        closeUserModal
      );

    $("cancelUserBtn")
      .addEventListener(
        "click",
        closeUserModal
      );

    $("userModal")
      .querySelector(
        ".modal-backdrop"
      )
      .addEventListener(
        "click",
        closeUserModal
      );

    $("saveUserBtn")
      .addEventListener(
        "click",
        saveUser
      );


    /* UPLOADS */

    $("partyFile")
      .addEventListener(
        "change",
        event => {
          const file =
            event.target.files?.[0];

          if (file) {
            uploadParty(file);
          }
        }
      );

    $("salesFile")
      .addEventListener(
        "change",
        event => {
          const file =
            event.target.files?.[0];

          if (file) {
            uploadSales(file);
          }
        }
      );

    $("stockFile")
      .addEventListener(
        "change",
        event => {
          const file =
            event.target.files?.[0];

          if (file) {
            uploadStock(file);
          }
        }
      );
  }


  /* =========================================================
     AUTH STATE
  ========================================================= */

  sb.auth.onAuthStateChange(
    async (event, session) => {
      if (
        event === "SIGNED_OUT"
      ) {
        state.session = null;
        state.profile = null;
      }
    }
  );


  /* START */

  init();

})();
