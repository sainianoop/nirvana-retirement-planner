/**
 * retirementPicture.js
 *
 * Pure function — computes the "Your Retirement Picture" cards entirely from
 * formData stored in localStorage. No API call required.
 *
 * Returns { household: Card[], kids: Card[], opportunities: Card[] }
 * where Card = { icon, border, bg, text }
 */

const SS_MULTS = {
  62: 0.700, 63: 0.750, 64: 0.800, 65: 0.867,
  66: 0.933, 67: 1.000, 68: 1.080, 69: 1.160, 70: 1.240,
};

function n(val) {
  const v = parseFloat(val);
  return isNaN(v) ? 0 : v;
}

function fmtD(v) {
  return '$' + Math.round(v).toLocaleString();
}

export function buildRetirementPicture(fd) {
  if (!fd) return { household: [], kids: [], opportunities: [] };

  const userAge   = n(fd.userAge);
  const retireAge = n(fd.retirementAgeUser);
  const yearsOut  = Math.max(0, retireAge - userAge);
  const spending  = n(fd.retirementSpending);

  const stocks    = n(fd.balanceStocks);
  const preTax    = n(fd.balance401k) + n(fd.balanceTraditionalIRA);
  const cash      = n(fd.cashMoneyMarket);
  const hsa       = n(fd.balanceHSA);

  // Investable total — includes stocks for concentration check
  const investable = [
    'balance401k', 'balanceTraditionalIRA', 'balanceRothIRA', 'balanceHSA',
    'balanceStocks', 'balanceBrokerage', 'cashMoneyMarket', 'crypto', 'balance529',
  ].reduce((sum, k) => sum + n(fd[k]), 0);

  const household     = [];
  const kids          = [];
  const opportunities = [];

  // ── HOUSEHOLD CARDS ─────────────────────────────────────────────────────────

  // 1. Concentrated stock position
  const isConcentrated = fd.hasConcentratedStock === true
    || (investable > 0 && stocks > 0 && stocks / investable > 0.30);
  if (isConcentrated && stocks > 0) {
    const stockPct = investable > 0 ? Math.round(stocks / investable * 100) : n(fd.concentration_pct) || 0;
    const estTax   = Math.round(stocks * 0.238);
    const taxYears = spending > 0 ? (estTax / spending).toFixed(1) : null;
    household.push({
      icon: '⚠️', border: 'border-red-500', bg: 'bg-red-950/30',
      text:
        `Your ${fmtD(stocks)} stock position represents ${stockPct}% of your investable assets. ` +
        `Selling all at once could trigger an estimated federal tax bill of ${fmtD(estTax)} at 23.8% LTCG` +
        (taxYears ? ` — equivalent to ${taxYears} years of retirement expenses` : '') +
        `. A structured exit plan over 5–7 years could save you significantly.`,
    });
  }

  // 2. Healthcare bridge (retiring before Medicare at 65)
  if (retireAge > 0 && retireAge < 65) {
    const gapYears = 65 - retireAge;
    const estCost  = gapYears * 12 * 1_200; // ~$1,200/mo marketplace estimate
    household.push({
      icon: '⚠️', border: 'border-red-500', bg: 'bg-red-950/30',
      text:
        `You plan to retire at ${retireAge}, creating a ${gapYears}-year gap before Medicare eligibility at 65. ` +
        `At current marketplace rates, healthcare coverage could cost approximately ${fmtD(estCost)} out of pocket ` +
        `before you qualify — plan this into your retirement budget.`,
    });
  }

  // 3. Roth conversion window (💡 opportunity within household section per spec)
  if (preTax > 300_000 && yearsOut > 3) {
    const annualConv = Math.round(preTax / Math.max(yearsOut, 1) / 1_000) * 1_000;
    household.push({
      icon: '💡', border: 'border-green-500', bg: 'bg-green-950/30',
      text:
        `Your ${fmtD(preTax)} in pre-tax retirement accounts will face Required Minimum Distributions ` +
        `starting at 73, potentially pushing you into a higher tax bracket. ` +
        `Converting approximately ${fmtD(annualConv)}/year to Roth between now and retirement ` +
        `could meaningfully reduce that future tax burden.`,
    });
  }

  // 4. Sequence-of-returns liquidity risk
  if (spending > 0 && cash < spending && retireAge > 0) {
    household.push({
      icon: '⚠️', border: 'border-red-500', bg: 'bg-red-950/30',
      text:
        `With ${fmtD(cash)} in liquid reserves against ${fmtD(spending)}/year in planned retirement spending, ` +
        `a market downturn in your first year of retirement could force you to sell equities at a loss — ` +
        `permanently reducing your long-term portfolio by 15–20%.`,
    });
  }

  // ── KIDS CARDS ──────────────────────────────────────────────────────────────

  const children    = Array.isArray(fd.children) ? fd.children : [];
  const total529    = n(fd.balance529);
  const per529      = children.length > 0 && total529 > 0 ? total529 / children.length : 0;
  const currentYear = new Date().getFullYear();

  children.forEach(child => {
    const childAge = n(child.age);
    if (childAge <= 0 || childAge >= 15) return; // only show for children under 15
    const yearsToCollege = Math.max(0, 18 - childAge);
    const collegeYear    = currentYear + yearsToCollege;
    const projAt18       = per529 > 0 ? per529 * Math.pow(1.07, yearsToCollege) : 0;
    const projCost4yr    = 150_000 * Math.pow(1.04, yearsToCollege); // $150K today at 4%/yr
    const projAnnCost    = projCost4yr / 4;
    const coverageYrs    = projAt18 > 0 ? (projAt18 / projAnnCost).toFixed(1) : '0';
    const onTrack        = parseFloat(coverageYrs) >= 3.5;
    kids.push({
      icon: '👨‍👩‍👧', border: 'border-blue-500', bg: 'bg-blue-950/30',
      text:
        `4 years of in-state college currently costs ~$140,000–$160,000 total. ` +
        `By ${collegeYear} when your child enrolls, that could reach ${fmtD(Math.round(projCost4yr / 1_000) * 1_000)} ` +
        `at 4%/year inflation. Your current 529 trajectory covers approximately ${coverageYrs} years of those costs — ` +
        `${onTrack ? 'on track' : 'may need attention'}.`,
    });
  });

  // ── OPPORTUNITIES CARDS ──────────────────────────────────────────────────────

  // HSA — triple-tax-advantaged, often overlooked
  if (hsa === 0 && userAge > 0 && userAge < 65) {
    const yearsToMedicare = 65 - userAge;
    const annualHSA       = 4_300; // 2024 individual HSA limit
    const projHSA         = Math.round(annualHSA * ((Math.pow(1.07, yearsToMedicare) - 1) / 0.07));
    opportunities.push({
      icon: '💡', border: 'border-green-500', bg: 'bg-green-950/30',
      text:
        `You have no HSA balance. An HSA is the only triple-tax-advantaged account available — ` +
        `contributions pre-tax, growth tax-free, withdrawals tax-free for medical expenses. ` +
        `At age ${userAge}, ${yearsToMedicare} years of invested HSA contributions could grow to ` +
        `approximately ${fmtD(projHSA)} tax-free for healthcare after 65.`,
    });
  }

  // SS early-claim opportunity cost
  const ssClaimAge = n(fd.ssClaimingAge) || 67;
  const ssAnnual   = n(fd.ssAnnualTotal);
  if (ssClaimAge < 67 && ssAnnual > 0) {
    const claimMult     = SS_MULTS[ssClaimAge] ?? 0.933;
    const fraMonthly    = ssAnnual / 12 / claimMult;         // back-calculate FRA benefit
    const at70Monthly   = fraMonthly * SS_MULTS[70];
    const currentMonthly = ssAnnual / 12;
    const monthlyDiff   = Math.round(at70Monthly - currentMonthly);
    const lifetimeExtra = monthlyDiff * 12 * (90 - 70);      // vs living to 90
    const reductionPct  = Math.round((1 - claimMult) * 100);
    opportunities.push({
      icon: '💡', border: 'border-green-500', bg: 'bg-green-950/30',
      text:
        `Claiming Social Security at ${ssClaimAge} instead of 70 reduces your monthly benefit by ` +
        `approximately ${reductionPct}% compared to full retirement age. ` +
        `Delaying to 70 maximizes your benefit — worth an estimated ${fmtD(lifetimeExtra)} ` +
        `in additional lifetime income if you live to 90.`,
    });
  }

  return { household, kids, opportunities };
}
