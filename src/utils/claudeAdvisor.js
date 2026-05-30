import { getTotalInvestableAssets, getTotalNetWorth } from './riskEngine';

const MODEL = 'claude-sonnet-4-20250514';

function num(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function fmt(n) {
  return '$' + Math.round(n).toLocaleString();
}

function pct(ratio) {
  return (ratio * 100).toFixed(1) + '%';
}

// Only the fields that actually drive each specific risk
function buildDataContext(riskId, formData) {
  const investable = getTotalInvestableAssets(formData);
  const netWorth   = getTotalNetWorth(formData);
  const cash       = num(formData.cashMoneyMarket);
  const preTax     = num(formData.balance401k) + num(formData.balanceTraditionalIRA);
  const userAge    = num(formData.userAge);
  const retireAge  = num(formData.retirementAgeUser);
  const yearsOut   = retireAge - userAge;
  const reEquity   = num(formData.equityPrimaryHome) + num(formData.equityRental);

  const concentrationPct  = num(formData.concentration_pct) || 40;
  const concentrationCost = num(formData.concentration_cost_basis);
  const concentrationCurr = num(formData.concentration_current_value);
  const concentrationGain = (concentrationCurr > 0 && concentrationCost > 0) ? concentrationCurr - concentrationCost : null;
  const concentrationTax  = concentrationGain !== null ? Math.round(concentrationGain * 0.238) : null;

  const contexts = {
    'concentration-risk': {
      totalInvestableAssets: fmt(investable),
      concentrationPct:    concentrationPct + '%',
      ...(formData.concentration_stock_name ? { stockName: formData.concentration_stock_name } : {}),
      ...(concentrationCost > 0 ? { costBasis: fmt(concentrationCost) } : {}),
      ...(concentrationCurr > 0 ? { currentValue: fmt(concentrationCurr) } : {}),
      ...(concentrationGain !== null ? { unrealizedGain: fmt(concentrationGain) } : {}),
      ...(concentrationTax  !== null ? { estimatedTaxIfSold: fmt(concentrationTax) + ' (at 23.8% LTCG rate)' } : {}),
      note: 'User self-reported a concentrated position.',
    },

    'healthcare-bridge': {
      userAge,
      plannedRetirementAge: retireAge,
      yearsUntilRetirement: yearsOut,
      yearsUntilMedicare: Math.max(0, 65 - userAge),
      currentHealthcareCoverage: formData.healthcareToday,
      plannedRetirementCoverage: formData.healthcareRetirement,
    },

    'sequence-of-returns': {
      cashAndMoneyMarket: fmt(cash),
      totalInvestableAssets: fmt(investable),
      liquidBufferRatio: pct(investable > 0 ? cash / investable : 0),
      annualRetirementSpending: fmt(num(formData.retirementSpending)),
    },

    'roth-conversion-window': {
      userAge,
      yearsUntilRetirement: yearsOut,
      balance401k: fmt(num(formData.balance401k)),
      traditionalIRABalance: fmt(num(formData.balanceTraditionalIRA)),
      totalPreTaxBalance: fmt(preTax),
      rothBalance: fmt(num(formData.balanceRothIRA)),
    },

    'college-retirement-overlap': {
      userAge,
      plannedRetirementAge: retireAge,
      yearsUntilRetirement: yearsOut,
      childrenNearCollege: (formData.children || [])
        .filter(c => num(c.age) >= 14)
        .map(c => ({ age: num(c.age), has529: c.has529 })),
    },

    'real-estate-concentration': {
      primaryHomeEquity: fmt(num(formData.equityPrimaryHome)),
      rentalPropertyEquity: fmt(num(formData.equityRental)),
      combinedRealEstateEquity: fmt(reEquity),
      totalNetWorth: fmt(netWorth),
      realEstateShareOfNetWorth: pct(netWorth > 0 ? reEquity / netWorth : 0),
    },

    'withdrawal-sequencing': {
      preTaxBalance: fmt(preTax),
      taxableBrokerageBalance: fmt(num(formData.balanceBrokerage)),
      rothBalance: fmt(num(formData.balanceRothIRA)),
      totalInvestableAssets: fmt(investable),
    },

    'one-more-year': {
      userAge,
      plannedRetirementAge: retireAge,
      yearsUntilRetirement: yearsOut,
      totalInvestableAssets: fmt(investable),
      annualRetirementSpending: fmt(num(formData.retirementSpending)),
      fireNumber: fmt(num(formData.retirementSpending) * 25),
    },

    'pre-retirement-checklist': {
      userAge,
      plannedRetirementAge: retireAge,
      yearsUntilRetirement: yearsOut,
      note: 'User flagged they plan to retire within the next 18 months.',
    },

    'liquidity-event': {
      note: 'User flagged an expected large liquidity event within 3 years (business sale, large RSU vest, or inheritance).',
      totalInvestableAssets: fmt(investable),
      totalNetWorth: fmt(netWorth),
    },
  };

  return contexts[riskId] ?? {};
}

export async function generateRiskNarrative(risk, formData) {
  const dataContext = buildDataContext(risk.id, formData);

  const prompt = `You are writing personalized copy for a retirement planning tool. A financial planner's client is reviewing their retirement readiness.

Risk being flagged: "${risk.title}"

Relevant data for this person:
${JSON.stringify(dataContext, null, 2)}

Write exactly 2–3 sentences explaining why this specific risk applies to this specific person. Use their actual numbers where available. Write in plain English for someone who is not a financial professional — be clear, direct, and specific. Do not be vague or generic.

Do NOT give specific investment advice. Do NOT recommend specific products, funds, or tell them what to do. You may reference general strategy categories (like "Roth conversion" or "ACA coverage") as things to explore with an advisor, but frame them as options — not recommendations.

Output only the explanation. No headers, no bullets, no preamble, no sign-off.`;

  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.status);
    throw new Error(`Anthropic API ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.content[0].text.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// generateActionPlan — called once by ActionPlan.jsx; result cached in
// localStorage under "nirvana_action_plan".
// ─────────────────────────────────────────────────────────────────────────────

const ASSET_LABELS = {
  balance401k:           '401(k)',
  balanceTraditionalIRA: 'Traditional IRA',
  balanceRothIRA:        'Roth IRA',
  balanceStocks:         'Stocks / Individual Equities',
  balanceBrokerage:      'Taxable Brokerage',
  balanceHSA:            'HSA',
  balance529:            '529 Plan',
  cashMoneyMarket:       'Cash / Money Market',
  crypto:                'Crypto',
  equityPrimaryHome:     'Primary Home Equity',
  equityRental:          'Rental Property Equity',
  equityBusiness:        'Business Equity',
  pensionMonthlyIncome:  'Pension / Annuity (Monthly)',
};

export async function generateActionPlan(formData, risks) {

  const userAge    = num(formData.userAge);
  const partnerAge = num(formData.partnerAge);
  const retireAge  = num(formData.retirementAgeUser);
  const yearsOut   = Math.max(0, retireAge - userAge);

  const assetLines = Object.entries(ASSET_LABELS)
    .filter(([key]) => num(formData[key]) > 0)
    .map(([key, label]) => `  - ${label}: ${fmt(num(formData[key]))}`)
    .join('\n') || '  - No assets entered';

  const triggeredRisks = risks
    .filter(r => r.triggered)
    .map(r => `  - ${r.title}`)
    .join('\n') || '  - None';

  const additionalContext = (formData.additionalContext || '').trim();

  // Build Social Security context for the prompt
  const SS_MULTS = {
    '62': 0.700, '63': 0.750, '64': 0.800, '65': 0.867,
    '66': 0.933, '67': 1.000, '68': 1.080, '69': 1.160, '70': 1.240,
  };
  const ssConfigured     = formData.ssConfigured === true;
  const ssAnnual         = num(formData.ssAnnualTotal);
  const ssMonthlyBrief   = Math.round(ssAnnual / 12);
  const ssClaimAge       = String(formData.ssClaimingAge || '67');
  const partnerSsAnnual  = num(formData.partnerSsAnnualTotal);
  const partnerClaimAge  = String(formData.partnerSsClaimingAge || '67');
  const pensionAnnual    = num(formData.pensionMonthlyIncome) * 12;
  const totalGuaranteed  = ssAnnual + partnerSsAnnual + pensionAnnual;
  const spending         = num(formData.retirementSpending);
  const guaranteedCovPct = spending > 0 ? Math.round((totalGuaranteed / spending) * 100) : 0;

  let ssContext = '';
  if (ssConfigured && ssAnnual > 0) {
    const claimMult = SS_MULTS[ssClaimAge] ?? 1.0;
    const claimNote =
      Number(ssClaimAge) < 67
        ? `They are claiming early at ${ssClaimAge}, reducing lifetime benefits by ${Math.round((1 - claimMult) * 100)}%.`
        : Number(ssClaimAge) > 67
        ? `They are delaying to ${ssClaimAge} to maximize benefits (+${Math.round((claimMult - 1) * 100)}%).`
        : `Claiming at full retirement age (67).`;
    ssContext = `\nSocial Security: user expects $${ssMonthlyBrief.toLocaleString()}/month claiming at age ${ssClaimAge}. ${claimNote}`;
    if (partnerSsAnnual > 0) {
      ssContext += `\nPartner SS: $${Math.round(partnerSsAnnual / 12).toLocaleString()}/month claiming at age ${partnerClaimAge}.`;
    }
    if (pensionAnnual > 0) {
      ssContext += `\nPension income: $${Math.round(pensionAnnual / 12).toLocaleString()}/month from retirement.`;
    }
    ssContext += `\nTotal guaranteed income covers ${guaranteedCovPct}% of retirement spending. Factor SS timing strategy into the action plan recommendations.`;
  }

  // Build children context for the prompt
  const children = Array.isArray(formData.children) ? formData.children : [];
  const COLLEGE_COST = 35_000;
  const total529 = num(formData.balance529);
  const per529 = children.length > 0 && total529 > 0 ? total529 / children.length : 0;

  const childrenContext = children.length > 0 && children.some(c => num(c.age) > 0)
    ? (() => {
        const lines = children.map((c, i) => {
          const age = num(c.age);
          const yearsToCollege = Math.max(0, 18 - age);
          const projAt18 = per529 > 0 ? per529 * Math.pow(1.07, yearsToCollege) : 0;
          const coverageYrs = projAt18 > 0 ? (projAt18 / COLLEGE_COST).toFixed(1) : '0';
          return `  - Child ${i + 1}: age ${age > 0 ? age : '?'}, ${c.has529 ? '529 funded' : 'no 529 on record'}, college in ${yearsToCollege} year${yearsToCollege !== 1 ? 's' : ''}, 529 projected to cover ~${coverageYrs} yrs of costs ($35K/yr)`;
        });
        return `\nHousehold has ${children.length} child${children.length !== 1 ? 'ren' : ''} (ages: ${children.map(c => num(c.age) || '?').join(', ')}):\n${lines.join('\n')}\nFactor college timelines and 529 adequacy into the action plan — reference specific children and timelines where relevant.`;
      })()
    : '';

  const hasChildren = Array.isArray(formData.children) && formData.children.some(c => num(c.age) > 0);

  const prompt = `You are a retirement planning assistant helping a financial planner's client build a personalized action plan.

Client profile:
- Age: ${userAge}${partnerAge ? `\n- Partner age: ${partnerAge}` : ''}
- Target retirement age: ${retireAge}
- Years to retirement: ${yearsOut}

Assets (non-zero):
${assetLines}

Triggered risk flags:
${triggeredRisks}
${additionalContext ? `\nAdditional context from client: "${additionalContext}"` : ''}
${ssContext}
${childrenContext}

PART 1 — Situation Summary:
Before the action plan, generate a "situation_summary" — a set of human-centric narrative statements explaining what is specifically at stake for this household, using their actual numbers.

Write 2–4 statements per category. Each statement is no longer than 2 sentences. Use second-person, conversational English. Explain the CONSEQUENCE of inaction, not just the risk name. Use specific dollar amounts and ages wherever possible.

Categories:
- "household": key financial risks or realities for this household (e.g. tax exposure from concentrated stock, healthcare gap, RMD timing, sequence-of-returns risk)
- "opportunities": things they may be missing — HSA, Roth conversion window, SS delay value, tax-loss harvesting, etc.
- "kids": college funding realities with specific timelines and projected costs (ONLY include this category if they have children)

Example household statement: "Your $1.2M stock position has likely grown significantly — but selling it all today could trigger a tax bill equivalent to 3–4 years of retirement expenses. A structured exit strategy over 5–7 years could save you $200K+ in taxes."
Example opportunity statement: "Social Security at 70 vs 62 is a difference of 77% more per month for life. Given your portfolio size, delaying to 70 could be worth $300,000+ in lifetime income if you live past 80."
Example kids statement: "4 years of in-state college currently costs ~$140,000 — and will be higher by the time your child enrolls. Your current 529 trajectory covers less than 1 year of that cost."

PART 2 — Action Plan:
Generate a concrete, personalized retirement action plan in three time buckets: Next 30 Days, Next 90 Days, This Year. Each bucket should have 3–5 specific action items. Each action item should be one sentence, specific and named (e.g. 'Increase 401k contribution to IRS maximum of $23,000' not 'Save more for retirement'). Reference actual numbers where relevant. Do not give investment advice — recommend actions and advisor conversations.

Return JSON only in this exact format (no markdown, no extra text):
{
  "situation_summary": {
    "household": ["statement 1", "statement 2"],
    "opportunities": ["statement 1"],
    "kids": ["statement 1"]
  },
  "thirty_days": ["action 1", "action 2", ...],
  "ninety_days": ["action 1", "action 2", ...],
  "this_year": ["action 1", "action 2", ...]
}

${!hasChildren ? 'Note: Do NOT include a "kids" key in situation_summary — this client has no children.' : ''}`;

  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => String(response.status));
    throw new Error(`Anthropic API ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.content[0].text.trim();

  // Extract JSON — handle optional markdown code fences
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');

  const parsed = JSON.parse(jsonMatch[0]);

  if (
    !Array.isArray(parsed.thirty_days) ||
    !Array.isArray(parsed.ninety_days) ||
    !Array.isArray(parsed.this_year)
  ) {
    throw new Error('Invalid response structure from Claude');
  }

  // situation_summary is optional — gracefully absent in error/fallback cases
  const ss = parsed.situation_summary;
  const situationSummary = ss && typeof ss === 'object' ? {
    household:     Array.isArray(ss.household)     ? ss.household     : [],
    opportunities: Array.isArray(ss.opportunities) ? ss.opportunities : [],
    kids:          Array.isArray(ss.kids)           ? ss.kids          : [],
  } : null;

  return {
    thirty_days:       parsed.thirty_days,
    ninety_days:       parsed.ninety_days,
    this_year:         parsed.this_year,
    situation_summary: situationSummary,
  };
}
