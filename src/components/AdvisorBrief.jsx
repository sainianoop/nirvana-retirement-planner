import { useMemo } from 'react';
import { analyzeRisks, getTotalInvestableAssets } from '../utils/riskEngine';
import { projectAsset } from '../utils/projections';

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

function fmtDollarCompact(n) {
  if (!n && n !== 0) return '—';
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  return '$' + Math.round(n).toLocaleString();
}

function today() {
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
// Asset definitions (same order as AssetOutlook)
// ─────────────────────────────────────────────────────────────
const ASSET_DEFS = [
  { key: 'balance401k',           label: '401(k)',                  tax: 'Tax-Deferred', action: 'Maximize contributions; confirm allocation matches timeline.' },
  { key: 'balanceTraditionalIRA', label: 'Traditional IRA',         tax: 'Tax-Deferred', action: 'Evaluate Roth conversion opportunities before age 73 RMDs.' },
  { key: 'balanceRothIRA',        label: 'Roth IRA',                tax: 'Tax-Free',     action: 'Let grow as long as possible — last account to draw from.' },
  { key: 'balanceBrokerage',      label: 'Taxable Brokerage',       tax: 'Taxable',      action: 'Harvest tax losses annually; manage capital gains sequencing.' },
  { key: 'balanceHSA',            label: 'HSA',                     tax: 'Tax-Free',     action: 'Invest for growth — stealth retirement account for healthcare.' },
  { key: 'balance529',            label: '529 Plan',                tax: 'Education',    action: 'Review investment glide path; confirm beneficiary designation.' },
  { key: 'cashMoneyMarket',       label: 'Cash / Money Market',     tax: 'Taxable',      action: 'Keep 6–12 months of expenses here; move excess to yield.' },
  { key: 'crypto',                label: 'Crypto',                  tax: 'Taxable',      action: 'Track cost basis carefully; review position sizing.' },
  { key: 'equityPrimaryHome',     label: 'Primary Home Equity',     tax: 'Real Estate',  action: 'Not liquid — plan downsizing or HELOC as last resort only.' },
  { key: 'equityRental',          label: 'Rental Property Equity',  tax: 'Real Estate',  action: 'Assess whether rental income supplements retirement cash flow.' },
  { key: 'equityBusiness',        label: 'Business Equity',         tax: 'Taxable',      action: 'Build a succession or exit plan — illiquid until sold.' },
  { key: 'pension',               label: 'Pension (Annual)',         tax: 'Tax-Deferred', action: 'Confirm survivor benefits and COLA provisions.' },
];

// ─────────────────────────────────────────────────────────────
// Advisor questions per risk
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
    question: 'What cash and bond buffer is right for my situation, and how do I structure withdrawals in a down market year?',
  },
  'roth-conversion-window': {
    why: 'You have significant pre-tax balances and years before RMDs begin — a window to convert at lower tax rates.',
    question: 'How much should I convert to Roth each year between now and 73 to minimize lifetime taxes and future RMDs?',
  },
  'college-retirement-overlap': {
    why: 'Your retirement timeline overlaps with college tuition years for one or more children.',
    question: 'How does my retirement timing affect financial aid eligibility, and which accounts count against FAFSA?',
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
// Tax badge colours (screen only — print uses plain text)
// ─────────────────────────────────────────────────────────────
const TAX_BADGE = {
  'Tax-Deferred': 'bg-amber-900/40 text-amber-300 border border-amber-700',
  'Tax-Free':     'bg-green-900/40 text-green-300 border border-green-700',
  'Taxable':      'bg-blue-900/40 text-blue-300 border border-blue-700',
  'Real Estate':  'bg-purple-900/40 text-purple-300 border border-purple-700',
  'Education':    'bg-teal-900/40 text-teal-300 border border-teal-700',
};

// ─────────────────────────────────────────────────────────────
// Print styles injected into <head>
// ─────────────────────────────────────────────────────────────
const PRINT_CSS = `
@media print {
  /* Hide app chrome */
  nav, [data-no-print] { display: none !important; }

  body, html {
    background: #fff !important;
    color: #111 !important;
    font-size: 11pt;
  }

  /* Reset dark-mode colours for print */
  .brief-root {
    background: #fff !important;
    color: #111 !important;
    padding: 0 !important;
    max-width: 100% !important;
  }
  .brief-root * {
    color: inherit !important;
    border-color: #ccc !important;
    background: transparent !important;
  }
  .brief-section {
    break-inside: avoid;
    margin-bottom: 18pt !important;
  }
  .brief-section-heading {
    color: #1a3a5c !important;
    border-bottom: 1.5pt solid #1a3a5c !important;
    font-size: 13pt !important;
    font-weight: bold;
    margin-bottom: 8pt !important;
    padding-bottom: 3pt !important;
  }
  .brief-header-title {
    color: #1a3a5c !important;
    font-size: 20pt !important;
  }
  .brief-header-sub {
    color: #444 !important;
  }
  .brief-disclaimer {
    color: #666 !important;
    font-size: 9pt !important;
  }
  .brief-footer {
    color: #888 !important;
    font-size: 9pt !important;
    border-top: 0.5pt solid #ccc !important;
    margin-top: 18pt !important;
  }
  .brief-risk-title {
    color: #1a3a5c !important;
    font-weight: bold !important;
  }
  .brief-risk-question {
    color: #333 !important;
    font-style: italic !important;
  }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 0.5pt solid #ccc; padding: 4pt 6pt; font-size: 9.5pt; }
  th { background: #f0f4f8 !important; color: #1a3a5c !important; font-weight: bold; }
  .totals-row td { font-weight: bold; border-top: 1.5pt solid #1a3a5c !important; }
  a { color: #1a3a5c !important; text-decoration: none; }
}
`;

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
function SectionHeading({ children }) {
  return (
    <h2 className="brief-section-heading text-[#F59E0B] font-bold text-lg border-b border-[#334155] pb-2 mb-4 print:text-[#1a3a5c] print:border-[#1a3a5c]">
      {children}
    </h2>
  );
}

function SnapshotRow({ label, value }) {
  if (!value) return null;
  return (
    <tr className="border-b border-[#334155]">
      <td className="py-2 pr-6 text-slate-400 text-sm whitespace-nowrap">{label}</td>
      <td className="py-2 text-white text-sm font-medium">{value}</td>
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
      const style = document.createElement('style');
      style.id = id;
      style.textContent = PRINT_CSS;
      document.head.appendChild(style);
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
        <p className="text-slate-400 max-w-sm">
          Complete your profile on the{' '}
          <strong className="text-white">Your Profile</strong> tab, then come back
          to generate your advisor brief.
        </p>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────
  const userAge    = num(formData.userAge);
  const partnerAge = num(formData.partnerAge);
  const retireAge  = num(formData.retirementAgeUser);
  const yearsOut   = Math.max(0, retireAge - userAge);
  const retireYear = new Date().getFullYear() + yearsOut;

  const investable = getTotalInvestableAssets(formData);
  const spending   = num(formData.retirementSpending);

  // Build asset rows (non-zero, sorted desc by balance)
  const assetRows = ASSET_DEFS
    .map(def => {
      const balance = num(formData[def.key]);
      if (balance <= 0) return null;
      const proj = projectAsset(balance, yearsOut);
      return { ...def, balance, moderate: proj.moderate };
    })
    .filter(Boolean)
    .sort((a, b) => b.balance - a.balance);

  const totalBalance  = assetRows.reduce((s, r) => s + r.balance,  0);
  const totalModerate = assetRows.reduce((s, r) => s + r.moderate, 0);

  // Projected moderate at retirement (investable assets only, for snapshot)
  const investableProj = projectAsset(investable, yearsOut).moderate;

  // Healthcare label
  const HEALTHCARE_LABELS = {
    spouse_employer: 'Spouse\'s employer plan',
    aca:             'ACA marketplace',
    not_sure:        'Not yet decided',
  };
  const healthcareLabel = HEALTHCARE_LABELS[formData.healthcareRetirement] || formData.healthcareRetirement || '—';

  // Triggered risks (high first)
  const triggeredRisks = analyzeRisks(formData).filter(r => r.triggered);

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="brief-root max-w-4xl mx-auto space-y-8">

      {/* Print stylesheet already injected; this style handles screen padding */}
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="brief-header-title text-3xl font-bold text-white mb-1">
            Retirement Readiness Brief
          </h1>
          <p className="brief-header-sub text-slate-400 text-sm">
            Prepared by Nirvana · {today()}
          </p>
          <p className="brief-disclaimer text-slate-500 text-xs italic mt-2 max-w-xl leading-relaxed">
            This brief was generated by Nirvana, an AI-powered retirement planning tool.
            It is not financial advice. Please review all items with a licensed fiduciary advisor.
          </p>
        </div>

        {/* Print button — hidden when printing */}
        <button
          data-no-print
          onClick={() => window.print()}
          className="flex-shrink-0 ml-6 flex items-center gap-2 bg-[#F59E0B] hover:bg-[#D97706] text-[#0F172A] font-bold px-5 py-3 rounded-xl text-sm transition-colors shadow-lg shadow-amber-900/30"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print / Save as PDF
        </button>
      </div>

      {/* ── Section 1: Household Snapshot ──────────────────── */}
      <section className="brief-section bg-[#1E293B] rounded-2xl p-6 border border-[#334155]">
        <SectionHeading>1 · Household Snapshot</SectionHeading>
        <table className="w-full">
          <tbody>
            <SnapshotRow label="Your age"                value={userAge ? `${userAge}` : null} />
            {formData.hasPartner && partnerAge > 0 && (
              <SnapshotRow label="Partner's age"         value={`${partnerAge}`} />
            )}
            <SnapshotRow label="Target retirement age"   value={retireAge ? `${retireAge}` : null} />
            <SnapshotRow label="Target retirement year"  value={retireAge ? `${retireYear}` : null} />
            <SnapshotRow label="Years to retirement"     value={retireAge && userAge ? `${yearsOut} year${yearsOut !== 1 ? 's' : ''}` : null} />
            <SnapshotRow label="State of residence"      value={formData.state || null} />
            <SnapshotRow
              label="Current household income"
              value={formData.householdIncome ? fmtDollar(num(formData.householdIncome)) + '/yr' : null}
            />
            <SnapshotRow
              label="Target retirement spending"
              value={spending > 0 ? fmtDollar(spending) + '/yr' : null}
            />
            <SnapshotRow
              label="Total current portfolio"
              value={investable > 0 ? fmtDollarCompact(investable) : null}
            />
            <SnapshotRow
              label="Projected at retirement (moderate)"
              value={investable > 0 && yearsOut > 0 ? fmtDollarCompact(investableProj) + ' at 7%/yr' : null}
            />
            <SnapshotRow label="Healthcare post-retirement" value={healthcareLabel} />
          </tbody>
        </table>
      </section>

      {/* ── Section 2: Portfolio Summary ───────────────────── */}
      <section className="brief-section bg-[#1E293B] rounded-2xl p-6 border border-[#334155]">
        <SectionHeading>2 · Portfolio Summary</SectionHeading>

        {assetRows.length === 0 ? (
          <p className="text-slate-500 text-sm italic">No asset balances entered.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-[#334155]">
                  <th className="text-left pb-2 pr-4">Asset</th>
                  <th className="text-left pb-2 pr-4">Tax Treatment</th>
                  <th className="text-right pb-2 pr-4">Current</th>
                  <th className="text-right pb-2 pr-4">Projected (Moderate)</th>
                  <th className="text-left pb-2">Action Note</th>
                </tr>
              </thead>
              <tbody>
                {assetRows.map(row => (
                  <tr key={row.key} className="border-b border-[#334155]/60">
                    <td className="py-2 pr-4 text-white font-medium whitespace-nowrap">{row.label}</td>
                    <td className="py-2 pr-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${TAX_BADGE[row.tax] ?? 'bg-slate-700 text-slate-300'}`}>
                        {row.tax}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-200 font-mono tabular-nums whitespace-nowrap">
                      {fmtDollar(row.balance)}
                    </td>
                    <td className="py-2 pr-4 text-right text-amber-300 font-mono tabular-nums whitespace-nowrap">
                      {yearsOut > 0 ? fmtDollar(row.moderate) : '—'}
                    </td>
                    <td className="py-2 text-slate-400 text-xs leading-snug">{row.action}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="totals-row border-t-2 border-amber-500/60 font-bold">
                  <td className="pt-3 text-white" colSpan={2}>Total</td>
                  <td className="pt-3 text-right text-white font-mono tabular-nums whitespace-nowrap">
                    {fmtDollar(totalBalance)}
                  </td>
                  <td className="pt-3 text-right text-amber-300 font-mono tabular-nums whitespace-nowrap">
                    {yearsOut > 0 ? fmtDollar(totalModerate) : '—'}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Section 3: Key Questions for Your Advisor ─────── */}
      <section className="brief-section bg-[#1E293B] rounded-2xl p-6 border border-[#334155]">
        <SectionHeading>3 · Key Questions for Your Advisor</SectionHeading>

        {triggeredRisks.length === 0 ? (
          <p className="text-slate-500 text-sm italic">
            No significant risk flags identified based on the information provided.
          </p>
        ) : (
          <div className="space-y-5">
            {triggeredRisks.map(risk => {
              const content = RISK_CONTENT[risk.id];
              if (!content) return null;
              const severityColor =
                risk.severity === 'high'   ? 'text-red-400'    :
                risk.severity === 'medium' ? 'text-amber-400'  : 'text-slate-400';
              const severityBadge =
                risk.severity === 'high'   ? 'bg-red-900/40 text-red-300 border border-red-700/50'    :
                risk.severity === 'medium' ? 'bg-amber-900/40 text-amber-300 border border-amber-700/50' :
                                             'bg-slate-700/50 text-slate-400 border border-slate-600';
              return (
                <div key={risk.id} className="pl-4 border-l-2 border-[#334155] space-y-1">
                  <div className="flex items-center gap-2">
                    <p className={`brief-risk-title font-bold text-sm text-white`}>
                      {risk.title}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${severityBadge}`}>
                      {risk.severity}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs leading-relaxed">{content.why}</p>
                  <p className="brief-risk-question text-slate-300 text-xs leading-relaxed">
                    <span className="font-semibold text-slate-400">Ask your advisor: </span>
                    {content.question}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 4: Action Plan ─────────────────────────── */}
      <section className="brief-section bg-[#1E293B] rounded-2xl p-6 border border-[#334155]">
        <SectionHeading>4 · Your Action Plan</SectionHeading>

        {!actionPlan ? (
          <p className="text-slate-500 text-sm italic">
            Visit the <strong className="text-slate-300">Action Plan</strong> tab to generate your
            personalized action items, then return here.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { key: 'thirty_days', label: '⚡ Next 30 Days',  color: 'text-red-300'   },
              { key: 'ninety_days', label: '📅 Next 90 Days',  color: 'text-amber-300' },
              { key: 'this_year',   label: '🎯 This Year',     color: 'text-green-300' },
            ].map(({ key, label, color }) => (
              <div key={key}>
                <p className={`font-bold text-sm mb-2 ${color}`}>{label}</p>
                <ol className="space-y-2 list-decimal list-inside">
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
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <div className="brief-footer border-t border-[#334155] pt-4 pb-10 text-center text-slate-600 text-xs">
        Generated by Nirvana ·{' '}
        <a
          href="https://github.com/sainianoop/nirvana-retirement-planner"
          target="_blank"
          rel="noreferrer"
          className="text-slate-500 hover:text-slate-300 transition-colors"
        >
          github.com/sainianoop/nirvana-retirement-planner
        </a>
        {' '}· Not financial advice
      </div>
    </div>
  );
}
