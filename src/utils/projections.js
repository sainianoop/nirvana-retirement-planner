/**
 * Project a current balance forward by `years` at three growth rates.
 * Returns an object with conservative / moderate / aggressive future values.
 */
export function projectAsset(currentBalance, years) {
  if (years <= 0 || currentBalance <= 0) {
    return {
      conservative: currentBalance,
      moderate: currentBalance,
      aggressive: currentBalance,
    };
  }
  return {
    conservative: currentBalance * Math.pow(1.05, years),
    moderate:     currentBalance * Math.pow(1.07, years),
    aggressive:   currentBalance * Math.pow(1.10, years),
  };
}

// ─── Private helper (module-local) ───────────────────────────────────────────
function n(val) {
  const v = parseFloat(val);
  return isNaN(v) ? 0 : v;
}

/**
 * Simplified Monte Carlo approximation for retirement portfolio success.
 * Returns an integer percentage clamped to [35, 95].
 *
 * @param {object} formData   — raw intake form object
 * @param {{ today: number, moderate: number }} projections — pre-computed totals
 */
export function calculateSuccessProbability(formData, projections) {
  const totalPortfolio    = projections.today;
  const spending          = n(formData.retirementSpending);
  const userAge           = n(formData.userAge);
  const retireAge         = n(formData.retirementAgeUser);
  const yearsToRetirement = Math.max(0, retireAge - userAge);

  const rothBalance     = n(formData.balanceRothIRA);
  const hsaBalance      = n(formData.balanceHSA);
  const cashBalance     = n(formData.cashMoneyMarket);
  const cryptoBalance   = n(formData.crypto);
  const pensionIncome   = n(formData.pensionMonthlyIncome);
  const homeEquity      = n(formData.equityPrimaryHome);
  const rentalEquity    = n(formData.equityRental);
  const realEstateValue = homeEquity + rentalEquity;

  let prob = 75;

  // ── Upward adjustments ──────────────────────────────────────────────────────
  if (spending > 0 && totalPortfolio > spending * 30)                           prob += 5; // well-funded
  if (yearsToRetirement > 10)                                                    prob += 5; // long runway
  if (totalPortfolio > 0 && (rothBalance + hsaBalance) / totalPortfolio > 0.20) prob += 5; // tax diversification
  if (spending > 0 && cashBalance > spending * 2)                                prob += 5; // liquidity buffer
  if (pensionIncome > 0)                                                         prob += 3; // guaranteed income floor

  // ── Downward adjustments ────────────────────────────────────────────────────
  if (retireAge > 0 && retireAge < 65 && formData.healthcareRetirement !== 'spouse_employer') prob -= 10; // healthcare gap
  if (spending > 0 && totalPortfolio < spending * 20)                            prob -= 8;  // underfunded
  if (formData.hasConcentratedStock)                                              prob -= 5;  // concentration risk
  if (totalPortfolio > 0 && realEstateValue / totalPortfolio > 0.40)             prob -= 5;  // illiquid concentration
  if (totalPortfolio > 0 && cryptoBalance / totalPortfolio > 0.10)               prob -= 5;  // volatility drag
  if (yearsToRetirement > 0 && yearsToRetirement < 5)                            prob -= 3;  // limited runway

  // College–retirement overlap: children 14+ with retirement within 10 years
  const hasCollegeOverlap =
    yearsToRetirement < 10 &&
    (formData.children || []).some(c => n(c.age) >= 14);
  if (hasCollegeOverlap) prob -= 3;

  return Math.min(95, Math.max(35, Math.round(prob)));
}

/**
 * Estimate the calendar year a retirement portfolio is depleted.
 * Simulates annual withdrawals with a 4% post-retirement return,
 * adding a Social Security income estimate from age 67 onward.
 *
 * Returns { moderate, belowAverage } where each value is either a year
 * (number) or null if the portfolio survives the 40-year window.
 *
 * @param {object} formData
 * @param {{ today: number, moderate: number }} projections
 */
export function calculateShortfallYear(formData, projections) {
  const retireAge      = n(formData.retirementAgeUser);
  const userAge        = n(formData.userAge);
  const spending       = n(formData.retirementSpending);
  const income         = n(formData.householdIncome);

  if (spending <= 0 || projections.moderate <= 0) {
    return { moderate: null, belowAverage: null };
  }

  const currentYear    = new Date().getFullYear();
  const retirementYear = currentYear + Math.max(0, retireAge - userAge);
  const ssAnnual       = income * 0.35;   // ~35% income-replacement approximation
  const MAX_YEARS      = 40;
  const RETURN_RATE    = 0.04;            // conservative post-retirement growth rate

  function simulate(startBalance) {
    if (startBalance <= 0) return retirementYear;
    let balance = startBalance;
    for (let y = 0; y < MAX_YEARS; y++) {
      balance *= (1 + RETURN_RATE);                    // annual portfolio growth
      if (retireAge + y >= 67) balance += ssAnnual;   // Social Security from age 67
      balance -= spending;                              // annual withdrawal
      if (balance <= 0) return retirementYear + y;
    }
    return null; // funded through the entire simulation window
  }

  return {
    moderate:     simulate(projections.moderate),
    belowAverage: simulate(projections.moderate * 0.80),
  };
}

/**
 * Compute a simple hash of the form data so we can detect stale cache.
 * Stringify the whole object and xor bytes — fast, not crypto-grade.
 */
export function hashFormData(formData) {
  const str = JSON.stringify(formData);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}
