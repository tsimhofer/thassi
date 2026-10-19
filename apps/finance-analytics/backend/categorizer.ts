import {
  CATEGORY_DEFINITIONS,
  getCategoryMeta,
  type SunburstRing1Node,
  type TransactionRow,
} from '../shared/finance-types.js';

export interface CategorizationResult {
  category: string;
  isRecurring: number;
  normalizedPayee: string;
}

export function normalizePayeeName(rawPayee: string, rawNotes = ''): string {
  const p = (rawPayee || '').trim();
  const n = (rawNotes || '').trim();
  const combined = `${p} ${n}`.toLowerCase();

  if (combined.includes('notgroschen zu ')) {
    return 'Sparkasse Notgroschen (Round-Up)';
  }
  if (
    !p &&
    (combined.includes('kontoführung') ||
      combined.includes('bereitstellung') ||
      combined.includes('sollzinsen') ||
      combined.includes('ablebensprovision'))
  ) {
    return 'Sparkasse Kontoführung & Gebühren';
  }
  if (!p && (combined.includes('sb-auszahlung') || combined.includes('atm '))) {
    return 'Bankomat / SB-Auszahlung';
  }
  return p || n.slice(0, 60) || 'Bankbuchung';
}

export function autoCategorizeTransaction(
  payee: string,
  notes = '',
  amount = 0
): string {
  const text = `${payee} ${notes}`.toLowerCase();

  if (amount > 0) {
    return 'Income';
  }

  // 1. Notgroschen Round-Up & Investments
  if (
    /notgroschen|1003922331|at512025601003922331|flatex|trade republic|scalable|bitpanda|etf|sparplan|aktien|depot|invest|broker/.test(
      text
    )
  ) {
    return 'Investments';
  }

  // 2. Insurance & Banking Fees (Generali, GRAWE, Kreditkartenrechnung, Kontoführung)
  if (
    /generali|grazer wechselseitige|grawe|uniqa|allianz|wiener staedtische|lebensversicherung|unfallversich|0119636|5886-2773|kreditkartenrechnung|zuzahlung s kreditkarte|bereitstellung s kreditkarte|kontoführung|kontofuehrung|sollzinsen|bereitstellungsprovision|ablebensprovision|bartransaktionen|ksv-auskunft|klarna/.test(
      text
    ) &&
    !/5574-4113|besitz-versi|6010-4061|kraftfahrzeug/.test(text)
  ) {
    return 'Insurance & Finance';
  }

  // 3. Housing, Mortgage, Utilities & Home Insurance
  if (
    /kreditrate|00007-656648|sparkasse n|miete|wohnung|hausverwaltung|betriebskosten|strom|gas|energie|evn|wien energie|verbund|marktgemeinde|gemeinde|5574-4113|besitz-versi|haushaltsversicherung|orf-beitrag|gis|obs|hornbach|bauhaus|lagerhaus|obi\b/.test(
      text
    )
  ) {
    return 'Housing & Utilities';
  }

  // 4. Transport, Fuel, Parking & Car Insurance
  if (
    /6010-4061|kraftfahrzeug-versicherung|kfz|bp tankstelle|bp\b|jet 5|jet tank|jet\b|omv|shell|eni\b|turmöl|turmoel|diskont 8050|oil 529|tankstelle|handyparken|parkhaus|parken|apcoa|oebb|öbb|westbahn|wiener linien|uber|bolt|asfinag|öamtc|oeamtc|autohaus|sixt/.test(
      text
    )
  ) {
    return 'Transport';
  }

  // 5. Trafik & Kiosk
  if (/trafik|tabak|tabacchi|tabaccheri/.test(text)) {
    return 'Trafik & Kiosk';
  }

  // 6. Groceries & Supermarkets
  if (
    /billa|spar |spar$|spar\b|spar dankt|spar fil|interspar|eurospar|hofer|lidl|rewe|adeg|penny|unimarkt|mpreis|eurospin|denns|bio|supermarkt|grocer|selecta|bäckerei|baeckerei|ströck|stroeck|fleischerei/.test(
      text
    )
  ) {
    return 'Groceries';
  }

  // 7. Subscriptions, Internet & Digital Services
  if (
    /kabelplus|magenta|a1\b|drei\b|amznprime|amazon prime|prime video|amazon digital|netflix|spotify|youtube|apple|openai|anthropic|claude|chatgpt|github|figma|disney|steam|playstation|xbox|mrcr mobile pay|nuvei|abonnement|subscription/.test(
      text
    )
  ) {
    return 'Subscriptions';
  }

  // 8. Health, Doctor & Pharmacy
  if (
    /gruppenpraxis|zikulnig|apotheke|farma drugstore|arzt|doctor|fitness|gym|fitinn|mcfit|health|therme|optik|exclusive salon/.test(
      text
    )
  ) {
    return 'Health & Fitness';
  }

  // 9. Dining, Restaurants, Nightlife & Holiday Gastronomy
  if (
    /megaplex|kino|burger king|mcdonalds|mc donalds|kebab|turkoglu|gao xiang chen|chen 2371|pizzeria|autobahnrest|rosenberg|golden harp|ambra night|luna glam|kara food|asfodelo|al faro|impresa indivi|mostakim|fabiano bacciu|ananasso|san teodoro|alghero|olbia|cagliari|restaurant|cafe|coffee|bistro|pizza|burger|sushi|lieferando|mjam|wolt|foodora|gasthaus|wirtshaus|heuriger|lunch|dinner/.test(
      text
    )
  ) {
    return 'Dining & Coffee';
  }

  // 10. Cash Withdrawals & Private Person-to-Person Transfers
  if (
    /sb-auszahlung|atm |automat |barauszahlung|überweisung |ueberweisung |george-überweisung|veronika simhofer|patricia leuthner|lisa simhofer|charlotte simhofer|daniela hader|marco eder|andre gundinger|fridtjof bauer|florian karpf|karpf florian|david endrich|nico zadak|charlotte tezky|peter bittermann|david maierhofer/.test(
      text
    )
  ) {
    return 'Cash & Private';
  }

  // 11. Shopping, Drugstore & Tech
  return 'Shopping & Tech';
}

export function detectRecurringFlag(
  payee: string,
  notes: string,
  category: string,
  hasMandate = false
): number {
  const text = `${payee} ${notes}`.toLowerCase();
  if (text.includes('notgroschen zu ')) return 0;
  if (
    hasMandate ||
    category === 'Housing & Utilities' ||
    category === 'Insurance & Finance' ||
    category === 'Subscriptions' ||
    /kreditrate|versicherung|gehalt|arec|miete|strom|evn|kabelplus|netflix|spotify|amznprime/.test(
      text
    )
  ) {
    return 1;
  }
  return 0;
}

export function buildSunburstHierarchy(
  transactions: TransactionRow[],
  mode: 'groups' | 'merchants' = 'groups',
  excludeRoundUps = true
): {
  totalExpenses: number;
  ring1: SunburstRing1Node[];
} {
  const expenseTxs = transactions.filter((t) => {
    if (t.amount >= 0) return false;
    if (
      excludeRoundUps &&
      (t.payee.includes('Notgroschen') || t.notes.toLowerCase().includes('notgroschen zu '))
    ) {
      return false;
    }
    return true;
  });

  const totalExpenses = Number(
    expenseTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0).toFixed(2)
  );

  if (mode === 'groups') {
    const groupMap = new Map<
      string,
      {
        id: string;
        name: string;
        label: string;
        color: string;
        value: number;
        txCount: number;
        catMap: Map<string, { value: number; txCount: number }>;
      }
    >();

    for (const tx of expenseTxs) {
      const meta = getCategoryMeta(tx.category);
      const gKey = meta.group;
      if (!groupMap.has(gKey)) {
        groupMap.set(gKey, {
          id: gKey,
          name: meta.groupLabelDe,
          label: meta.groupLabelDe,
          color: meta.groupColor,
          value: 0,
          txCount: 0,
          catMap: new Map(),
        });
      }
      const g = groupMap.get(gKey)!;
      const amt = Math.abs(tx.amount);
      g.value += amt;
      g.txCount += 1;

      const curCat = g.catMap.get(tx.category) || { value: 0, txCount: 0 };
      curCat.value += amt;
      curCat.txCount += 1;
      g.catMap.set(tx.category, curCat);
    }

    const ring1: SunburstRing1Node[] = Array.from(groupMap.values())
      .map((g) => ({
        id: g.id,
        name: g.name,
        label: g.label,
        value: Number(g.value.toFixed(2)),
        color: g.color,
        txCount: g.txCount,
        children: Array.from(g.catMap.entries())
          .map(([catName, stat]) => {
            const cMeta = getCategoryMeta(catName);
            return {
              name: catName,
              label: `${cMeta.icon} ${cMeta.labelDe}`,
              value: Number(stat.value.toFixed(2)),
              color: cMeta.color,
              txCount: stat.txCount,
              filterCategory: catName,
            };
          })
          .sort((a, b) => b.value - a.value),
      }))
      .sort((a, b) => b.value - a.value);

    return { totalExpenses, ring1 };
  }

  // Mode: 'merchants' (Ring 1 = Categories, Ring 2 = Top Payees/Merchants)
  const catMap = new Map<
    string,
    {
      value: number;
      txCount: number;
      payeeMap: Map<string, { value: number; txCount: number }>;
    }
  >();

  for (const tx of expenseTxs) {
    const cat = tx.category || 'Shopping & Tech';
    if (!catMap.has(cat)) {
      catMap.set(cat, { value: 0, txCount: 0, payeeMap: new Map() });
    }
    const c = catMap.get(cat)!;
    const amt = Math.abs(tx.amount);
    c.value += amt;
    c.txCount += 1;

    const cleanPayee = tx.payee.slice(0, 28).trim() || 'Sonstige';
    const p = c.payeeMap.get(cleanPayee) || { value: 0, txCount: 0 };
    p.value += amt;
    p.txCount += 1;
    c.payeeMap.set(cleanPayee, p);
  }

  const ring1: SunburstRing1Node[] = Array.from(catMap.entries())
    .map(([catName, stat]) => {
      const meta = getCategoryMeta(catName);
      const sortedPayees = Array.from(stat.payeeMap.entries()).sort(
        (a, b) => b[1].value - a[1].value
      );
      const topPayees = sortedPayees.slice(0, 5);
      const restPayees = sortedPayees.slice(5);

      const children: SunburstRing1Node['children'] = topPayees.map(([payeeName, pStat]) => ({
        name: payeeName,
        label: payeeName,
        value: Number(pStat.value.toFixed(2)),
        color: meta.color,
        txCount: pStat.txCount,
        filterCategory: catName,
        filterPayee: payeeName,
      }));

      if (restPayees.length > 0) {
        const restVal = restPayees.reduce((s, [, r]) => s + r.value, 0);
        const restCnt = restPayees.reduce((s, [, r]) => s + r.txCount, 0);
        children.push({
          name: `Weitere (${restPayees.length})`,
          label: `Weitere (${restPayees.length})`,
          value: Number(restVal.toFixed(2)),
          color: meta.color,
          txCount: restCnt,
          filterCategory: catName,
        });
      }

      return {
        id: catName,
        name: catName,
        label: `${meta.icon} ${meta.labelDe}`,
        value: Number(stat.value.toFixed(2)),
        color: meta.color,
        txCount: stat.txCount,
        filterCategory: catName,
        children,
      };
    })
    .sort((a, b) => b.value - a.value);

  return { totalExpenses, ring1 };
}

export function getDefaultCategoryBudgets(): Array<{ category: string; monthly_limit: number }> {
  return CATEGORY_DEFINITIONS.filter((c) => c.group !== 'income').map((c) => ({
    category: c.id,
    monthly_limit: c.defaultBudget,
  }));
}
