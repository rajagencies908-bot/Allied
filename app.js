const $ = s => document.querySelector(s);

const N = v =>
  Number(String(v ?? 0).replace(/,/g, "")) || 0;

const M = n =>
  "₹" + Math.round(n).toLocaleString("en-IN");

const E = s =>
  String(s ?? "").replace(
    /[&<>"]/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    }[c])
  );

const D = {
  party: [
    {
      Document: "D001",
      Name: "A G H AUTO",
      Budget: 10000,
      PartyGrp: "4"
    },
    {
      Document: "D002",
      Name: "A G H MOTORS",
      Budget: "",
      PartyGrp: "4"
    },
    {
      Document: "D003",
      Name: "STAR AUTO",
      Budget: 15000,
      PartyGrp: "7"
    }
  ],

  sales: [
    {
      Document: "D001",
      Party: "A G H AUTO",
      ItemCode: "A100",
      ItemName: "Bearing A",
      "Apr-26": 6000,
      "May-26": 11000
    },
    {
      Document: "D002",
      Party: "A G H MOTORS",
      ItemCode: "B200",
      ItemName: "Bearing B",
      "Apr-26": 3000,
      "May-26": 2500
    },
    {
      Document: "D003",
      Party: "STAR AUTO",
      ItemCode: "A100",
      ItemName: "Bearing A",
      "Apr-26": 12000,
      "May-26": 17000
    }
  ],

  stock: [
    {
      ItemGroup: "Bearing",
      ItemCode: "A100",
      ItemDescription: "Bearing A",
      Unit: "PCS",
      ClosingQty: 25,
      HORate: 120
    },
    {
      ItemGroup: "Bearing",
      ItemCode: "B200",
      ItemDescription: "Bearing B",
      Unit: "PCS",
      ClosingQty: 8,
      HORate: 180
    }
  ]
};

let d = D;
let months = [];


/* =========================
   LOGIN
========================= */

window.go = function () {

  const mobile = String(
    $("#mobile")?.value || ""
  ).trim();

  const pin = String(
    $("#pin")?.value || ""
  ).trim();

  const err = $("#err");

  if (
    mobile !== "9999999999" ||
    pin !== "1234"
  ) {

    if (err) {
      err.textContent =
        "Wrong test login. Use 9999999999 / 1234";
    }

    return false;
  }

  if (err) {
    err.textContent = "";
  }

  $("#login").classList.add("hide");
  $("#app").classList.remove("hide");

  init();

  return false;
};


/* =========================
   DOCUMENT FILTER
========================= */

const docs = () =>
  new Set(
    d.party.map(x =>
      String(x.Document).trim()
    )
  );

const valid = () =>
  d.sales.filter(x =>
    docs().has(
      String(x.Document).trim()
    )
  );


/* =========================
   PARTY GROUP BUDGET
========================= */

function gb(group) {

  const budgets = d.party
    .filter(x =>
      String(x.PartyGrp) ===
      String(group)
    )
    .map(x => N(x.Budget))
    .filter(Boolean);

  return budgets.length
    ? Math.max(...budgets)
    : 0;
}


/* =========================
   SELECT OPTIONS
========================= */

function opt(el, values, label) {

  el.innerHTML =
    '<option value="">' +
    label +
    "</option>" +

    values.map(x =>
      "<option>" +
      E(x) +
      "</option>"
    ).join("");
}


/* =========================
   INITIALIZE DASHBOARD
========================= */

function init() {

  months = [
    ...new Set(
      d.sales.flatMap(row =>
        Object.keys(row).filter(key =>
          /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2}$/i
            .test(key)
        )
      )
    )
  ];

  opt(
    $("#customer"),
    [...new Set(
      d.party.map(x => x.Name)
    )],
    "All Customers"
  );

  opt(
    $("#group"),
    [...new Set(
      d.party.map(x => x.PartyGrp)
    )],
    "All PartyGrp"
  );

  opt(
    $("#month"),
    months,
    "All Months"
  );

  [
    "customer",
    "group",
    "month",
    "item"
  ].forEach(id => {

    const element = $("#" + id);

    if (element) {
      element.oninput = render;
    }

  });

  if ($("#sq")) {
    $("#sq").oninput = stock;
  }

  render();
  stock();
}


/* =========================
   DASHBOARD RENDER
========================= */

function render() {

  const customer =
    $("#customer").value;

  const group =
    $("#group").value;

  const selectedMonth =
    $("#month").value;

  const itemSearch =
    $("#item").value
      .toLowerCase()
      .trim();


  /* Party Master selection */

  const parties = d.party.filter(p =>

    (!customer ||
      p.Name === customer)

    &&

    (!group ||
      String(p.PartyGrp) === group)

  );


  /* Allowed Documents */

  const allowedDocuments =
    new Set(
      parties.map(p =>
        String(p.Document)
      )
    );


  /* IMPORTANT:
     Sales only count when
     Document exists in
     Party Master
  */

  const salesRows =
    valid().filter(row =>

      allowedDocuments.has(
        String(row.Document)
      )

      &&

      (
        !itemSearch ||

        String(row.ItemCode)
          .toLowerCase()
          .includes(itemSearch)
      )

    );


  const selectedMonths =
    selectedMonth
      ? [selectedMonth]
      : months;


  /* TOTAL SALES */

  const totalSales =
    salesRows.reduce(
      (total, row) =>

        total +

        selectedMonths.reduce(
          (sum, month) =>
            sum + N(row[month]),
          0
        ),

      0
    );


  /* PARTY GROUPS */

  const groups = [
    ...new Set(
      parties.map(
        p => p.PartyGrp
      )
    )
  ];


  /* TOTAL BUDGET */

  const totalBudget =
    groups.reduce(
      (total, groupNo) =>
        total + gb(groupNo),
      0
    )
    *
    selectedMonths.length;


  /* KPI */

  $("#sales").textContent =
    M(totalSales);

  $("#budget").textContent =
    M(totalBudget);

  $("#ach").textContent =
    totalBudget
      ? (
          totalSales /
          totalBudget *
          100
        ).toFixed(1) + "%"
      : "0%";

  $("#cust").textContent =
    parties.length;


  /* =====================
     BUDGET VS ACTUAL TABLE
  ===================== */

  let budgetHTML =
    "<tr>" +
    "<th>Customer</th>" +
    "<th>PartyGrp</th>" +

    selectedMonths.map(month =>

      "<th>" + month + " Sales</th>" +
      "<th>" + month + " Budget</th>" +
      "<th>" + month + " Diff</th>"

    ).join("") +

    "</tr>";


  budgetHTML +=
    parties.map(party => {

      const partySales =
        salesRows.filter(row =>

          String(row.Document) ===
          String(party.Document)

        );

      const budget =
        gb(party.PartyGrp);


      return (

        "<tr>" +

        "<td>" +
        E(party.Name) +
        "</td>" +

        "<td>" +
        E(party.PartyGrp) +
        "</td>" +

        selectedMonths.map(month => {

          const sales =
            partySales.reduce(
              (total, row) =>
                total +
                N(row[month]),
              0
            );

          const diff =
            sales - budget;


          return (

            '<td class="num">' +
            M(sales) +
            "</td>" +

            '<td class="num">' +
            M(budget) +
            "</td>" +

            '<td class="num ' +
            (
              diff >= 0
                ? "pos"
                : "neg"
            ) +
            '">' +

            M(diff) +

            "</td>"

          );

        }).join("") +

        "</tr>"

      );

    }).join("");


  $("#bt").innerHTML =
    budgetHTML;


  /* =====================
     PRODUCT WISE SALES
  ===================== */

  const products = {};


  salesRows.forEach(row => {

    const key =
      row.ItemCode +
      "|" +
      row.ItemName;


    if (!products[key]) {

      products[key] = {

        code: row.ItemCode,

        name: row.ItemName

      };

    }


    selectedMonths.forEach(month => {

      products[key][month] =
        (
          products[key][month]
          || 0
        )
        +
        N(row[month]);

    });

  });


  let productHTML =

    "<tr>" +

    "<th>Code</th>" +
    "<th>Item</th>" +

    selectedMonths.map(month =>
      "<th>" +
      month +
      "</th>"
    ).join("") +

    "<th>Total</th>" +

    "</tr>";


  productHTML +=
    Object.values(products)
      .map(product => {

        const total =
          selectedMonths.reduce(
            (sum, month) =>
              sum +
              (
                product[month]
                || 0
              ),
            0
          );


        return (

          "<tr>" +

          "<td>" +
          E(product.code) +
          "</td>" +

          "<td>" +
          E(product.name) +
          "</td>" +

          selectedMonths.map(month =>

            '<td class="num">' +

            M(
              product[month]
              || 0
            ) +

            "</td>"

          ).join("") +

          '<td class="num">' +
          M(total) +
          "</td>" +

          "</tr>"

        );

      }).join("");


  $("#pt").innerHTML =
    productHTML;
}


/* =========================
   STOCK
========================= */

function stock() {

  const search =
    String(
      $("#sq")?.value || ""
    )
    .toLowerCase()
    .trim();


  const rows =
    d.stock.filter(row =>

      (
        String(row.ItemCode) +
        " " +
        String(row.ItemDescription)
      )
      .toLowerCase()
      .includes(search)

    );


  let html =

    "<tr>" +

    "<th>Group</th>" +
    "<th>Code</th>" +
    "<th>Description</th>" +
    "<th>Unit</th>" +
    "<th>Qty</th>" +
    "<th>HO Rate</th>" +

    "</tr>";


  html +=
    rows.map(row =>

      "<tr>" +

      "<td>" +
      E(row.ItemGroup) +
      "</td>" +

      "<td>" +
      E(row.ItemCode) +
      "</td>" +

      "<td>" +
      E(row.ItemDescription) +
      "</td>" +

      "<td>" +
      E(row.Unit) +
      "</td>" +

      '<td class="num">' +
      N(row.ClosingQty) +
      "</td>" +

      '<td class="num">' +
      M(row.HORate) +
      "</td>" +

      "</tr>"

    ).join("");


  $("#st").innerHTML =
    html;
}


/* =========================
   LOGIN BUTTON FIX
========================= */

document.addEventListener(
  "DOMContentLoaded",
  function () {

    const loginButton =
      document.querySelector(
        "#login button"
      );

    if (loginButton) {

      loginButton.type =
        "button";

      loginButton.onclick =
        window.go;

    }


    /* ENTER KEY LOGIN */

    ["mobile", "pin"]
      .forEach(id => {

        const input =
          document.getElementById(id);

        if (input) {

          input.addEventListener(
            "keydown",
            function (event) {

              if (
                event.key === "Enter"
              ) {

                event.preventDefault();

                window.go();

              }

            }
          );

        }

      });

  }
);
