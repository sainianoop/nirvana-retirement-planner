import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { analyzeRisks } from '../utils/riskEngine';
import { projectAsset, calculateSuccessProbability } from '../utils/projections';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function num(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function fmtDollar(n) {
  if (!n && n !== 0) return '—';
  return '$' + Math.round(n).toLocaleString();
}

function fmtCompact(n) {
  if (!n && n !== 0) return '—';
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  return '$' + Math.round(n).toLocaleString();
}

function todayStr() {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ─────────────────────────────────────────────────────────────
// localStorage loaders
// ─────────────────────────────────────────────────────────────
function loadFormData() {
  try { return JSON.parse(localStorage.getItem('nirvana_intake') || 'null'); }
  catch { return null; }
}

function loadActionPlan() {
  try {
    const raw = localStorage.getItem('nirvana_action_plan');
    if (!raw) return null;
    return JSON.parse(raw).plan ?? null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────
// Asset definitions — field keys match IntakeForm localStorage exactly
// ─────────────────────────────────────────────────────────────
const INVESTABLE_DEFS = [
  { key: 'balance401k',           label: '401(k) / 403(b)',              tax: 'Tax-Deferred', action: 'Maximize contributions; confirm allocation matches your timeline.' },
  { key: 'balanceTraditionalIRA', label: 'Traditional IRA',              tax: 'Tax-Deferred', action: 'Evaluate Roth conversion opportunities before age-73 RMDs begin.' },
  { key: 'balanceRothIRA',        label: 'Roth IRA',                     tax: 'Tax-Free',     action: 'Let grow as long as possible — no RMDs required. Last account to draw from.' },
  { key: 'balanceHSA',            label: 'HSA',                          tax: 'Tax-Free',     action: 'Invest for growth — use as a stealth retirement account for healthcare costs.' },
  { key: 'balanceStocks',         label: 'Stocks / Individual Equities', tax: 'Taxable',      action: 'Review position concentration — any single stock over 5–10% of portfolio warrants a review.' },
  { key: 'balanceBrokerage',      label: 'Taxable Brokerage',            tax: 'Taxable',      action: 'Harvest tax losses annually and manage capital gains with withdrawal sequencing.' },
  { key: 'crypto',                label: 'Crypto',                       tax: 'Taxable',      action: 'Track cost basis carefully; review position sizing relative to total portfolio.' },
  { key: 'cashMoneyMarket',       label: 'Cash / Money Market',          tax: 'Taxable',      action: 'Keep 6–12 months of expenses in cash; move excess into higher-yield vehicles.' },
  { key: 'equityBusiness',        label: 'Business / Private Equity',    tax: 'Taxable',      action: 'Build a succession or exit plan — this value is illiquid until a sale is completed.' },
  { key: 'balance529',            label: '529 Plan (Education Assets)',   tax: 'Education',    action: 'Review the investment glide path and confirm beneficiary designation.' },
  // pensionMonthlyIncome omitted — shown in the Guaranteed Income section of the snapshot
];

const ILLIQUID_DEFS = [
  { key: 'equityPrimaryHome', label: 'Primary Home Equity',    tax: 'Real Estate', action: 'Not liquid — plan for downsizing or HELOC as a last resort, not a primary income source.' },
  { key: 'equityRental',      label: 'Rental Property Equity', tax: 'Real Estate', action: 'Assess whether rental income supplements or complicates your retirement cash flow.' },
];

// ─────────────────────────────────────────────────────────────
// Tax badge colours (screen only)
// ─────────────────────────────────────────────────────────────
const TAX_BADGE = {
  'Tax-Deferred': 'bg-amber-900/40 text-amber-300 border border-amber-700/60',
  'Tax-Free':     'bg-green-900/40 text-green-300 border border-green-700/60',
  'Taxable':      'bg-blue-900/40 text-blue-300 border border-blue-700/60',
  'Real Estate':  'bg-purple-900/40 text-purple-300 border border-purple-700/60',
  'Education':    'bg-teal-900/40 text-teal-300 border border-teal-700/60',
};

// ─────────────────────────────────────────────────────────────
// Risk advisor questions
// ─────────────────────────────────────────────────────────────
const RISK_CONTENT = {
  'concentration-risk': {
    why: 'You hold a significant concentrated stock position with potential large unrealized gains.',
    question: 'What is the most tax-efficient strategy to reduce my concentration given my cost basis — and over what timeline?',
  },
  'healthcare-bridge': {
    why: 'You plan to retire before Medicare eligibility at 65 and will need to bridge coverage independently.',
    question: 'Can you model my ACA premium costs under different income scenarios, and where do I lose subsidy eligibility?',
  },
  'sequence-of-returns': {
    why: 'Your liquid cash buffer is below 10% of investable assets, creating exposure if markets fall early in retirement.',
    question: 'What cash and bond buffer is right for my situation, and how do I structure withdrawals in a down-market year?',
  },
  'roth-conversion-window': {
    why: 'You have significant pre-tax balances and years before RMDs begin — a window to convert at lower tax rates.',
    question: 'How much should I convert to Roth each year between now and 73 to minimize lifetime taxes and future RMDs?',
  },
  'college-retirement-overlap': {
    why: 'Your retirement timeline overlaps with college tuition years for one or more children, creating a dual funding pressure on your portfolio.',
    // question is dynamic — built in the render loop using yearsOut
    question: null,
  },
  '529-underfunded': {
    why: 'Based on your current 529 balance, one or more children\'s plans appear projected to cover less than 2 years of college costs ($35K/yr) by age 18.',
    question: 'What contribution rate and investment mix would put each child\'s 529 on track to cover 4+ years of college costs? Are there state-specific tax deductions available to boost our contributions?',
  },
  'real-estate-concentration': {
    why: 'More than 35% of your net worth is tied up in real estate, which is illiquid and hard to rebalance.',
    question: 'What are my options for accessing real estate equity without triggering an immediate large tax event?',
  },
  'withdrawal-sequencing': {
    why: 'You have assets in pre-tax, taxable, and Roth accounts — the draw-down order significantly affects lifetime taxes.',
    question: 'In what order should I draw from taxable, traditional IRA, and Roth — and how does Social Security timing affect that?',
  },
  'one-more-year': {
    why: 'Based on your numbers, you may already be financially ready to retire before your target date.',
    question: 'Based on my current numbers, what is my probability of portfolio success if I retire today rather than at my target date?',
  },
  'pre-retirement-checklist': {
    why: 'You are within 18 months of your target retirement date — the final planning window is now.',
    question: 'What moves should I prioritize in the next 12 months before I leave my W2 income?',
  },
  'liquidity-event': {
    why: 'You expect a significant liquidity event within 3 years that will require careful tax and allocation planning.',
    question: 'What strategies should I have in place before my liquidity event to minimize the tax impact in that year?',
  },
};

// ─────────────────────────────────────────────────────────────
// Social Security helpers
// ─────────────────────────────────────────────────────────────
const SS_CLAIMING_MULTIPLIERS = {
  '62': 0.700, '63': 0.750, '64': 0.800, '65': 0.867,
  '66': 0.933, '67': 1.000, '68': 1.080, '69': 1.160, '70': 1.240,
};

function ssStrategy(claimAge) {
  const a = Number(claimAge);
  if (a < 67)  return 'early claim';
  if (a === 67) return 'full retirement age';
  return 'delayed claim';
}

// ─────────────────────────────────────────────────────────────
// Print CSS
// ─────────────────────────────────────────────────────────────
const PRINT_CSS = `
@media print {
  nav, [data-no-print] { display: none !important; }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  body, html {
    background: #fff !important;
    color: #111827 !important;
    font-size: 10pt !important;
    font-family: system-ui, Arial, sans-serif !important;
  }

  .brief-root {
    background: #fff !important;
    color: #111827 !important;
    max-width: 100% !important;
    padding: 0 !important;
  }

  /* Section wrapper */
  .brief-section {
    background: #fff !important;
    border: 0.5pt solid #d1d5db !important;
    border-radius: 4pt !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
    margin-bottom: 14pt !important;
    overflow: hidden !important;
  }

  /* Section header bar */
  .brief-section-header {
    background: #0f172a !important;
    color: #fff !important;
    padding: 7pt 12pt !important;
  }
  .brief-section-number { color: #f59e0b !important; }
  .brief-section-title  { color: #ffffff !important; }

  /* Header wordmark area */
  .brief-wordmark      { color: #f59e0b !important; font-size: 22pt !important; }
  .brief-brief-label   { color: #0f172a !important; font-size: 14pt !important; }
  .brief-header-divider { background-color: #f59e0b !important; height: 2pt !important; display: block !important; }
  .brief-header-meta   { color: #6b7280 !important; font-size: 8.5pt !important; }

  /* Metric cards */
  .metric-card {
    background: #f9fafb !important;
    border: 0.5pt solid #e5e7eb !important;
    border-radius: 4pt !important;
  }
  .metric-value       { color: #111827 !important; }
  .metric-value-amber { color: #92400e !important; }
  .metric-label       { color: #6b7280 !important; }

  /* Portfolio table */
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 3.5pt 5pt; font-size: 8.5pt; border: 0.5pt solid #e5e7eb; }
  th { background: #f0f4f8 !important; color: #111827 !important; font-weight: bold; }
  tr:nth-child(even) td { background: #fafafa !important; }
  .tax-badge { background: #f3f4f6 !important; color: #374151 !important; border-color: #d1d5db !important; }
  .subtotals-row td { background: #f0f4f8 !important; font-weight: bold !important; border-top: 1pt solid #9ca3af !important; }
  .totals-row   td { background: #fffbeb !important; font-weight: bold !important; border-top: 2pt solid #f59e0b !important; }

  /* Risk cards */
  .risk-card          { background: #fff !important; break-inside: avoid; page-break-inside: avoid; margin-bottom: 8pt; }
  .risk-card-high     { border-left-color: #ef4444 !important; }
  .risk-card-medium   { border-left-color: #f59e0b !important; }
  .risk-card-low      { border-left-color: #9ca3af !important; }
  .brief-risk-title   { color: #111827 !important; }
  .brief-ask-label    { color: #92400e !important; }

  /* Action plan */
  .action-col-header        { border-radius: 3pt !important; padding: 5pt 8pt !important; }
  .action-col-30 .action-col-header   { background: #7f1d1d !important; color: #fff !important; }
  .action-col-90 .action-col-header   { background: #78350f !important; color: #fff !important; }
  .action-col-year .action-col-header { background: #14532d !important; color: #fff !important; }

  /* Snapshot detail table */
  .snapshot-detail-table td { border: none !important; padding: 2pt 6pt; font-size: 9pt; }
  .snapshot-detail-table .snap-label { color: #6b7280 !important; }
  .snapshot-detail-table .snap-value { color: #111827 !important; font-weight: 500; }

  /* Footer */
  .brief-footer { border-top: 1.5pt solid #f59e0b !important; color: #9ca3af !important; font-size: 8pt !important; }

  a { color: #111827 !important; text-decoration: none; }
}
`;

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, amber, valueColor }) {
  const cls = valueColor
    ? valueColor
    : amber
    ? 'metric-value-amber text-[#F59E0B]'
    : 'metric-value text-white';
  return (
    <div className="metric-card bg-[#0F172A] rounded-xl p-4 border border-[#334155]">
      <p className={`text-2xl font-bold leading-none ${cls}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      <p className="metric-label text-xs text-slate-500 mt-2">{label}</p>
    </div>
  );
}

function SectionBlock({ number, title, children }) {
  return (
    <section className="brief-section bg-[#1E293B] rounded-2xl overflow-hidden border border-[#334155]">
      <div className="brief-section-header flex items-center gap-3 bg-[#0F172A] px-5 py-3.5">
        <span className="brief-section-number text-[#F59E0B] font-black text-lg leading-none w-6 shrink-0">
          {number}
        </span>
        <h2 className="brief-section-title text-white font-bold text-base tracking-wide">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SnapRow({ label, value }) {
  if (!value) return null;
  return (
    <tr className="border-b border-[#334155]/50">
      <td className="snap-label py-1.5 pr-6 text-slate-400 text-xs whitespace-nowrap">{label}</td>
      <td className="snap-value py-1.5 text-slate-200 text-xs font-medium">{value}</td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function AdvisorBrief() {
  // Inject print CSS once
  useMemo(() => {
    if (typeof document === 'undefined') return;
    const id = 'nirvana-print-css';
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id;
      el.textContent = PRINT_CSS;
      document.head.appendChild(el);
    }
  }, []);

  const formData   = useMemo(() => loadFormData(), []);
  const actionPlan = useMemo(() => loadActionPlan(), []);

  // ── Empty state ───────────────────────────────────────────
  if (!formData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-4xl mb-4">📄</div>
        <h2 className="text-2xl font-bold text-white mb-2">No profile data yet</h2>
        <p className="text-slate-400 max-w-sm mb-6">
          Complete your profile on the <strong className="text-white">Your Profile</strong> tab,
          then come back to generate your advisor brief.
        </p>
        <Link
          to="/"
          className="bg-[#F59E0B] hover:bg-[#D97706] text-[#0F172A] font-bold px-6 py-3 rounded-xl text-sm transition-colors"
        >
          Go to Your Profile →
        </Link>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────
  const userAge    = num(formData.userAge);
  const partnerAge = num(formData.partnerAge);
  const retireAge  = num(formData.retirementAgeUser);
  const yearsOut   = Math.max(0, retireAge - userAge);
  const retireYear = new Date().getFullYear() + yearsOut;
  const spending   = num(formData.retirementSpending);

  // Build investable rows (non-zero balances)
  const investableRows = INVESTABLE_DEFS
    .map(def => {
      const balance = num(formData[def.key]);
      if (balance <= 0) return null;
      const proj = def.isIncome
        ? { conservative: balance, moderate: balance, aggressive: balance }
        : projectAsset(balance, yearsOut);
      return { ...def, balance, moderate: proj.moderate };
    })
    .filter(Boolean);

  // Build illiquid rows (non-zero balances)
  const illiquidRows = ILLIQUID_DEFS
    .map(def => {
      const balance = num(formData[def.key]);
      if (balance <= 0) return null;
      const proj = projectAsset(balance, yearsOut);
      return { ...def, balance, moderate: proj.moderate };
    })
    .filter(Boolean);

  // Totals
  const investableBalance  = investableRows.reduce((s, r) => s + r.balance,  0);
  const investableModerate = investableRows.reduce((s, r) => s + r.moderate, 0);
  const illiquidBalance    = illiquidRows.reduce((s, r) => s + r.balance,    0);
  const illiquidModerate   = illiquidRows.reduce((s, r) => s + r.moderate,   0);
  const netWorthBalance    = investableBalance + illiquidBalance;
  const netWorthModerate   = investableModerate + illiquidModerate;

  const hasAssets = investableRows.length > 0 || illiquidRows.length > 0;

  // Probability of success (use same inputs as AssetOutlook)
  const successProb    = calculateSuccessProbability(formData, { today: netWorthBalance, moderate: netWorthModerate });
  const probColor      = successProb >= 80 ? 'text-green-400' : successProb >= 60 ? 'text-amber-400' : 'text-red-400';
  const probSub        = successProb >= 80 ? 'Strong outlook' : successProb >= 60 ? 'Moderate risk' : 'Needs attention';

  // Healthcare label
  const HEALTHCARE_LABELS = {
    spouse_employer: "Spouse's employer plan",
    aca:             'ACA marketplace',
    not_sure:        'Not yet decided',
  };
  const healthcareLabel = HEALTHCARE_LABELS[formData.healthcareRetirement] || formData.healthcareRetirement || null;

  // Children data
  const childrenData = Array.isArray(formData.children) ? formData.children : [];
  const numChildrenForm = Number(formData.numChildren) || 0;

  // Triggered risks
  const triggeredRisks = analyzeRisks(formData).filter(r => r.triggered);

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="brief-root max-w-4xl mx-auto space-y-6 pb-10">

      {/* ── Page Header ────────────────────────────────────── */}
      <div>
        {/* Wordmark + title row */}
        <div className="flex items-baseline justify-between mb-2">
          <span className="brief-wordmark text-[#F59E0B] text-4xl font-black tracking-widest leading-none">
            NIRVANA
          </span>
          <span className="brief-brief-label text-slate-200 text-xl font-semibold tracking-wide">
            Retirement Readiness Brief
          </span>
        </div>

        {/* Amber divider */}
        <div className="brief-header-divider h-0.5 bg-[#F59E0B] w-full mb-2" />

        {/* Metadata + print button */}
        <div className="flex items-center justify-between">
          <p className="brief-header-meta text-slate-500 text-xs">
            Prepared for Your Household · {todayStr()} · Confidential
          </p>
          <button
            data-no-print
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-[#F59E0B] hover:bg-[#D97706] text-[#0F172A] font-bold px-4 py-2 rounded-lg text-sm transition-colors shadow-lg shadow-amber-900/30"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* ── Section 1: Household Snapshot ──────────────────── */}
      <SectionBlock number="1" title="Household Snapshot">

        {/* Dashboard metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          <MetricCard label="Your Age" value={userAge || '—'} />
          <MetricCard label="Target Retirement Age" value={retireAge || '—'} />
          <MetricCard label="Years to Retirement" value={yearsOut > 0 ? yearsOut : '—'} />
          <MetricCard
            label="Total Investable Assets"
            value={investableBalance > 0 ? fmtCompact(investableBalance) : '—'}
            amber
          />
          <MetricCard
            label="Projected at Retirement (7%/yr)"
            value={investableBalance > 0 && yearsOut > 0 ? fmtCompact(investableModerate) : '—'}
            amber
          />
          <MetricCard
            label="Probability of Success"
            value={`${successProb}%`}
            sub={probSub}
            valueColor={probColor}
          />
        </div>

        {/* Detail table */}
        <table className="snapshot-detail-table w-full">
          <tbody>
            {formData.hasPartner && partnerAge > 0 && (
              <SnapRow label="Partner's age" value={`${partnerAge}`} />
            )}

            {/* Children detail — one row per child */}
            {numChildrenForm === 0 ? (
              <SnapRow label="Children" value="None" />
            ) : childrenData.length > 0 && childrenData.some(c => num(c.age) > 0) ? (
              childrenData.map((c, i) => {
                const age = num(c.age);
                const yearsToCollege = Math.max(0, 18 - age);
                const collegeYear = new Date().getFullYear() + yearsToCollege;
                return (
                  <SnapRow
                    key={i}
                    label={i === 0 ? 'Children' : ''}
                    value={`Child ${i + 1}: Age ${age > 0 ? age : '?'} · 529 funded: ${c.has529 ? 'Yes' : 'No'} · College in ${yearsToCollege} yr${yearsToCollege !== 1 ? 's' : ''} (${collegeYear})`}
                  />
                );
              })
            ) : (
              <SnapRow label="Children" value={`${numChildrenForm} (ages not entered)`} />
            )}

            <SnapRow label="Target retirement year" value={retireAge ? `${retireYear}` : null} />
            <SnapRow label="State of residence"     value={formData.state || null} />
            <SnapRow
              label="Current household income"
              value={formData.householdIncome ? fmtDollar(num(formData.householdIncome)) + '/yr' : null}
            />
            <SnapRow
              label="Target retirement spending"
              value={spending > 0 ? fmtDollar(spending) + '/yr' : null}
            />
            <SnapRow
              label="Total net worth (incl. real estate)"
              value={netWorthBalance > 0 ? fmtCompact(netWorthBalance) : null}
            />
            <SnapRow label="Healthcare post-retirement" value={healthcareLabel} />

            {/* ── Guaranteed Income ─────────────────────────── */}
            {(() => {
              const ssAnnual        = num(formData.ssAnnualTotal);
              const partnerSsAnnual = num(formData.partnerSsAnnualTotal);
              const pensionAnnual   = num(formData.pensionMonthlyIncome) * 12;
              const totalGuaranteed = ssAnnual + partnerSsAnnual + pensionAnnual;

              if (!formData.ssConfigured && pensionAnnual === 0) return null;

              return (
                <>
                  {ssAnnual > 0 && (
                    <SnapRow
                      label="Your Social Security"
                      value={`$${Math.round(ssAnnual / 12).toLocaleString()}/mo at age ${formData.ssClaimingAge || 67} — ${ssStrategy(formData.ssClaimingAge)}`}
                    />
                  )}
                  {partnerSsAnnual > 0 && formData.hasPartner && (
                    <SnapRow
                      label="Partner Social Security"
                      value={`$${Math.round(partnerSsAnnual / 12).toLocaleString()}/mo at age ${formData.partnerSsClaimingAge || 67} — ${ssStrategy(formData.partnerSsClaimingAge)}`}
                    />
                  )}
                  {pensionAnnual > 0 && (
                    <SnapRow
                      label="Pension / Annuity"
                      value={`$${Math.round(pensionAnnual / 12).toLocaleString()}/mo`}
                    />
                  )}
                  {totalGuaranteed > 0 && (
                    <SnapRow
                      label="Total guaranteed income"
                      value={`$${Math.round(totalGuaranteed).toLocaleString()}/yr ($${Math.round(totalGuaranteed / 12).toLocaleString()}/mo)`}
                    />
                  )}
                </>
              );
            })()}
          </tbody>
        </table>
      </SectionBlock>

      {/* ── Section 2: Portfolio Summary ───────────────────── */}
      <SectionBlock number="2" title="Portfolio Summary">
        {!hasAssets ? (
          <p className="text-slate-500 text-sm italic">No asset balances entered.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-[#334155]">
                  <th className="text-left pb-2 pr-3 min-w-[140px]">Asset</th>
                  <th className="text-left pb-2 pr-3 min-w-[90px]">Tax Treatment</th>
                  <th className="text-right pb-2 pr-3 min-w-[100px]">Current</th>
                  <th className="text-right pb-2 pr-3 min-w-[120px]">Projected (Moderate)</th>
                  <th className="text-left pb-2 min-w-[180px]">Action Note</th>
                </tr>
              </thead>
              <tbody>
                {/* Investable assets */}
                {investableRows.map((row, i) => (
                  <tr
                    key={row.key}
                    className={`border-b border-[#334155]/40 ${i % 2 === 0 ? 'bg-[#0F172A]/30' : ''}`}
                  >
                    <td className="py-2 pr-3 text-white font-medium whitespace-nowrap">{row.label}</td>
                    <td className="py-2 pr-3">
                      <span className={`tax-badge inline-block px-1.5 py-0.5 rounded text-xs font-medium ${TAX_BADGE[row.tax] ?? 'bg-slate-700 text-slate-300'}`}>
                        {row.tax}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-200 font-mono tabular-nums whitespace-nowrap">
                      {fmtDollar(row.balance)}
                    </td>
                    <td className="py-2 pr-3 text-right text-amber-300 font-mono tabular-nums whitespace-nowrap">
                      {yearsOut > 0 ? fmtDollar(row.moderate) : '—'}
                    </td>
                    <td className="py-2 text-slate-400 text-xs leading-snug">{row.action}</td>
                  </tr>
                ))}

                {/* Illiquid / real estate assets */}
                {illiquidRows.map((row, i) => (
                  <tr
                    key={row.key}
                    className={`border-b border-[#334155]/40 ${(investableRows.length + i) % 2 === 0 ? 'bg-[#0F172A]/30' : ''}`}
                  >
                    <td className="py-2 pr-3 text-white font-medium whitespace-nowrap">{row.label}</td>
                    <td className="py-2 pr-3">
                      <span className={`tax-badge inline-block px-1.5 py-0.5 rounded text-xs font-medium ${TAX_BADGE[row.tax] ?? 'bg-slate-700 text-slate-300'}`}>
                        {row.tax}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-200 font-mono tabular-nums whitespace-nowrap">
                      {fmtDollar(row.balance)}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-400 font-mono tabular-nums whitespace-nowrap text-xs italic">
                      Not projected
                    </td>
                    <td className="py-2 text-slate-400 text-xs leading-snug">{row.action}</td>
                  </tr>
                ))}

                {/* Investable Assets Subtotal */}
                {investableRows.length > 0 && (
                  <tr className="subtotals-row border-t border-[#334155] bg-[#0F172A]/60">
                    <td className="pt-2.5 pb-1.5 text-slate-400 text-xs font-bold" colSpan={2}>
                      Investable Assets Subtotal
                    </td>
                    <td className="pt-2.5 pb-1.5 text-right text-white font-bold font-mono tabular-nums whitespace-nowrap text-sm">
                      {fmtDollar(investableBalance)}
                    </td>
                    <td className="pt-2.5 pb-1.5 text-right text-amber-300 font-bold font-mono tabular-nums whitespace-nowrap text-sm">
                      {yearsOut > 0 ? fmtDollar(investableModerate) : '—'}
                    </td>
                    <td />
                  </tr>
                )}

                {/* Net Worth grand total */}
                <tr className="totals-row border-t-2 border-amber-500/60 font-bold">
                  <td className="pt-3 pb-2 text-white" colSpan={2}>Net Worth (incl. Real Estate)</td>
                  <td className="pt-3 pb-2 text-right text-white font-mono tabular-nums whitespace-nowrap">
                    {fmtDollar(netWorthBalance)}
                  </td>
                  <td className="pt-3 pb-2 text-right text-amber-300 font-mono tabular-nums whitespace-nowrap">
                    {yearsOut > 0 ? fmtDollar(netWorthModerate) : '—'}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </SectionBlock>

      {/* ── Section 3: Key Questions ───────────────────────── */}
      <SectionBlock number="3" title="Key Questions for Your Advisor">
        {(() => {
          // SS early-claim card — rendered before risk-engine cards
          const ssClaimAge   = num(formData.ssClaimingAge || '67');
          const showSsCard   = formData.ssConfigured && ssClaimAge < 67 && num(formData.ssAnnualTotal) > 0;
          const ssReductionPct = showSsCard
            ? Math.round((1 - (SS_CLAIMING_MULTIPLIERS[String(ssClaimAge)] ?? 1)) * 100)
            : 0;

          const hasAnything = triggeredRisks.length > 0 || showSsCard;

          if (!hasAnything) return (
            <p className="text-slate-500 text-sm italic">
              No significant risk flags identified based on the information provided.
            </p>
          );

          return (
            <div className="space-y-4">
              {/* SS claiming-age risk */}
              {showSsCard && (
                <div className="risk-card risk-card-medium pl-4 border-l-4 border-amber-500 py-1.5 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="brief-risk-title font-bold text-sm text-white">
                      Social Security Claiming Strategy
                    </p>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize bg-amber-900/40 text-amber-300 border border-amber-700/50">
                      medium
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    You plan to claim Social Security at age {ssClaimAge}, which reduces your benefit by {ssReductionPct}%
                    compared to waiting until 67.
                  </p>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    <span className="brief-ask-label font-semibold text-[#F59E0B]">Ask your advisor: </span>
                    Does the math support delaying to 70 given your portfolio size and retirement timeline — and what is the break-even age?
                  </p>
                </div>
              )}
              {triggeredRisks.map(risk => {
                const content = RISK_CONTENT[risk.id];
                if (!content) return null;

                // Build dynamic question for college-retirement-overlap
                const question = risk.id === 'college-retirement-overlap'
                  ? `How does my retirement timing affect my children's financial aid eligibility, and which of my accounts count against FAFSA? Should I prioritize 529 contributions or retirement accounts in the next ${yearsOut} years?`
                  : content.question;

                const borderClass =
                  risk.severity === 'high'   ? 'risk-card-high border-red-500'   :
                  risk.severity === 'medium' ? 'risk-card-medium border-amber-500' :
                                               'risk-card-low border-slate-600';
                const badgeClass =
                  risk.severity === 'high'   ? 'bg-red-900/40 text-red-300 border border-red-700/50'       :
                  risk.severity === 'medium' ? 'bg-amber-900/40 text-amber-300 border border-amber-700/50' :
                                               'bg-slate-700/50 text-slate-400 border border-slate-600';
                return (
                  <div
                    key={risk.id}
                    className={`risk-card pl-4 border-l-4 py-1.5 space-y-1 ${borderClass}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="brief-risk-title font-bold text-sm text-white">{risk.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${badgeClass}`}>
                        {risk.severity}
                      </span>
                    </div>
                    <p className="text-slate-400 text-xs leading-relaxed">{content.why}</p>
                    <p className="text-slate-300 text-xs leading-relaxed">
                      <span className="brief-ask-label font-semibold text-[#F59E0B]">Ask your advisor: </span>
                      {question}
                    </p>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </SectionBlock>

      {/* ── Section 4: Action Plan ─────────────────────────── */}
      <SectionBlock number="4" title="Your Action Plan">
        {!actionPlan ? (
          <p className="text-slate-500 text-sm italic">
            Generate your Action Plan first, then return here to include it in your brief.{' '}
            <Link
              to="/actions"
              className="text-[#F59E0B] hover:text-[#D97706] underline underline-offset-2 transition-colors"
            >
              Go to Action Plan →
            </Link>
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { key: 'thirty_days', label: 'Next 30 Days', colClass: 'action-col-30',   hdrClass: 'bg-red-900/60 text-red-100'   },
              { key: 'ninety_days', label: 'Next 90 Days', colClass: 'action-col-90',   hdrClass: 'bg-amber-900/60 text-amber-100' },
              { key: 'this_year',   label: 'This Year',    colClass: 'action-col-year', hdrClass: 'bg-green-900/60 text-green-100' },
            ].map(({ key, label, colClass, hdrClass }) => (
              <div key={key} className={colClass}>
                <div className={`action-col-header rounded-lg px-3 py-2 mb-3 ${hdrClass}`}>
                  <p className="font-bold text-sm">{label}</p>
                </div>
                <ol className="space-y-2 list-decimal list-outside ml-4">
                  {(actionPlan[key] || []).map((item, i) => (
                    <li key={i} className="text-slate-300 text-xs leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </SectionBlock>

      {/* ── Footer ─────────────────────────────────────────── */}
      <div className="brief-footer border-t border-[#F59E0B]/60 pt-4 space-y-1 text-center text-slate-600 text-xs">
        <p>
          Generated by Nirvana ·{' '}
          <a
            href="https://nirvana-retirement-app.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-400 transition-colors"
          >
            nirvana-retirement-app.vercel.app
          </a>
          {' '}·{' '}
          <a
            href="https://github.com/sainianoop/nirvana-retirement-planner"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-400 transition-colors"
          >
            github.com/sainianoop/nirvana-retirement-planner
          </a>
        </p>
        <p className="text-slate-700 italic">
          Not financial advice. Consult a licensed fiduciary advisor.
        </p>
      </div>

      {/* ── Next Step CTA (screen only, hidden in print) ────── */}
      <div
        data-no-print
        className="border-t-2 border-[#F59E0B]/30 bg-[#070C15] rounded-2xl px-6 py-8 flex flex-col items-center gap-3 text-center"
      >
        <button
          type="button"
          onClick={() => window.print()}
          className="w-full sm:w-auto bg-[#F59E0B] hover:bg-[#D97706] active:bg-[#B45309] text-[#0F172A] font-bold px-10 py-4 rounded-xl text-base transition-colors shadow-lg shadow-amber-900/30"
        >
          Print / Save as PDF
        </button>
        <Link
          to="/"
          className="text-slate-400 hover:text-amber-400 text-sm transition-colors"
        >
          ← Update my profile
        </Link>
      </div>

    </div>
  );
}
