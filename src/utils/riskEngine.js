const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

function num(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

// Inline projection at 7% — avoids import cycle with projections.js
function projectModerate(balance, years) {
  if (years <= 0 || balance <= 0) return balance;
  return balance * Math.pow(1.07, years);
}

// Liquid + investable accounts (excludes real estate, business equity)
export function getTotalInvestableAssets(formData) {
  return (
    num(formData.balance401k) +
    num(formData.balanceTraditionalIRA) +
    num(formData.balanceRothIRA) +
    num(formData.balanceBrokerage) +
    num(formData.balanceHSA) +
    num(formData.balance529) +
    num(formData.cashMoneyMarket) +
    num(formData.crypto)
  );
}

// Investable + illiquid equity
export function getTotalNetWorth(formData) {
  return (
    getTotalInvestableAssets(formData) +
    num(formData.equityPrimaryHome) +
    num(formData.equityRental) +
    num(formData.equityBusiness)
  );
}

export function analyzeRisks(formData) {
  const investable    = getTotalInvestableAssets(formData);
  const netWorth      = getTotalNetWorth(formData);
  const userAge       = num(formData.userAge);
  const retireAge     = num(formData.retirementAgeUser);
  const yearsOut      = retireAge - userAge;
  const children      = Array.isArray(formData.children) ? formData.children : [];

  // ── 1. Concentrated stock position ────────────────────────────────────────
  const concentrationRisk = {
    id: 'concentration-risk',
    title: 'Concentrated Stock Position',
    severity: 'high',
    triggered: formData.hasConcentratedStock === true,
  };

  // ── 2. Healthcare bridge to Medicare ──────────────────────────────────────
  const healthcareBridge = {
    id: 'healthcare-bridge',
    title: 'Healthcare Coverage Gap Before Medicare',
    severity: 'high',
    triggered:
      formData.retiringBeforeAge65 === true &&
      formData.healthcareRetirement !== 'spouse_employer',
  };

  // ── 3. Sequence-of-returns (thin cash buffer) ──────────────────────────────
  const cash        = num(formData.cashMoneyMarket);
  const liquidRatio = investable > 0 ? cash / investable : 0;
  const sequenceOfReturns = {
    id: 'sequence-of-returns',
    title: 'Sequence-of-Returns Risk — Thin Cash Buffer',
    severity: liquidRatio < 0.05 ? 'high' : 'medium',
    triggered: liquidRatio < 0.10,
  };

  // ── 4. Roth conversion opportunity window ─────────────────────────────────
  const preTaxBalance =
    num(formData.balanceTraditionalIRA) + num(formData.balance401k);
  const rothWindow = {
    id: 'roth-conversion-window',
    title: 'Roth Conversion Opportunity Window',
    severity: 'medium',
    triggered: userAge < 65 && preTaxBalance > 500_000,
  };

  // ── 5. College–retirement timeline overlap ────────────────────────────────
  // Triggered when a child's college start year (age 18) falls within 7 years of
  // the user's planned retirement year. Severity is HIGH when within 3 years.
  const overlapChildren = children.filter(c => {
    const age = num(c.age);
    if (age <= 0) return false;
    const yearsToCollege = Math.max(0, 18 - age);
    return Math.abs(yearsToCollege - yearsOut) <= 7;
  });
  const highOverlapChildren = overlapChildren.filter(c => {
    const age = num(c.age);
    const yearsToCollege = Math.max(0, 18 - age);
    return Math.abs(yearsToCollege - yearsOut) <= 3;
  });
  const collegeOverlap = {
    id: 'college-retirement-overlap',
    title: 'College Funding and Retirement Timeline Overlap',
    severity: highOverlapChildren.length > 0 ? 'high' : 'medium',
    triggered: overlapChildren.length > 0 && yearsOut > 0,
    detail: { affectedAges: overlapChildren.map(c => num(c.age)) },
  };

  // ── 6. Real estate concentration ──────────────────────────────────────────
  const realEstateEquity =
    num(formData.equityPrimaryHome) + num(formData.equityRental);
  const realEstateRatio = netWorth > 0 ? realEstateEquity / netWorth : 0;
  const realEstateConcentration = {
    id: 'real-estate-concentration',
    title: 'Real Estate Concentration',
    severity: 'medium',
    triggered: realEstateRatio > 0.35,
  };

  // ── 7. Tax-efficient withdrawal sequencing ────────────────────────────────
  const hasPreTax     = preTaxBalance > 0;
  const hasBrokerage  = num(formData.balanceBrokerage) > 0;
  const withdrawalSequencing = {
    id: 'withdrawal-sequencing',
    title: 'Tax-Efficient Withdrawal Sequencing',
    severity: 'low',
    triggered: hasPreTax && hasBrokerage,
  };

  // ── 8. "One more year" trap ───────────────────────────────────────────────
  const annualSpend  = num(formData.retirementSpending);
  const fireNumber   = annualSpend * 25;
  const oneMoreYear = {
    id: 'one-more-year',
    title: '"One More Year" Trap — May Already Be Financially Ready',
    severity: 'medium',
    triggered: yearsOut > 3 && annualSpend > 0 && investable >= fireNumber,
  };

  // ── 9. Pre-retirement action checklist ────────────────────────────────────
  const preRetirementChecklist = {
    id: 'pre-retirement-checklist',
    title: 'Pre-Retirement Action Checklist',
    severity: 'high',
    triggered: formData.retiringWithin18Months === true,
  };

  // ── 10. Upcoming liquidity event ──────────────────────────────────────────
  const liquidityEvent = {
    id: 'liquidity-event',
    title: 'Upcoming Liquidity Event — Tax & Allocation Planning Needed',
    severity: 'high',
    triggered: formData.liquidityEventExpected === true,
  };

  // ── 11. 529 Plan Underfunded ──────────────────────────────────────────────
  // Triggers when any child under 15 has a projected 529 balance at age 18
  // that covers less than 2 years of college costs ($35K/yr).
  const total529 = num(formData.balance529);
  const youngChildren = children.filter(c => num(c.age) > 0 && num(c.age) < 15);
  const underfundedChildren = youngChildren.filter(c => {
    const age = num(c.age);
    const yearsToCollege = Math.max(0, 18 - age);
    const perChildBalance = children.length > 0 && total529 > 0
      ? total529 / children.length
      : 0;
    const projBalance = projectModerate(perChildBalance, yearsToCollege);
    return projBalance / 35_000 < 2;
  });
  const underfunded529 = {
    id: '529-underfunded',
    title: '529 Plan Appears Underfunded',
    severity: 'medium',
    triggered: underfundedChildren.length > 0,
  };

  const risks = [
    concentrationRisk,
    healthcareBridge,
    sequenceOfReturns,
    rothWindow,
    collegeOverlap,
    realEstateConcentration,
    withdrawalSequencing,
    oneMoreYear,
    preRetirementChecklist,
    liquidityEvent,
    underfunded529,
  ];

  // Sort: high → medium → low; untriggered items last within each tier
  return risks.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (b.triggered ? 1 : 0) - (a.triggered ? 1 : 0);
  });
}

/*
─────────────────────────────────────────────────────────────────────────────
CONSOLE TEST — uncomment and run with: node src/utils/riskEngine.js

import { analyzeRisks, getTotalInvestableAssets, getTotalNetWorth } from './riskEngine.js';

const sample = {
  userAge: '58',
  retirementAgeUser: '63',          // 5 years out — triggers one-more-year check
  retiringBeforeAge65: true,
  retiringWithin18Months: false,
  hasConcentratedStock: true,       // → concentration-risk HIGH
  liquidityEventExpected: true,     // → liquidity-event HIGH
  healthcareRetirement: 'aca',      // retires before 65, not spouse plan → healthcare-bridge HIGH
  children: [
    { age: '15', has529: false },   // ≥14, within 7yr of retire → college-overlap MEDIUM
  ],
  balance401k: '800000',            // preTax > 500k, age < 65 → roth-window MEDIUM
  balanceTraditionalIRA: '200000',
  balanceRothIRA: '50000',
  balanceBrokerage: '120000',       // brokerage + preTax → withdrawal-sequencing LOW
  balanceHSA: '30000',
  balance529: '0',
  cashMoneyMarket: '40000',         // 40k / 1.24M investable ≈ 3.2% → sequence-of-returns HIGH
  crypto: '0',
  equityPrimaryHome: '400000',
  equityRental: '0',
  equityBusiness: '0',
  retirementSpending: '90000',      // 90k × 25 = 2.25M; investable = 1.24M → one-more-year NOT triggered
};

console.log('Investable assets:', getTotalInvestableAssets(sample).toLocaleString());
console.log('Net worth:        ', getTotalNetWorth(sample).toLocaleString());
console.log('\nRisks (sorted by severity):');
analyzeRisks(sample).forEach(r =>
  console.log(`  [${r.triggered ? '✓' : ' '}] ${r.severity.padEnd(6)} ${r.id}`)
);

Expected output:
  Investable assets: 1,240,000
  Net worth:         1,640,000

  Risks (sorted by severity):
  [✓] high   concentration-risk
  [✓] high   healthcare-bridge
  [✓] high   sequence-of-returns       (3.2% liquid ratio → HIGH)
  [✓] high   liquidity-event
  [ ] high   pre-retirement-checklist  (not within 18 months)
  [✓] medium roth-conversion-window
  [✓] high   college-retirement-overlap   (child 15: |3-5| = 2 ≤ 3yr window → HIGH)
  [ ] medium real-estate-concentration (400k / 1.64M = 24% — under 35%)
  [ ] medium one-more-year             (1.24M < 2.25M fire number)
  [✓] low    withdrawal-sequencing
─────────────────────────────────────────────────────────────────────────────
*/
