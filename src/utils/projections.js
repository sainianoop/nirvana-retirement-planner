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
