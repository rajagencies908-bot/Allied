(() => {
"use strict";

const C = window.ALLIED_CONFIG,
sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY),
$ = x => document.getElementById(x),

mobileEmail = m =>
  String(m || "").replace(/\D/g, "") + "@allied.local",

txt = v => String(v ?? "").trim(),

num = v => {
  let n = Number(String(v ?? 0).replace(/[,₹ ]/g, ""));
  return isFinite(n) ? n : 0;
},

money = v =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(num(v)),

esc = v =>
  String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));


let S = {
  session: null,
  profile: null,
  party: [],
  sales: [],
  stock: [],
  orders: [],
  users: [],
  months: [],

  selMonths: new Set(),
  selGroups: new Set(),
  selDocs: new Set(),

  stockGroups: new Set(),
  stockItems: new Set(),

  gpage: 1,
  orderItems: []
};


function msg(e, t, ok = false) {
  e.textContent = t || "";
  e.className = "msg" + (ok ? " success" : "");
}


function toast(t) {
  $("toast").textContent = t;
  $("toast").classList.add("show");

  setTimeout(() => {
    $("toast").classList.remove("show");
  }, 2800);
}


function authView(id) {
  [
    "loadingScreen",
    "loginScreen",
    "recoveryScreen",
    "appScreen"
  ].forEach(x => {
    $(x).classList.toggle("hidden", x !== id);
  });
}


async function all(table) {
  let out = [];
  let a = 0;

  while (1) {
    let { data, error } =
      await sb
        .from(table)
        .select("*")
        .range(a, a + 999);

    if (error) throw error;

    out.push(...data);

    if (data.length < 1000)
      return out;

    a += 1000;
  }
}


function msort(a, b) {

  let M = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11
  };

  let f = x => {

    let z =
      x.match(/^([A-Za-z]{3})-(\d{2,4})$/);

    if (!z)
      return 999999;

    let y = +z[2];

    if (y < 100)
      y += 2000;

    return y * 12 +
      M[z[1].toLowerCase()];
  };

  return f(a) - f(b);
}


async function boot(session) {

  S.session = session;

  let { data: p, error } =
    await sb
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

  if (error)
    throw error;

  if (!p.is_active)
    throw Error(
      "Account inactive. Contact Admin."
    );

  S.profile = p;

  await load();

  authView("appScreen");

  $("userName").textContent =
    p.full_name ||
    session.user.email;

  $("userRole").textContent =
    p.role.toUpperCase();

  document
    .querySelectorAll(".adminOnly")
    .forEach(e =>
      e.classList.toggle(
        "hidden",
        p.role !== "admin"
      )
    );

  document
    .querySelectorAll(".targetOnly")
    .forEach(e =>
      e.classList.toggle(
        "hidden",
        !(
          p.role === "admin" ||
          p.target_access
        )
      )
    );

  render();

  if (p.role === "admin")
    loadUsers();
}


async function load() {

  [
    S.party,
    S.sales,
    S.stock
  ] = await Promise.all([
    all("party_master"),
    all("sales_data"),
    all("stock")
  ]);

  let set = new Set();

  S.sales.forEach(r =>
    Object
      .keys(r.month_sales || {})
      .forEach(m => {

        if (
          /^[A-Za-z]{3}-\d{2,4}$/.test(m)
        )
          set.add(m);

      })
  );

  S.months =
    [...set].sort(msort);

  if (!S.selMonths.size)
    S.months.forEach(
      m => S.selMonths.add(m)
    );

  await loadOrders();
}


function validSales() {

  let d =
    new Set(
      S.party.map(
        x => txt(x.document)
      )
    );

  return S.sales.filter(
    x =>
      d.has(
        txt(x.document)
      )
  );
}


function selectedParties() {

  return S.party.filter(x =>

    (
      !S.selGroups.size ||
      S.selGroups.has(
        txt(x.party_grp)
      )
    )

    &&

    (
      !S.selDocs.size ||
      S.selDocs.has(
        txt(x.document)
      )
    )

  );
}


function selectedSales() {

  let d =
    new Set(
      selectedParties()
        .map(
          x => txt(x.document)
        )
    );

  return validSales()
    .filter(
      x =>
        d.has(
          txt(x.document)
        )
    );
}


function activeMonths() {

  return S.months.filter(
    m =>
      S.selMonths.has(m)
  );
}


function amount(
  r,
  months = activeMonths()
) {

  return months.reduce(
    (a, m) =>
      a +
      num(
        r.month_sales?.[m]
      ),
    0
  );
}


function groupBudget(g) {

  let vals =
    S.party
      .filter(
        x =>
          txt(x.party_grp) ===
          txt(g)
      )
      .map(
        x => num(x.budget)
      )
      .filter(
        v => v > 0
      );

  return vals.length
    ? Math.max(...vals)
    : 0;
}


function makeMulti(
  id,
  items,
  set,
  label,
  onchange
) {

  let root = $(id);

  if (!root)
    return;

  let selected =
    items.filter(
      x =>
        set.has(x.value)
    );

  let caption =

    !selected.length ||
    selected.length === items.length

      ? `All ${label}`

      : selected.length === 1

        ? selected[0].label

        : `${selected.length} selected`;


  root.innerHTML = `

    <button
      type="button"
      class="multiBtn"
    >
      ${esc(caption)} ▾
    </button>

    <div class="multiPanel">

      <input
        class="multiSearch"
        placeholder="Search ${esc(label)}"
      >

      <div class="multiActions">

        <button
          type="button"
          class="selAll"
        >
          Select All
        </button>

        <button
          type="button"
          class="clearAll"
        >
          Unselect All
        </button>

      </div>

      <div class="multiList">

        ${items.map(x => `

          <label class="multiOpt">

            <input
              type="checkbox"
              value="${esc(x.value)}"
              ${set.has(x.value)
                ? "checked"
                : ""}
            >

            <span>
              ${esc(x.label)}
            </span>

          </label>

        `).join("")}

      </div>

    </div>
  `;


  root
    .querySelector(".multiBtn")
    .onclick = e => {

      e.stopPropagation();

      document
        .querySelectorAll(".multi")
        .forEach(x => {

          if (x !== root)
            x.classList.remove("open");

        });

      root.classList.toggle("open");
    };


  let search =
    root.querySelector(".multiSearch");

  search.onclick =
    e =>
      e.stopPropagation();


  search.oninput = () => {

    let q =
      search.value.toLowerCase();

    root
      .querySelectorAll(".multiOpt")
      .forEach(x => {

        x.style.display =
          x.textContent
            .toLowerCase()
            .includes(q)

            ? "flex"
            : "none";

      });
  };


  function sync() {

    set.clear();

    root
      .querySelectorAll(
        'input[type=checkbox]:checked'
      )
      .forEach(
        x =>
          set.add(x.value)
      );

    onchange();
  }


  root
    .querySelectorAll(
      'input[type=checkbox]'
    )
    .forEach(
      x =>
        x.onchange = sync
    );


  root
    .querySelector(".selAll")
    .onclick = e => {

      e.stopPropagation();

      root
        .querySelectorAll(
          '.multiOpt:not([style*="display: none"]) input'
        )
        .forEach(
          x =>
            x.checked = true
        );

      sync();
    };


  root
    .querySelector(".clearAll")
    .onclick = e => {

      e.stopPropagation();

      root
        .querySelectorAll(
          '.multiOpt:not([style*="display: none"]) input'
        )
        .forEach(
          x =>
            x.checked = false
        );

      sync();
    };
}


function filters() {

  makeMulti(
    "monthMulti",
    S.months.map(
      m => ({
        value: m,
        label: m
      })
    ),
    S.selMonths,
    "Months",
    render
  );


  let groups =
    [
      ...new Set(
        S.party
          .map(
            x =>
              txt(x.party_grp)
          )
          .filter(Boolean)
      )
    ]
      .sort()
      .map(
        g => ({
          value: g,
          label: g
        })
      );


  makeMulti(
    "groupMulti",
    groups,
    S.selGroups,
    "Party Groups",
    () => {

      S.selDocs.clear();

      render();
    }
  );


  let eligible =
    S.party.filter(
      x =>
        !S.selGroups.size ||
        S.selGroups.has(
          txt(x.party_grp)
        )
    );


  makeMulti(
    "customerMulti",

    eligible.map(
      x => ({
        value:
          txt(x.document),

        label:
          `${x.name || x.document} [${x.party_grp || "-"}]`
      })
    ),

    S.selDocs,

    "Customers",

    render
  );


  let sg =
    [
      ...new Set(
        S.stock
          .map(
            x =>
              txt(x.item_group)
          )
          .filter(Boolean)
      )
    ]
      .sort()
      .map(
        x => ({
          value: x,
          label: x
        })
      );


  makeMulti(
    "stockGroupMulti",
    sg,
    S.stockGroups,
    "Item Groups",
    stock
  );


  let si =
    S.stock
      .filter(
        x =>
          !S.stockGroups.size ||
          S.stockGroups.has(
            txt(x.item_group)
          )
      )
      .map(
        x => ({
          value:
            txt(x.item_code),

          label:
            `${x.item_code} - ${x.item_description || ""}`
        })
      );


  makeMulti(
    "stockItemMulti",
    si,
    S.stockItems,
    "Part Numbers",
    stock
  );
}


function kpis() {

  let p =
    selectedParties();

  let vs =
    selectedSales();

  let months =
    activeMonths();

  let sales =
    vs.reduce(
      (a, r) =>
        a +
        amount(
          r,
          months
        ),
      0
    );


  let gs =
    [
      ...new Set(
        p.map(
          x =>
            txt(x.party_grp)
        )
        .filter(Boolean)
      )
    ];


  let budget =
    gs.reduce(
      (a, g) =>
        a +
        groupBudget(g) *
        months.length,
      0
    );


  $("kSales").textContent =
    money(sales);

  $("kBudget").textContent =
    money(budget);

  $("kAch").textContent =
    (
      budget
        ? sales / budget * 100
        : 0
    ).toFixed(1) + "%";

  $("kCustomers").textContent =
    p.length;

  $("kGroups").textContent =
    gs.length;
}


function monthSummary() {

  let p =
    selectedParties();

  let vs =
    selectedSales();

  let months =
    activeMonths();


  let groupSet =
    [
      ...new Set(
        p.map(
          x =>
            txt(x.party_grp)
        )
        .filter(Boolean)
      )
    ];


  $("monthSummary").innerHTML =
    months.length

      ? months.map(m => {

        let sale =
          vs.reduce(
            (a, r) =>
              a +
              num(
                r.month_sales?.[m]
              ),
            0
          );


        let budget =
          groupSet.reduce(
            (a, g) =>
              a +
              groupBudget(g),
            0
          );


        let docs =
          new Set(
            vs
              .filter(
                r =>
                  num(
                    r.month_sales?.[m]
                  ) !== 0
              )
              .map(
                r =>
                  txt(r.document)
              )
          );


        let products =
          new Set(
            vs
              .filter(
                r =>
                  num(
                    r.month_sales?.[m]
                  ) !== 0
              )
              .map(
                r =>
                  txt(r.item_code)
              )
              .filter(Boolean)
          );


        let diff =
          sale - budget;


        let ach =
          budget
            ? sale / budget * 100
            : 0;


        return `

          <div class="monthCard">

            <h4>
              ${esc(m)}
            </h4>

            <div class="metric">
              <span>Sales</span>
              <b>${money(sale)}</b>
            </div>

            <div class="metric targetOnly">
              <span>Budget</span>
              <b>${money(budget)}</b>
            </div>

            <div class="metric targetOnly">

              <span>Difference</span>

              <b class="${
                diff >= 0
                  ? "positive"
                  : "negative"
              }">
                ${money(diff)}
              </b>

            </div>

            <div class="metric targetOnly">

              <span>Achievement</span>

              <b>
                ${ach.toFixed(1)}%
              </b>

            </div>

            <div class="metric">

              <span>
                Customers Billed
              </span>

              <b>
                ${docs.size}
              </b>

            </div>

            <div class="metric">

              <span>
                Products Sold
              </span>

              <b>
                ${products.size}
              </b>

            </div>

          </div>
        `;

      }).join("")

      : "<p>No month selected.</p>";


  document
    .querySelectorAll(".targetOnly")
    .forEach(e =>

      e.classList.toggle(

        "hidden",

        !(
          S.profile.role === "admin" ||
          S.profile.target_access
        )

      )

    );
}


function paginate(
  a,
  page,
  size
) {

  if (size === "all")

    return {
      a,
      page: 1,
      pages: 1,
      total: a.length
    };


  size =
    +size || 25;


  let pages =
    Math.max(
      1,
      Math.ceil(
        a.length / size
      )
    );


  page =
    Math.min(
      Math.max(
        1,
        page
      ),
      pages
    );


  return {

    a:
      a.slice(
        (page - 1) * size,
        page * size
      ),

    page,

    pages,

    total:
      a.length
  };
}


function pager(
  id,
  o,
  fn
) {

  let el = $(id);

  el.innerHTML =
    `<span>${o.total} rows</span> `;


  if (o.pages > 1)

    for (
      let i = 1;
      i <= o.pages;
      i++
    )

      if (
        i === 1 ||
        i === o.pages ||
        Math.abs(i - o.page) <= 2
      ) {

        let b =
          document.createElement(
            "button"
          );

        b.textContent = i;

        b.className =
          i === o.page
            ? "active"
            : "";

        b.onclick =
          () =>
            fn(i);

        el.appendChild(b);
      }
}


function groups() {

  let p =
    selectedParties();

  let vs =
    selectedSales();

  let months =
    activeMonths();

  let q =
    txt(
      $("groupSearch").value
    ).toLowerCase();


  let rows =
    [
      ...new Set(
        p.map(
          x =>
            txt(x.party_grp)
        )
        .filter(Boolean)
      )
    ]
      .map(g => {

        let shops =
          p.filter(
            x =>
              txt(x.party_grp) === g
          );


        let docs =
          new Set(
            shops.map(
              x =>
                txt(x.document)
            )
          );


        let gSales =
          vs.filter(
            x =>
              docs.has(
                txt(x.document)
              )
          );


        let m = {};


        months.forEach(mm => {

          let sale =
            gSales.reduce(
              (a, r) =>
                a +
                num(
                  r.month_sales?.[mm]
                ),
              0
            );


          let b =
            groupBudget(g);


          let products =
            new Set(
              gSales
                .filter(
                  r =>
                    num(
                      r.month_sales?.[mm]
                    ) !== 0
                )
                .map(
                  r =>
                    txt(r.item_code)
                )
                .filter(Boolean)
            );


          m[mm] = {
            sale,
            b,
            d:
              sale - b,
            products:
              products.size
          };

        });


        return {
          g,
          shops,
          m
        };

      })

      .filter(
        x =>
          (
            x.g +
            " " +
            x.shops
              .map(
                s =>
                  s.name
              )
              .join(" ")
          )
            .toLowerCase()
            .includes(q)
      );


  let o =
    paginate(
      rows,
      S.gpage,
      $("groupSize").value
    );


  S.gpage =
    o.page;


  $("groupHead").innerHTML = `

    <tr>

      <th>
        Party Group
      </th>

      <th>
        Customers / Shops
      </th>

      ${months.map(m => `

        <th>
          ${esc(m)} Sales
        </th>

        <th>
          ${esc(m)} Budget
        </th>

        <th>
          ${esc(m)} +/-
        </th>

        <th>
          ${esc(m)} Products
        </th>

      `).join("")}

      <th>
        Total Sales
      </th>

      <th>
        Total Budget
      </th>

      <th>
        Total +/-
      </th>

    </tr>
  `;


  $("groupBody").innerHTML =
    o.a.length

      ? o.a.map(x => {

        let ts =
          months.reduce(
            (a, m) =>
              a +
              x.m[m].sale,
            0
          );


        let tb =
          groupBudget(x.g) *
          months.length;


        let d =
          ts - tb;


        return `

          <tr>

            <td>
              <b>
                ${esc(x.g)}
              </b>
            </td>

            <td>

              <button
                class="expandBtn"
                type="button"
              >
                ${x.shops.length}
                shops
              </button>

              <div
                class="shops hidden"
              >
                ${x.shops
                  .map(
                    s =>
                      esc(
                        s.name ||
                        s.document
                      )
                  )
                  .join("<br>")}
              </div>

            </td>

            ${months.map(m => `

              <td>
                ${money(
                  x.m[m].sale
                )}
              </td>

              <td>
                ${money(
                  x.m[m].b
                )}
              </td>

              <td
                class="${
                  x.m[m].d >= 0
                    ? "positive"
                    : "negative"
                }"
              >
                ${money(
                  x.m[m].d
                )}
              </td>

              <td>
                ${x.m[m].products}
              </td>

            `).join("")}

            <td>
              <b>
                ${money(ts)}
              </b>
            </td>

            <td>
              <b>
                ${money(tb)}
              </b>
            </td>

            <td
              class="${
                d >= 0
                  ? "positive"
                  : "negative"
              }"
            >
              <b>
                ${money(d)}
              </b>
            </td>

          </tr>
        `;

      }).join("")

      : `
        <tr>
          <td>
            No data
          </td>
        </tr>
      `;


  $("groupBody")
    .querySelectorAll(
      ".expandBtn"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            b.nextElementSibling
              .classList
              .toggle("hidden")
    );


  pager(
    "groupPager",
    o,
    p => {

      S.gpage = p;

      groups();
    }
  );
}


function products() {

  let map =
    new Map();

  let q =
    txt(
      $("productSearch").value
    ).toLowerCase();

  let months =
    activeMonths();


  selectedSales()
    .forEach(r => {

      let k =
        txt(r.item_code) +
        "|" +
        txt(r.item_name);


      if (!map.has(k))

        map.set(
          k,
          {
            c:
              r.item_code,

            n:
              r.item_name,

            m: {},

            docs:
              new Set()
          }
        );


      months.forEach(m => {

        let v =
          num(
            r.month_sales?.[m]
          );


        map.get(k).m[m] =
          num(
            map.get(k).m[m]
          ) + v;


        if (v !== 0)

          map.get(k)
            .docs
            .add(
              txt(r.document)
            );

      });

    });


  let rows =
    [...map.values()]
      .filter(
        x =>
          (
            txt(x.c) +
            " " +
            txt(x.n)
          )
            .toLowerCase()
            .includes(q)
      );


  $("productHead").innerHTML = `

    <tr>

      <th>
        Item Code
      </th>

      <th>
        Item Name
      </th>

      ${months.map(m => `

        <th>
          ${esc(m)}
        </th>

      `).join("")}

      <th>
        Total
      </th>

      <th>
        Customers
      </th>

    </tr>
  `;


  $("productBody").innerHTML =
    rows.length

      ? rows.map(x => {

        let total =
          months.reduce(
            (a, m) =>
              a +
              num(x.m[m]),
            0
          );


        return `

          <tr>

            <td>
              <b>
                ${esc(x.c)}
              </b>
            </td>

            <td>
              ${esc(x.n)}
            </td>

            ${months.map(m => `

              <td>
                ${money(
                  x.m[m]
                )}
              </td>

            `).join("")}

            <td>
              <b>
                ${money(total)}
              </b>
            </td>

            <td>
              ${x.docs.size}
            </td>

          </tr>
        `;

      }).join("")

      : `

        <tr>

          <td colspan="${
            4 + months.length
          }">
            No data
          </td>

        </tr>
      `;
}


function stock() {

  let q =
    txt(
      $("stockSearch").value
    ).toLowerCase();


  let a =
    S.stock.filter(
      x =>

        (
          !S.stockGroups.size ||
          S.stockGroups.has(
            txt(x.item_group)
          )
        )

        &&

        (
          !S.stockItems.size ||
          S.stockItems.has(
            txt(x.item_code)
          )
        )

        &&

        [
          x.item_group,
          x.item_code,
          x.item_description,
          x.unit
        ].some(
          v =>
            txt(v)
              .toLowerCase()
              .includes(q)
        )
    );


  $("stockBody").innerHTML =
    a.length

      ? a.map(x => `

        <tr>

          <td>
            ${esc(x.item_group)}
          </td>

          <td>
            <b>
              ${esc(x.item_code)}
            </b>
          </td>

          <td>
            ${esc(x.item_description)}
          </td>

          <td>
            ${esc(x.unit)}
          </td>

          <td>
            ${num(x.closing_qty)}
          </td>

          <td>
            ${money(x.ho_rate)}
          </td>

        </tr>

      `).join("")

      : `

        <tr>

          <td colspan="6">
            No stock found
          </td>

        </tr>
      `;
}


function render() {

  filters();

  kpis();

  monthSummary();

  groups();

  products();

  stock();

  renderOrders();
}


async function loadOrders() {

  let {
    data,
    error
  } =
    await sb
      .from("sales_orders")
      .select(
        "*,sales_order_items(id,item_code,item_name,qty)"
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      );


  S.orders =
    error
      ? []
      : data;
}


function renderOrders() {

  $("ordersBody").innerHTML =
    S.orders.length
      ? S.orders.map(x => `
        <tr>
          <td>${esc(x.order_no)}</td>
          <td>${new Date(x.created_at).toLocaleString("en-IN")}</td>
          <td>${esc(x.customer_name)}</td>
          <td>${esc(x.party_grp)}</td>
          <td>${esc(x.order_taken_by)}</td>
          <td>${esc(x.status)}</td>
          <td>${x.sales_order_items?.length || 0}</td>
          <td class="order-actions">
            <button type="button" class="pdfOrder" data-id="${x.id}">PDF</button>
            ${S.profile?.role === "admin" ? `<button type="button" class="deleteOrder danger" data-id="${x.id}">Delete</button>` : ""}
          </td>
        </tr>
      `).join("")
      : `<tr><td colspan="8">No orders</td></tr>`;

  document.querySelectorAll(".pdfOrder").forEach(b => {
    b.onclick = () => downloadOrderPdf(+b.dataset.id);
  });

  document.querySelectorAll(".deleteOrder").forEach(b => {
    b.onclick = () => deleteOrder(+b.dataset.id);
  });
}

function downloadOrderPdf(id) {
  const o = S.orders.find(x => Number(x.id) === Number(id));
  if (!o) return toast("Order not found.");
  if (!window.jspdf?.jsPDF) return toast("PDF library not loaded. Refresh and try again.");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const items = o.sales_order_items || [];

  doc.setFontSize(18);
  doc.text("ALLIED - SALES ORDER", 14, 18);
  doc.setFontSize(11);
  doc.text("RAJ AGENCIES", 14, 26);
  doc.text(`Order No: ${o.order_no || "-"}`, 14, 38);
  doc.text(`Date: ${new Date(o.created_at).toLocaleString("en-IN")}`, 14, 45);
  doc.text(`Customer: ${o.customer_name || "-"}`, 14, 52);
  doc.text(`Party Group: ${o.party_grp || "-"}`, 14, 59);
  doc.text(`Order Taken By: ${o.order_taken_by || "-"}`, 14, 66);
  doc.text(`Status: ${o.status || "-"}`, 14, 73);

  doc.autoTable({
    startY: 82,
    head: [["Sr", "Item Code", "Item Name", "Qty"]],
    body: items.map((x, i) => [i + 1, x.item_code || "", x.item_name || "", x.qty || 0]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [22, 32, 51] }
  });

  const y = (doc.lastAutoTable?.finalY || 82) + 10;
  if (o.remark) doc.text(`Remark: ${o.remark}`, 14, y, { maxWidth: 180 });
  doc.save(`${o.order_no || "ALLIED-ORDER"}.pdf`);
}

async function deleteOrder(id) {
  if (S.profile?.role !== "admin") return toast("Admin access required.");
  const o = S.orders.find(x => Number(x.id) === Number(id));
  if (!o) return;
  if (!confirm(`Delete order ${o.order_no || id}? This cannot be undone.`)) return;

  const { error } = await sb.from("sales_orders").delete().eq("id", id);
  if (error) return toast(error.message);

  toast("Order deleted.");
  await loadOrders();
  renderOrders();
}

function nav(p) {

  document
    .querySelectorAll(".page")
    .forEach(
      x =>
        x.classList.add(
          "hidden"
        )
    );


  $(p)
    .classList
    .remove(
      "hidden"
    );


  document
    .querySelectorAll(
      "nav button"
    )
    .forEach(
      x =>
        x.classList.toggle(
          "active",
          x.dataset.page === p
        )
    );


  if (p === "users")
    loadUsers();
}


/* ======================================================
   PLACE ORDER

   IMPORTANT CHANGE:
   Dropdown now displays ONLY Item Code / Part Number.
   Item description is NOT shown inside dropdown.
   ====================================================== */

function buildOrderCustomerOptions(query = "") {
  const box = $("orderCustomerOptions");
  if (!box) return;
  const q = txt(query).trim().toLowerCase();
  const rows = S.party
    .filter(x => {
      const hay = [x.name, x.document, x.party_grp, x.mobile, x.city].map(txt).join(" ").toLowerCase();
      return !q || hay.includes(q);
    })
    .sort((a,b) => txt(a.name || a.document).localeCompare(txt(b.name || b.document), undefined, {numeric:true}))
    .slice(0, 300);

  box.innerHTML = rows.length
    ? rows.map(x => `<button type="button" class="search-option" data-doc="${esc(x.document)}">${esc(x.name || x.document)}</button>`).join("")
    : '<div class="search-empty">No customer found</div>';

  box.querySelectorAll(".search-option").forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      const c = S.party.find(x => txt(x.document) === txt(b.dataset.doc));
      if (!c) return;
      $("orderCustomer").value = c.document;
      $("orderCustomerSearch").value = c.name || c.document;
      $("orderGroup").value = c.party_grp || "";
      box.classList.add("hidden");
    };
  });
}

function openOrder() {
  S.orderItems = [];
  $("orderCustomer").value = "";
  $("orderCustomerSearch").value = "";
  $("orderCustomerOptions").classList.add("hidden");
  buildOrderCustomerOptions();

  $("orderItem").innerHTML =
    '<option value="">Select Item</option>' +
    S.stock.map(x => `<option value="${esc(x.item_code)}">${esc(x.item_code)}</option>`).join("");

  $("orderBy").value = S.profile.full_name || S.session.user.email;
  $("orderGroup").value = "";
  $("orderItemName").value = "";
  $("orderRemark").value = "";
  renderItems();
  $("orderModal").classList.remove("hidden");
}


function renderItems() {

  $("orderItems").innerHTML =
    S.orderItems.length

      ? S.orderItems.map(
        (x, i) => `

          <tr>

            <td>
              ${i + 1}
            </td>

            <td>
              ${esc(
                x.item_code
              )}
            </td>

            <td>
              ${esc(
                x.item_name
              )}
            </td>

            <td>
              ${x.qty}
            </td>

            <td>

              <button
                data-i="${i}"
                class="removeItem"
              >
                Remove
              </button>

            </td>

          </tr>

        `
      ).join("")

      : `

        <tr>

          <td colspan="5">
            No items added
          </td>

        </tr>
      `;


  document
    .querySelectorAll(
      ".removeItem"
    )
    .forEach(
      b =>
        b.onclick =
          () => {

            S.orderItems.splice(
              +b.dataset.i,
              1
            );

            renderItems();
          }
    );
}


async function submitOrder() {

  let c =
    S.party.find(
      x =>
        txt(x.document) ===
        txt(
          $("orderCustomer").value
        )
    );


  if (!c)
    return toast(
      "Select customer."
    );


  if (!S.orderItems.length)
    return toast(
      "Add at least one item."
    );


  let {
    data: o,
    error
  } =
    await sb
      .from("sales_orders")
      .insert({

        user_id:
          S.session.user.id,

        document:
          c.document,

        customer_name:
          c.name ||
          c.document,

        party_grp:
          c.party_grp,

        order_taken_by:
          S.profile.full_name ||
          S.session.user.email,

        status:
          "Pending",

        remark:
          txt(
            $("orderRemark").value
          )

      })
      .select()
      .single();


  if (error)
    return toast(
      error.message
    );


  let z =
    await sb
      .from(
        "sales_order_items"
      )
      .insert(

        S.orderItems.map(
          x => ({
            order_id:
              o.id,
            ...x
          })
        )

      );


  if (z.error)
    return toast(
      z.error.message
    );


  $("orderModal")
    .classList
    .add("hidden");


  await loadOrders();

  renderOrders();

  const savedOrder = S.orders.find(x => Number(x.id) === Number(o.id));

  const finalOrder = savedOrder || {
    ...o,
    sales_order_items: S.orderItems.map((x, i) => ({ id: i + 1, ...x }))
  };

  // Keep the just-created order available for immediate PDF generation.
  if (!S.orders.some(x => Number(x.id) === Number(finalOrder.id))) {
    S.orders.unshift(finalOrder);
  }

  // Clear the order-entry form only after the order has been saved.
  S.orderItems = [];
  renderItems();
  $("orderRemark").value = "";

  // IMPORTANT: after every successful order, always show the PDF choice.
  const successModal = $("orderSuccessModal");
  $("successOrderNo").textContent = finalOrder.order_no || `Order #${o.id}`;
  $("successPdfBtn").dataset.id = String(o.id);
  successModal.classList.remove("hidden");
  successModal.style.setProperty("display", "grid", "important");
  successModal.style.setProperty("z-index", "10000");

  toast("Order submitted successfully. PDF is ready.");
}


async function excel(f) {

  let b =
    await f.arrayBuffer();

  let w =
    XLSX.read(
      b,
      {
        type: "array"
      }
    );

  let s =
    w.Sheets[
      w.SheetNames[0]
    ];


  return XLSX.utils
    .sheet_to_json(
      s,
      {
        defval: "",
        raw: false
      }
    );
}


function cell(r, n) {

  let k =
    Object.keys(r)
      .find(
        k =>
          n.map(
            x =>
              x.toLowerCase()
          )
          .includes(
            txt(k)
              .toLowerCase()
          )
      );


  return k
    ? r[k]
    : "";
}


async function upload(type) {

  let file =
    $(type + "File")
      .files[0];


  let status =
    $(type + "Status");


  if (!file)

    return status.textContent =
      "Select Excel file.";


  try {

    status.textContent =
      "Uploading...";


    let raw =
      await excel(file);


    let rows;

    let fn;


    if (type === "party") {

      rows =
        raw.map(r => ({

          document:
            txt(
              cell(
                r,
                ["Document"]
              )
            ),

          name:
            txt(
              cell(
                r,
                ["Name"]
              )
            ),

          budget:
            num(
              cell(
                r,
                ["Budget"]
              )
            ),

          party_grp:
            txt(
              cell(
                r,
                ["PartyGrp"]
              )
            ),

          salesman:
            txt(
              cell(
                r,
                ["Salesman"]
              )
            ),

          area:
            txt(
              cell(
                r,
                ["Area"]
              )
            ),

          city:
            txt(
              cell(
                r,
                ["City"]
              )
            ),

          mobile:
            txt(
              cell(
                r,
                ["Mobile"]
              )
            ),

          segment:
            txt(
              cell(
                r,
                ["Segment"]
              )
            ),

          order_value:
            num(
              cell(
                r,
                ["Order"]
              )
            ),

          target:
            num(
              cell(
                r,
                ["Target"]
              )
            )

        }))
        .filter(
          x =>
            x.document
        );


      fn =
        "replace_party_master";

    }

    else if (
      type === "sales"
    ) {

      let ms =
        Object.keys(
          raw[0] || {}
        )
        .filter(
          x =>
            /^[A-Za-z]{3}-\d{2,4}$/
              .test(
                txt(x)
              )
        );


      rows =
        raw.map(r => {

          let m = {};

          ms.forEach(
            x =>
              m[x] =
                num(r[x])
          );


          return {

            party:
              txt(
                cell(
                  r,
                  ["Party"]
                )
              ),

            mobile:
              txt(
                cell(
                  r,
                  ["Mobile"]
                )
              ),

            main_grp:
              txt(
                cell(
                  r,
                  ["MainGrp"]
                )
              ),

            item_code:
              txt(
                cell(
                  r,
                  ["ItemCode"]
                )
              ),

            item_name:
              txt(
                cell(
                  r,
                  ["ItemName"]
                )
              ),

            document:
              txt(
                cell(
                  r,
                  ["Document"]
                )
              ),

            month_sales:
              m
          };
        });


      fn =
        "replace_sales_data";

    }

    else {

      rows =
        raw.map(r => ({

          item_group:
            txt(
              cell(
                r,
                ["ItemGroup"]
              )
            ),

          item_code:
            txt(
              cell(
                r,
                ["ItemCode"]
              )
            ),

          item_description:
            txt(
              cell(
                r,
                ["ItemDescription"]
              )
            ),

          unit:
            txt(
              cell(
                r,
                ["Unit"]
              )
            ),

          closing_qty:
            num(
              cell(
                r,
                ["ClosingQty"]
              )
            ),

          ho_rate:
            num(
              cell(
                r,
                ["HORate"]
              )
            )

        }))
        .filter(
          x =>
            x.item_code
        );


      fn =
        "replace_stock";
    }


    let {
      error
    } =
      await sb.rpc(
        fn,
        {
          p_rows:
            rows
        }
      );


    if (error)
      throw error;


    status.textContent =
      `Success: ${rows.length} rows`;


    await load();

    render();

  }

  catch (e) {

    status.textContent =
      "Error: " +
      e.message;

  }
}


function deviceToken() {
  const key = "allied_device_token_v1";
  let token = localStorage.getItem(key);
  if (!token) {
    token = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(key, token);
  }
  return token;
}

function deviceLabel() {
  const ua = navigator.userAgent || "Browser";
  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  let os = "Device";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad/.test(ua)) os = "iPhone/iPad";
  else if (/Mac OS/.test(ua)) os = "Mac";
  return `${browser} / ${os}`;
}

async function checkDevice() {
  return await userApi({
    action: "check_device",
    device_token: deviceToken(),
    device_label: deviceLabel()
  });
}

async function userApi(body) {

  let {
    data: {
      session
    }
  } =
    await sb.auth
      .getSession();


  let r =
    await fetch(

      `${C.SUPABASE_URL}/functions/v1/${C.USER_FUNCTION}`,

      {

        method:
          "POST",

        headers: {

          apikey:
            C.SUPABASE_KEY,

          Authorization:
            `Bearer ${session.access_token}`,

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify(
            body
          )
      }
    );


  let j =
    await r.json();


  if (
    !r.ok ||
    j.success === false
  )

    throw Error(
      j.message ||
      "User function error"
    );


  return j;
}


async function loadUsers() {

  if (
    S.profile.role !==
    "admin"
  )
    return;


  try {

    let j =
      await userApi({
        action:
          "list"
      });


    S.users =
      j.users || [];


    $("usersBody").innerHTML =
      S.users.map(u => `

        <tr>

          <td>
            ${esc(
              u.full_name
            )}
          </td>

          <td>
            ${esc(
              u.mobile
            )}
          </td>

          <td>
            ${esc(
              u.role
            )}
          </td>

          <td>
            ${
              u.target_access
                ? "Yes"
                : "No"
            }
          </td>

          <td>
            ${
              u.is_active
                ? "Active"
                : "Inactive"
            }
          </td>

          <td>${u.device_lock_enabled === false ? "OFF" : "ON"}</td>

          <td>${u.device_token_hash ? esc(u.device_label || "Registered") : "Available"}</td>

          <td>
            ${
              u.last_login

                ? new Date(
                    u.last_login
                  )
                  .toLocaleString(
                    "en-IN"
                  )

                : "-"
            }
          </td>

          <td>

            <button
              class="editUser"
              data-id="${u.id}"
            >
              Edit
            </button>

            <button
              class="pwdUser"
              data-id="${u.id}"
            >
              Password
            </button>

            <button
              class="resetDevice"
              data-id="${u.id}"
            >
              Reset Device
            </button>

            <button
              class="delUser"
              data-id="${u.id}"
            >
              Delete
            </button>

          </td>

        </tr>

      `).join("");


    document
      .querySelectorAll(
        ".editUser"
      )
      .forEach(
        b =>
          b.onclick =
            () =>
              editUser(
                b.dataset.id
              )
      );

    document
      .querySelectorAll(".resetDevice")
      .forEach(b => b.onclick = async () => {
        const u = S.users.find(x => x.id === b.dataset.id);
        if (!confirm(`Reset device for ${u?.full_name || "this user"}? Next login will register a new device.`)) return;
        try {
          await userApi({action:"reset_device", user_id:b.dataset.id});
          toast("Device reset successfully.");
          await loadUsers();
        } catch(e) { toast(e.message); }
      });

  }

  catch (e) {

    toast(
      e.message
    );
  }
}


function editUser(id) {

  let u =
    S.users.find(
      x =>
        x.id === id
    );


  $("editUserId").value =
    id;

  $("uName").value =
    u.full_name || "";

  $("uMobile").value =
    u.mobile || "";

  $("uPassword").value =
    "";

  $("uRole").value =
    u.role;

  $("uTarget").value =
    String(
      u.target_access
    );

  $("uDeviceLock").value =
    String(u.device_lock_enabled !== false);

  $("uStatus").value =
    String(
      u.is_active
    );


  $("statusBox")
    .classList
    .remove("hidden");


  $("userModalTitle")
    .textContent =
      "Edit User";


  $("userModal")
    .classList
    .remove("hidden");
}


async function saveUser() {

  try {

    let id =
      txt(
        $("editUserId").value
      );


    let p = {

      action:
        id
          ? "update"
          : "create",

      full_name:
        txt(
          $("uName").value
        ),

      mobile:
        txt(
          $("uMobile").value
        ),

      role:
        $("uRole").value,

      target_access:
        $("uTarget").value ===
        "true",

      device_lock_enabled:
        $("uDeviceLock").value ===
        "true"
    };


    if (id) {

      p.user_id =
        id;

      p.is_active =
        $("uStatus").value ===
        "true";


      if (
        $("uPassword").value
      )

        p.password =
          $("uPassword").value;

    }

    else {

      let mobile =
        txt(
          $("uMobile").value
        )
        .replace(
          /\D/g,
          ""
        );


      if (
        mobile.length < 10
      )

        throw Error(
          "Valid mobile number required."
        );


      p.mobile =
        mobile;

      p.email =
        mobileEmail(
          mobile
        );

      p.password =
        $("uPassword").value;


      if (
        p.password.length < 6
      )

        throw Error(
          "Password minimum 6 characters."
        );
    }


    await userApi(p);


    $("userModal")
      .classList
      .add("hidden");


    toast(
      "User saved."
    );


    loadUsers();

  }

  catch (e) {

    msg(
      $("userMessage"),
      e.message
    );
  }
}


function events() {

  $("loginForm")
    .onsubmit =
    async e => {

      e.preventDefault();


      msg(
        $("loginMessage"),
        ""
      );


      let mobile =
        txt(
          $("loginMobile").value
        )
        .replace(
          /\D/g,
          ""
        );


      if (
        mobile.length < 10
      )

        return msg(
          $("loginMessage"),
          "Valid mobile number enter karo."
        );


      let {
        data,
        error
      } =
        await sb.auth
          .signInWithPassword({

            email:
              mobileEmail(
                mobile
              ),

            password:
              $("loginPassword").value

          });


      if (error)

        return msg(
          $("loginMessage"),
          error.message
        );


      try {

        const device = await checkDevice();
        if (!device.allowed) {
          await sb.auth.signOut();
          return msg($("loginMessage"), device.message || "This account is locked to another device. Ask Admin to Reset Device.");
        }

        await boot(
          data.session
        );


        await sb
          .from("profiles")
          .update({

            last_login:
              new Date()
                .toISOString()

          })
          .eq(
            "id",
            data.session.user.id
          );

      }

      catch (x) {

        msg(
          $("loginMessage"),
          x.message
        );


        authView(
          "loginScreen"
        );
      }
    };


  $("togglePassword")
    .onclick = () => {

      let i =
        $("loginPassword");


      i.type =
        i.type === "password"
          ? "text"
          : "password";


      $("togglePassword")
        .textContent =
          i.type === "password"
            ? "Show"
            : "Hide";
    };


  $("recoveryForm")
    .onsubmit =
    async e => {

      e.preventDefault();


      let p =
        $("newPassword").value;


      if (
        p.length < 6
      )

        return msg(
          $("recoveryMessage"),
          "Minimum 6 characters."
        );


      if (
        p !==
        $("confirmPassword").value
      )

        return msg(
          $("recoveryMessage"),
          "Passwords do not match."
        );


      let {
        error
      } =
        await sb.auth
          .updateUser({
            password:
              p
          });


      if (error)

        return msg(
          $("recoveryMessage"),
          error.message
        );


      msg(
        $("recoveryMessage"),
        "Password updated successfully.",
        true
      );


      await sb.auth.signOut();


      history.replaceState(
        {},
        document.title,
        location.pathname
      );


      setTimeout(
        () =>
          authView(
            "loginScreen"
          ),
        600
      );
    };


  $("logoutBtn")
    .onclick =
    async () => {

      await sb.auth.signOut();

      authView(
        "loginScreen"
      );
    };


  document
    .querySelectorAll(
      "nav button"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            nav(
              b.dataset.page
            )
    );


  $("resetFilters")
    .onclick = () => {

      S.selMonths =
        new Set(
          S.months
        );

      S.selGroups.clear();

      S.selDocs.clear();

      S.stockGroups.clear();

      S.stockItems.clear();

      S.gpage = 1;

      render();
    };


  document
    .addEventListener(
      "click",
      () =>
        document
          .querySelectorAll(
            ".multi"
          )
          .forEach(
            x =>
              x.classList.remove(
                "open"
              )
          )
    );


  $("groupSearch")
    .oninput =
      groups;


  $("productSearch")
    .oninput =
      products;


  $("stockSearch")
    .oninput =
      stock;


  $("groupSize")
    .onchange =
      () => {

        S.gpage = 1;

        groups();
      };


  document
    .querySelectorAll(
      ".openOrder"
    )
    .forEach(
      b =>
        b.onclick =
          openOrder
    );


  document
    .querySelectorAll(
      ".closeOrder"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            $("orderModal")
              .classList
              .add("hidden")
    );


  $("orderCustomerSearch").onfocus = e => {
    buildOrderCustomerOptions(e.target.value);
    $("orderCustomerOptions").classList.remove("hidden");
  };

  $("orderCustomerSearch").oninput = e => {
    $("orderCustomer").value = "";
    $("orderGroup").value = "";
    buildOrderCustomerOptions(e.target.value);
    $("orderCustomerOptions").classList.remove("hidden");
  };

  $("orderCustomerSearch").onclick = e => e.stopPropagation();
  $("orderCustomerOptions").onclick = e => e.stopPropagation();

  document.addEventListener("click", () => {
    $("orderCustomerOptions")?.classList.add("hidden");
  });


  /*
     User selects ONLY Item Code
     from dropdown.

     Description is automatically
     filled into Item Name.
  */

  $("orderItem")
    .onchange = () => {

      let x =
        S.stock.find(
          s =>
            txt(s.item_code) ===
            txt(
              $("orderItem").value
            )
        );


      $("orderItemName").value =
        x?.item_description || "";
    };


  $("addItem")
    .onclick = () => {

      let x =
        S.stock.find(
          s =>
            txt(s.item_code) ===
            txt(
              $("orderItem").value
            )
        );


      let q =
        num(
          $("orderQty").value
        );


      if (
        !x ||
        q <= 0
      )

        return toast(
          "Select item and Qty."
        );


      let e =
        S.orderItems.find(
          i =>
            txt(i.item_code) ===
            txt(x.item_code)
        );


      if (e)

        e.qty += q;

      else

        S.orderItems.push({

          item_code:
            x.item_code,

          item_name:
            x.item_description,

          qty:
            q

        });


      renderItems();
    };


  $("clearOrder")
    .onclick = () => {

      S.orderItems = [];

      renderItems();
    };


  $("submitOrder")
    .onclick =
      submitOrder;


  $("successPdfBtn").onclick = () => {
    const id = Number($("successPdfBtn").dataset.id);
    if (id) downloadOrderPdf(id);
  };


  document.querySelectorAll(".closeOrderSuccess").forEach(b => {
    b.onclick = () => {
      const m = $("orderSuccessModal");
      m.classList.add("hidden");
      m.style.removeProperty("display");
      m.style.removeProperty("z-index");
    };
  });


  $("uploadParty")
    .onclick =
      () =>
        upload("party");


  $("uploadSales")
    .onclick =
      () =>
        upload("sales");


  $("uploadStock")
    .onclick =
      () =>
        upload("stock");


  $("addUserBtn")
    .onclick = () => {

      $("editUserId").value =
        "";

      $("uName").value =
        "";

      $("uMobile").value =
        "";

      $("uPassword").value =
        "";

      $("uRole").value =
        "user";

      $("uTarget").value =
        "true";

      $("uDeviceLock").value =
        "true";


      $("statusBox")
        .classList
        .add("hidden");


      $("userModalTitle")
        .textContent =
          "Add User";


      $("userModal")
        .classList
        .remove("hidden");
    };


  document
    .querySelectorAll(
      ".closeUser"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            $("userModal")
              .classList
              .add("hidden")
    );


  $("saveUser")
    .onclick =
      saveUser;
}


async function init() {

  events();


  let {
    data: {
      session
    }
  } =
    await sb.auth
      .getSession();


  if (
    location.hash.includes(
      "type=recovery"
    ) ||
    location.search.includes(
      "type=recovery"
    )
  )

    return authView(
      "recoveryScreen"
    );


  if (!session)

    return authView(
      "loginScreen"
    );


  try {

    const device = await checkDevice();
    if (!device.allowed) throw Error(device.message || "This account is locked to another device. Ask Admin to Reset Device.");

    await boot(
      session
    );

  }

  catch (e) {

    await sb.auth.signOut();

    authView(
      "loginScreen"
    );

    msg(
      $("loginMessage"),
      e.message
    );
  }
}


sb.auth
  .onAuthStateChange(
    (
      event,
      session
    ) => {

      if (
        event ===
        "PASSWORD_RECOVERY"
      ) {

        S.session =
          session;

        authView(
          "recoveryScreen"
        );
      }
    }
  );


init();

})();
