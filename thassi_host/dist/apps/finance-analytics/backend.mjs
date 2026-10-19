import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// packages/sdk/src/db.ts
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
function parseCsv(csvText, explicitDelimiter) {
  const normalized = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) {
    return { headers: [], rows: [], delimiter: explicitDelimiter || "," };
  }
  const firstLine = normalized.split("\n")[0] || "";
  const delimiter = explicitDelimiter || (firstLine.split(";").length > firstLine.split(",").length ? ";" : firstLine.split("	").length > firstLine.split(",").length ? "	" : ",");
  const parsedRows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (ch === "\n") {
        currentRow.push(currentField.trim());
        if (currentRow.some((cell) => cell !== "")) {
          parsedRows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
      } else {
        currentField += ch;
      }
    }
  }
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell !== "")) {
      parsedRows.push(currentRow);
    }
  }
  if (parsedRows.length === 0) {
    return { headers: [], rows: [], delimiter };
  }
  const headers = parsedRows[0].map((h, idx) => sanitizeIdentifier(h || `col_${idx + 1}`, idx));
  const rows = parsedRows.slice(1);
  return { headers, rows, delimiter };
}
function sanitizeIdentifier(raw, fallbackIndex = 0) {
  const cleaned = raw.trim().toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!cleaned || /^[0-9]/.test(cleaned)) {
    return `col_${cleaned || fallbackIndex}`;
  }
  return cleaned;
}

// packages/sdk/src/index.ts
function defineThassiApp(setup) {
  return { setup };
}

// apps/finance-analytics/backend/index.ts
var DEFAULT_BUDGETS = [
  { category: "Groceries", monthly_limit: 450 },
  { category: "Housing & Utilities", monthly_limit: 1100 },
  { category: "Dining & Coffee", monthly_limit: 200 },
  { category: "Health & Fitness", monthly_limit: 120 },
  { category: "Subscriptions", monthly_limit: 80 },
  { category: "Transport", monthly_limit: 150 },
  { category: "Investments", monthly_limit: 800 },
  { category: "Shopping & Tech", monthly_limit: 250 }
];
function autoCategorizeTransaction(payee, notes = "", amount = 0) {
  const text = `${payee} ${notes}`.toLowerCase();
  if (amount > 0) {
    return "Income";
  }
  if (/notgroschen|flatex|trade republic|scalable|bitpanda|etf|sparplan|aktien|depot|invest|broker/.test(text)) {
    return "Investments";
  }
  if (/billa|spar |spar$|spar\b|interspar|eurospar|hofer|lidl|rewe|adeg|penny|unimarkt|denns|bio|supermarkt|grocer|bäckerei|baeckerei|fleischerei/.test(text)) {
    return "Groceries";
  }
  if (/kreditrate|sparkasse n|miete|wohnung|strom|gas|energie|evn|wien energie|internet|magenta|a1|drei|versicherung|generali|uniqa|allianz|wiener staedtische|gis|orf|obs|kontoführung|kontofuehrung|bereitstellung|sollzinsen|ablebensprovision|gemeinde/.test(text)) {
    return "Housing & Utilities";
  }
  if (/megaplex|kino|restaurant|cafe|coffee|bistro|pizza|kebab|burger|mcdonalds|mc donalds|sushi|lieferando|mjam|wolt|foodora|bar\b|gasthaus|wirtshaus|heuriger|lunch|dinner/.test(text)) {
    return "Dining & Coffee";
  }
  if (/fitness|gym|fitinn|mcfit|apotheke|arzt|doctor|dm\b|dm-|bipa|health|sport|therme|optik/.test(text)) {
    return "Health & Fitness";
  }
  if (/netflix|spotify|youtube|apple|openai|anthropic|claude|chatgpt|github|prime|disney|steam|playstation|xbox|abonnement|subscription/.test(text)) {
    return "Subscriptions";
  }
  if (/handyparken|oebb|öbb|wiener linien|tankstelle|omv|bp\b|shell|eni\b|avia|turmöl|turmoel|jet\b|uber|bolt|parken|parkgarage|asfinag|öamtc|oeamtc|ticket/.test(text)) {
    return "Transport";
  }
  return "Shopping & Tech";
}
function parseEuroAmount(raw) {
  const cleaned = raw.replace(/[€$£\s]/g, "").trim();
  if (!cleaned) return 0;
  if (cleaned.includes(",")) {
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    const n2 = Number(normalized);
    return Number.isFinite(n2) ? n2 : 0;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function normalizeDateString(raw) {
  const trimmed = raw.trim();
  const deMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (deMatch) {
    return `${deMatch[3]}-${deMatch[2]}-${deMatch[1]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
var LEGACY_DUMMY_PAYEES = [
  "Monthly Salary Deposit",
  "Wohnung Miete & Betriebskosten",
  "Flatex MSCI World ETF Sparplan",
  "SPAR Gourmet Einkauf",
  "Wien Energie / Strom & Gas Teilbetrag",
  "HOFER KG Filiale",
  "Fitness Studio Membership",
  "Specialty Coffee & Bakery",
  "BILLA Plus Einkauf",
  "Spotify & Cloud Storage Subscriptions",
  "\xD6BB Tickets & Klimaticket",
  "Shelly Smart Home Modules"
];
var index_default = defineThassiApp((ctx) => {
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_date TEXT NOT NULL,
      payee TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      account TEXT NOT NULL DEFAULT 'Girokonto',
      is_recurring INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS category_budgets (
      category TEXT PRIMARY KEY,
      monthly_limit REAL NOT NULL
    );
  `);
  for (const dummyPayee of LEGACY_DUMMY_PAYEES) {
    ctx.db.execute("DELETE FROM transactions WHERE payee = ?", [dummyPayee]);
  }
  const budgetCount = ctx.db.queryOne("SELECT COUNT(*) as cnt FROM category_budgets")?.cnt ?? 0;
  if (budgetCount === 0) {
    for (const b of DEFAULT_BUDGETS) {
      ctx.db.execute(
        "INSERT OR IGNORE INTO category_budgets (category, monthly_limit) VALUES (?, ?)",
        [b.category, b.monthly_limit]
      );
    }
  }
  function resolveDefaultTargetMonth() {
    const months = ctx.db.query(`
      SELECT
        substr(tx_date, 1, 7) as ym,
        COUNT(*) as cnt,
        SUM(CASE WHEN amount > 500 THEN amount ELSE 0 END) as inc
      FROM transactions
      GROUP BY ym
      ORDER BY ym DESC
    `);
    if (months.length === 0) return (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
    const fullMonth = months.find((m) => m.cnt >= 10 || m.inc > 1e3);
    return fullMonth ? fullMonth.ym : months[0].ym;
  }
  async function computeSummaryAndPublishSensors(monthFilter) {
    const activeMonth = monthFilter && monthFilter !== "all" ? monthFilter : resolveDefaultTargetMonth();
    const whereClause = monthFilter === "all" ? "1=1" : "substr(tx_date, 1, 7) = ?";
    const params = monthFilter === "all" ? [] : [activeMonth];
    const totals = ctx.db.queryOne(
      `
      SELECT
        COALESCE(ROUND(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 2), 0) as income,
        COALESCE(ROUND(SUM(CASE WHEN amount < 0 AND category != 'Investments' THEN ABS(amount) ELSE 0 END), 2), 0) as expenses,
        COALESCE(ROUND(SUM(CASE WHEN amount < 0 AND category = 'Investments' THEN ABS(amount) ELSE 0 END), 2), 0) as investments,
        COALESCE(ROUND(SUM(amount), 2), 0) as net
      FROM transactions
      WHERE ${whereClause}
    `,
      params
    ) || { income: 0, expenses: 0, investments: 0, net: 0 };
    const groceriesRow = ctx.db.queryOne(
      `
      SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as total
      FROM transactions
      WHERE amount < 0 AND category = 'Groceries' AND ${whereClause}
    `,
      params
    );
    const grocerySpend = groceriesRow?.total ?? 0;
    const totalSavedOrInvested = Math.max(0, totals.income - totals.expenses);
    const savingsRatePct = totals.income > 0 ? Number((totalSavedOrInvested / totals.income * 100).toFixed(1)) : 0;
    ctx.sharedDb.kvSet("finance_summary", {
      activeMonth,
      income: totals.income,
      expenses: totals.expenses,
      investments: totals.investments,
      netCashflow: totals.net,
      grocerySpend,
      savingsRatePct,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    const haStatus = await ctx.ha.getStatus();
    if (haStatus.connected) {
      await ctx.ha.publishSensor("net_cashflow", totals.net, {
        friendly_name: `Net Cashflow (${activeMonth})`,
        unit_of_measurement: "EUR",
        icon: "mdi:cash-multiple",
        period_month: activeMonth,
        income_eur: totals.income,
        expenses_eur: totals.expenses,
        investments_eur: totals.investments,
        savings_rate_pct: savingsRatePct
      });
      await ctx.ha.publishSensor("monthly_expenses", totals.expenses, {
        friendly_name: `Living Expenses (${activeMonth})`,
        unit_of_measurement: "EUR",
        icon: "mdi:credit-card-outline",
        period_month: activeMonth
      });
      await ctx.ha.publishSensor("grocery_spend", grocerySpend, {
        friendly_name: `Grocery Spend (${activeMonth})`,
        unit_of_measurement: "EUR",
        icon: "mdi:cart-check",
        period_month: activeMonth
      });
      await ctx.ha.publishSensor("savings_rate", savingsRatePct, {
        friendly_name: `Savings & Investment Rate (${activeMonth})`,
        unit_of_measurement: "%",
        icon: "mdi:piggy-bank-outline",
        period_month: activeMonth
      });
    }
    return {
      activeMonth,
      ...totals,
      grocerySpend,
      savingsRatePct,
      haConnected: haStatus.connected
    };
  }
  ctx.route("GET", "/overview", async (req, { db, sharedDb }) => {
    const requestedMonth = req.query.month || void 0;
    const kpis = await computeSummaryAndPublishSensors(requestedMonth);
    const activeMonth = kpis.activeMonth;
    const whereClause = requestedMonth === "all" ? "1=1" : "substr(tx_date, 1, 7) = ?";
    const params = requestedMonth === "all" ? [] : [activeMonth];
    const availableMonths = db.query("SELECT DISTINCT substr(tx_date, 1, 7) as ym FROM transactions ORDER BY ym DESC").map((r) => r.ym);
    const transactions = db.query(
      `SELECT * FROM transactions WHERE ${whereClause} ORDER BY tx_date DESC, id DESC LIMIT 250`,
      params
    );
    const budgets = db.query("SELECT * FROM category_budgets");
    const budgetMap = new Map(budgets.map((b) => [b.category, b.monthly_limit]));
    const rawCategories = db.query(
      `
      SELECT
        category,
        COUNT(*) as tx_count,
        ROUND(SUM(ABS(amount)), 2) as spent
      FROM transactions
      WHERE amount < 0 AND ${whereClause}
      GROUP BY category
      ORDER BY spent DESC
    `,
      params
    );
    const categoryBreakdown = rawCategories.map((c) => ({
      ...c,
      budgetLimit: budgetMap.get(c.category) ?? 300
    }));
    const recurringFixed = db.query(
      `SELECT * FROM transactions WHERE is_recurring = 1 AND amount < 0 AND ${whereClause} ORDER BY ABS(amount) DESC`,
      params
    );
    const mealPlannerToday = sharedDb.kvGet("meal_planner_today");
    return {
      kpis,
      activeMonth,
      availableMonths,
      transactions,
      categoryBreakdown,
      recurringFixed,
      mealPlannerToday: mealPlannerToday || null
    };
  });
  ctx.route("POST", "/transactions", async (req, { db }) => {
    const body = req.body || {};
    if (!body.payee?.trim() || body.amount === void 0) {
      return { status: 400, body: { error: "Payee and amount are required" } };
    }
    const amt = Number(body.amount);
    const category = body.category?.trim() || autoCategorizeTransaction(body.payee, body.notes || "", amt);
    const txDate = body.tx_date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    db.execute(
      `INSERT INTO transactions (tx_date, payee, category, amount, account, is_recurring, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        txDate,
        body.payee.trim(),
        category,
        amt,
        (body.account || "Girokonto").trim(),
        body.is_recurring ? 1 : 0,
        (body.notes || "").trim()
      ]
    );
    const kpis = await computeSummaryAndPublishSensors();
    return { added: true, kpis };
  });
  ctx.route("DELETE", "/transactions", async (req, { db }) => {
    const id = Number(req.query.id);
    db.execute("DELETE FROM transactions WHERE id = ?", [id]);
    const kpis = await computeSummaryAndPublishSensors();
    return { deleted: id, kpis };
  });
  ctx.route("POST", "/budgets", (req, { db }) => {
    const body = req.body || {};
    if (!body.category || body.monthly_limit === void 0) {
      return { status: 400, body: { error: "category and monthly_limit are required" } };
    }
    db.execute(
      `INSERT INTO category_budgets (category, monthly_limit)
       VALUES (?, ?)
       ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit`,
      [body.category, Number(body.monthly_limit)]
    );
    return { updated: true };
  });
  ctx.route("POST", "/import-bank-csv", async (req, { db }) => {
    const body = req.body || {};
    if (!body.csvText?.trim()) {
      return { status: 400, body: { error: "csvText is required" } };
    }
    const { headers, rows } = parseCsv(body.csvText);
    if (headers.length === 0 || rows.length === 0) {
      return { status: 400, body: { error: "No rows found in CSV" } };
    }
    const findIdx = (patterns) => headers.findIndex((h) => patterns.some((p) => p.test(h)));
    const accountIdx = findIdx([/^eigener_kontoname$|^eigener kontoname$|^account$/i]);
    const dateIdx = Math.max(0, findIdx([/buchungsdatum|date|datum|buchungstag|valuta/i]));
    const payeeIdx = findIdx([/partnername|payee|empfaenger|auftraggeber|merchant|title/i]);
    const detailsIdx = findIdx([/buchungs_details|buchungs-details|buchungstext|description|verwendungszweck/i]);
    const payRefIdx = findIdx([/zahlungsreferenz|notiz/i]);
    const mandateIdx = findIdx([/mandats_id|mandats id|creditor_id|creditor id/i]);
    const amountIdx = findIdx([/^betrag$|amount|umsatz|wert|summe/i]);
    const catIdx = findIdx([/category|kategorie/i]);
    let importedCount = 0;
    db.exec("BEGIN TRANSACTION;");
    try {
      if (body.replaceAll) {
        db.exec("DELETE FROM transactions;");
      }
      for (const row of rows) {
        const rawDate = row[dateIdx] || "";
        const rawAmt = amountIdx >= 0 ? row[amountIdx] || "0" : row[row.length - 1] || "0";
        const amt = parseEuroAmount(rawAmt);
        if (amt === 0) continue;
        const partner = payeeIdx >= 0 ? (row[payeeIdx] || "").trim() : "";
        const details = detailsIdx >= 0 ? (row[detailsIdx] || "").trim() : "";
        const payRef = payRefIdx >= 0 ? (row[payRefIdx] || "").trim() : "";
        const mandate = mandateIdx >= 0 ? (row[mandateIdx] || "").trim() : "";
        const acct = accountIdx >= 0 && row[accountIdx]?.trim() || (body.accountName || "Girokonto").trim();
        const rawPayee = partner || (details.startsWith("Notgroschen zu ") ? "Sparkasse Notgroschen (Round-Up)" : details.slice(0, 60)) || payRef || "Bankbuchung";
        const notes = [details, payRef].filter(Boolean).join(" \u2022 ").slice(0, 180);
        const txDate = normalizeDateString(rawDate);
        const explicitCat = catIdx >= 0 ? (row[catIdx] || "").trim() : "";
        const category = explicitCat || autoCategorizeTransaction(rawPayee, notes, amt);
        const isRecurring = Boolean(mandate) || /kreditrate|versicherung|gehalt|miete|strom|evn|netflix|spotify/i.test(`${rawPayee} ${notes}`) ? 1 : 0;
        db.execute(
          `INSERT INTO transactions (tx_date, payee, category, amount, account, is_recurring, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [txDate, rawPayee, category, amt, acct, isRecurring, notes]
        );
        importedCount++;
      }
      db.exec("COMMIT;");
    } catch (err) {
      db.exec("ROLLBACK;");
      throw err;
    }
    const kpis = await computeSummaryAndPublishSensors();
    return { importedCount, kpis };
  });
  ctx.scheduleJob({
    id: "sync-finance-sensors",
    name: "Publish Finance & Budget Sensors to Home Assistant",
    description: "Publishes net_cashflow, monthly_expenses, grocery_spend, and savings_rate sensors to Home Assistant.",
    intervalMinutes: 30,
    runOnStart: true,
    handler: async () => {
      const kpis = await computeSummaryAndPublishSensors();
      return `[${kpis.activeMonth}] Income: \u20AC${kpis.income} | Expenses: \u20AC${kpis.expenses} | Investments: \u20AC${kpis.investments} | Savings Rate: ${kpis.savingsRatePct}%`;
    }
  });
});
export {
  autoCategorizeTransaction,
  index_default as default
};
