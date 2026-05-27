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

  const contexts = {
    'concentration-risk': {
      totalInvestableAssets: fmt(investable),
      note: 'User self-reported a concentrated position: 30%+ of portfolio in 1–3 stocks with large unrealized gains.',
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
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY is not configured');

  const dataContext = buildDataContext(risk.id, formData);

  const prompt = `You are writing personalized copy for a retirement planning tool. A financial planner's client is reviewing their retirement readiness.

Risk being flagged: "${risk.title}"

Relevant data for this person:
${JSON.stringify(dataContext, null, 2)}

Write exactly 2–3 sentences explaining why this specific risk applies to this specific person. Use their actual numbers where available. Write in plain English for someone who is not a financial professional — be clear, direct, and specific. Do not be vague or generic.

Do NOT give specific investment advice. Do NOT recommend specific products, funds, or tell them what to do. You may reference general strategy categories (like "Roth conversion" or "ACA coverage") as things to explore with an advisor, but frame them as options — not recommendations.

Output only the explanation. No headers, no bullets, no preamble, no sign-off.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
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
  balanceBrokerage:      'Taxable Brokerage',
  balanceHSA:            'HSA',
  balance529:            '529 Plan',
  cashMoneyMarket:       'Cash / Money Market',
  crypto:                'Crypto',
  equityPrimaryHome:     'Primary Home Equity',
  equityRental:          'Rental Property Equity',
  equityBusiness:        'Business Equity',
  pension:               'Pension (Annual)',
};

export async function generateActionPlan(formData, risks) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY is not configured');

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

Generate a concrete, personalized retirement action plan in three time buckets: Next 30 Days, Next 90 Days, This Year. Each bucket should have 3-5 specific action items. Each action item should be one sentence, specific and named (e.g. 'Increase 401k contribution to IRS maximum of $23,000' not 'Save more for retirement'). Reference the user's actual numbers where relevant. Do not give investment advice — recommend actions and advisor conversations.

Return JSON only in this format:
{
  "thirty_days": ["action 1", "action 2", ...],
  "ninety_days": ["action 1", "action 2", ...],
  "this_year": ["action 1", "action 2", ...]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
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

  return {
    thirty_days: parsed.thirty_days,
    ninety_days: parsed.ninety_days,
    this_year:   parsed.this_year,
  };
}
