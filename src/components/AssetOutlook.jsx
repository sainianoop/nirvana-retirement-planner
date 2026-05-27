import { useState, useMemo } from 'react';
import { projectAsset, hashFormData } from '../utils/projections';
import { analyzeRisks } from '../utils/riskEngine';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function num(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function fmt(n) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return '$' + Math.round(n).toLocaleString();
  return '$' + Math.round(n).toLocaleString();
}

function fmtFull(n) {
  return '$' + Math.round(n).toLocaleString();
}

function growthPct(current, projected) {
  if (current <= 0) return '—';
  return '+' + ((projected / current - 1) * 100).toFixed(0) + '%';
}

function loadFormData() {
  try {
    const raw = localStorage.getItem('nirvana_intake');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadCached(formHash) {
  try {
    const raw = localStorage.getItem('nirvana_projections');
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached.hash !== formHash) return null;
    return cached.rows;
  } catch {
    return null;
  }
}

function saveCache(formHash, rows) {
  try {
    localStorage.setItem('nirvana_projections', JSON.stringify({ hash: formHash, rows }));
  } catch {}
}

// ─────────────────────────────────────────────────────────────
// Tax treatment config
// ─────────────────────────────────────────────────────────────
const TAX = {
  deferred: {
    label: 'Tax-Deferred',
    colors: 'bg-amber-900/40 text-amber-300 border border-amber-700',
  },
  free: {
    label: 'Tax-Free',
    colors: 'bg-green-900/40 text-green-300 border border-green-700',
  },
  taxable: {
    label: 'Taxable',
    colors: 'bg-blue-900/40 text-blue-300 border border-blue-700',
  },
  realestate: {
    label: 'Real Estate',
    colors: 'bg-purple-900/40 text-purple-300 border border-purple-700',
  },
  education: {
    label: 'Education',
    colors: 'bg-teal-900/40 text-teal-300 border border-teal-700',
  },
  other: {
    label: 'Other',
    colors: 'bg-slate-700/60 text-slate-300 border border-slate-600',
  },
};

// ─────────────────────────────────────────────────────────────
// Asset definitions: field key → display row config
// ─────────────────────────────────────────────────────────────
const ASSET_DEFS = [
  {
    key: 'balance401k',
    label: '401(k)',
    tax: 'deferred',
    action: 'Maximize contributions and confirm investment allocation aligns with your timeline.',
    fundsDivisor: 'spending',
  },
  {
    key: 'balanceTraditionalIRA',
    label: 'Traditional IRA',
    tax: 'deferred',
    action: 'Evaluate Roth conversion opportunities before RMDs begin at age 73.',
    fundsDivisor: 'spending',
  },
  {
    key: 'balanceRothIRA',
    label: 'Roth IRA',
    tax: 'free',
    action: 'Let grow as long as possible — no RMDs required. Last account to draw from.',
    fundsDivisor: 'spending',
  },
  {
    key: 'balanceBrokerage',
    label: 'Taxable Brokerage',
    tax: 'taxable',
    action: 'Harvest tax losses annually and manage capital gains with withdrawal sequencing.',
    fundsDivisor: 'spending',
  },
  {
    key: 'balanceHSA',
    label: 'HSA',
    tax: 'free',
    action: 'Invest for growth — use as a stealth retirement account for healthcare costs.',
    fundsDivisor: 'spending',
  },
  {
    key: 'balance529',
    label: '529 Plan',
    tax: 'education',
    action: 'Review investment glide path and confirm beneficiary designation.',
    fundsDivisor: 'college',
  },
  {
    key: 'cashMoneyMarket',
    label: 'Cash / Money Market',
    tax: 'taxable',
    action: 'Keep 6–12 months of expenses here; move excess into higher-yield vehicles.',
    fundsDivisor: 'spending',
  },
  {
    key: 'crypto',
    label: 'Crypto',
    tax: 'taxable',
    action: 'Track cost basis carefully; consider position sizing relative to total portfolio.',
    fundsDivisor: 'spending',
  },
  {
    key: 'equityPrimaryHome',
    label: 'Primary Home Equity',
    tax: 'realestate',
    action: 'Not liquid — plan for downsizing or HELOC as a last resort, not a primary income source.',
    fundsDivisor: null,
  },
  {
    key: 'equityRental',
    label: 'Rental Property Equity',
    tax: 'realestate',
    action: 'Assess whether rental income supplements or complicates your retirement cash flow.',
    fundsDivisor: null,
  },
  {
    key: 'equityBusiness',
    label: 'Business Equity',
    tax: 'taxable',
    action: 'Build a succession or exit plan now — business value is illiquid until sold.',
    fundsDivisor: null,
  },
  {
    key: 'pension',
    label: 'Pension (Annual)',
    tax: 'deferred',
    action: 'Confirm survivor benefit options and understand COLA provisions.',
    fundsDivisor: 'lifetime',
    isPension: true,
  },
];

// Risk IDs that warn on specific assets
const RISK_TO_ASSET_KEYS = {
  'concentration-risk':       ['balanceBrokerage'],
  'sequence-of-returns':      ['cashMoneyMarket'],
  'roth-conversion-window':   ['balance401k', 'balanceTraditionalIRA'],
  'real-estate-concentration':['equityPrimaryHome', 'equityRental'],
  'withdrawal-sequencing':    ['balanceBrokerage', 'balanceRothIRA'],
  'liquidity-event':          ['equityBusiness'],
  'one-more-year':            ['balance401k', 'balanceRothIRA', 'balanceBrokerage'],
};

// ─────────────────────────────────────────────────────────────
// Build rows from formData
// ─────────────────────────────────────────────────────────────
function buildRows(formData) {
  const userAge   = num(formData.userAge);
  const retireAge = num(formData.retirementAgeUser) || userAge + 10;
  const years     = Math.max(0, retireAge - userAge);
  const spending  = num(formData.retirementSpending);
  const COLLEGE   = 35_000;

  // Which risk IDs are triggered?
  const triggeredRiskIds = new Set(
    analyzeRisks(formData)
      .filter(r => r.triggered)
      .map(r => r.id)
  );

  // Which asset keys have a warning?
  const warnedKeys = new Set();
  for (const [riskId, keys] of Object.entries(RISK_TO_ASSET_KEYS)) {
    if (triggeredRiskIds.has(riskId)) keys.forEach(k => warnedKeys.add(k));
  }

  const rows = [];

  for (const def of ASSET_DEFS) {
    const balance = num(formData[def.key]);
    if (balance <= 0) continue;

    const proj = def.isPension
      ? { conservative: balance, moderate: balance, aggressive: balance }
      : projectAsset(balance, years);

    let fundsLabel = '—';
    if (def.fundsDivisor === 'lifetime') {
      fundsLabel = 'Lifetime income';
    } else if (def.fundsDivisor === 'college' && COLLEGE > 0) {
      const yrs = proj.moderate / COLLEGE;
      fundsLabel = `~${yrs.toFixed(1)} yrs college`;
    } else if (def.fundsDivisor === 'spending' && spending > 0) {
      const yrs = proj.moderate / spending;
      fundsLabel = `~${yrs.toFixed(1)} yrs`;
    }

    rows.push({
      key:      def.key,
      label:    def.label,
      tax:      def.tax,
      balance,
      proj,
      fundsLabel,
      action:   def.action,
      warned:   warnedKeys.has(def.key),
    });
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────
// Sort helpers
// ─────────────────────────────────────────────────────────────
const TAX_ORDER = { free: 0, deferred: 1, taxable: 2, education: 3, realestate: 4, other: 5 };

function sortRows(rows, sortKey) {
  const clone = [...rows];
  if (sortKey === 'balance') {
    clone.sort((a, b) => b.balance - a.balance);
  } else if (sortKey === 'growth') {
    clone.sort((a, b) => {
      const ga = a.balance > 0 ? b.proj.moderate / b.balance : 0;
      const gb = a.balance > 0 ? a.proj.moderate / a.balance : 0;
      return ga - gb;
    });
  } else if (sortKey === 'tax') {
    clone.sort((a, b) => (TAX_ORDER[a.tax] ?? 9) - (TAX_ORDER[b.tax] ?? 9));
  }
  return clone;
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
function TaxBadge({ type }) {
  const cfg = TAX[type] || TAX.other;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cfg.colors}`}>
      {cfg.label}
    </span>
  );
}

function SortButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
        active
          ? 'bg-[#F59E0B] text-[#0F172A]'
          : 'bg-[#1E293B] text-slate-300 hover:text-white border border-slate-700'
      }`}
    >
      {label}
    </button>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-[#1E293B] rounded-xl p-4 border border-[#334155]">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function AssetOutlook() {
  const [sortKey, setSortKey] = useState('balance');

  const formData = useMemo(() => loadFormData(), []);

  const rows = useMemo(() => {
    if (!formData) return [];
    const hash   = hashFormData(formData);
    const cached = loadCached(hash);
    if (cached) return cached;
    const built = buildRows(formData);
    saveCache(hash, built);
    return built;
  }, [formData]);

  const sorted = useMemo(() => sortRows(rows, sortKey), [rows, sortKey]);

  // Summary totals
  const totals = useMemo(() => {
    const today      = rows.reduce((s, r) => s + r.balance,          0);
    const moderate   = rows.reduce((s, r) => s + r.proj.moderate,    0);
    const aggressive = rows.reduce((s, r) => s + r.proj.aggressive,  0);
    const spending   = num(formData?.retirementSpending) || 0;
    const coverageYrs = spending > 0 ? moderate / spending : null;
    const retireYear  = formData
      ? new Date().getFullYear() + Math.max(0, num(formData.retirementAgeUser) - num(formData.userAge))
      : null;
    return { today, moderate, aggressive, coverageYrs, retireYear };
  }, [rows, formData]);

  // ── Empty state ───────────────────────────────────────────
  if (!formData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-4xl mb-4">📊</div>
        <h2 className="text-2xl font-bold text-white mb-2">No profile data yet</h2>
        <p className="text-slate-400 max-w-sm">
          Fill in your asset balances on the <strong className="text-white">Your Profile</strong> tab,
          then come back here to see your outlook.
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-4xl mb-4">💰</div>
        <h2 className="text-2xl font-bold text-white mb-2">No assets entered</h2>
        <p className="text-slate-400 max-w-sm">
          Add at least one asset balance in your profile to see projections here.
        </p>
      </div>
    );
  }

  const userAge   = num(formData.userAge);
  const retireAge = num(formData.retirementAgeUser) || userAge + 10;
  const years     = Math.max(0, retireAge - userAge);

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-white">Asset Outlook</h1>
        <p className="text-slate-400 text-sm mt-1">
          Projected to retirement at age {retireAge} ({years} year{years !== 1 ? 's' : ''} away).
          Rates: Conservative 5% · Moderate 7% · Aggressive 10% annually.
        </p>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Today"
          value={fmt(totals.today)}
          sub="All entered assets"
        />
        <StatCard
          label="Projected (Moderate)"
          value={fmt(totals.moderate)}
          sub={`+${((totals.moderate / totals.today - 1) * 100).toFixed(0)}% at 7%/yr`}
        />
        <StatCard
          label="Retirement Year"
          value={totals.retireYear ? String(totals.retireYear) : '—'}
          sub={`Age ${retireAge}`}
        />
        <StatCard
          label="Coverage"
          value={totals.coverageYrs ? `~${totals.coverageYrs.toFixed(1)} yrs` : '—'}
          sub="Moderate ÷ annual spending"
        />
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 mr-1">Sort by:</span>
        <SortButton label="Current Balance" active={sortKey === 'balance'} onClick={() => setSortKey('balance')} />
        <SortButton label="Projected Growth" active={sortKey === 'growth'}  onClick={() => setSortKey('growth')}  />
        <SortButton label="Tax Treatment"    active={sortKey === 'tax'}     onClick={() => setSortKey('tax')}     />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[#334155]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#1E293B] text-slate-400 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3">Asset</th>
              <th className="text-left px-4 py-3">Tax Treatment</th>
              <th className="text-right px-4 py-3">Current</th>
              <th className="text-right px-4 py-3">Conservative</th>
              <th className="text-right px-4 py-3">Moderate</th>
              <th className="text-right px-4 py-3">Aggressive</th>
              <th className="text-right px-4 py-3">Funds</th>
              <th className="text-left px-4 py-3 max-w-[220px]">Action</th>
              <th className="text-center px-3 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={row.key}
                className={`border-t border-[#334155] transition-colors hover:bg-[#1E293B]/60 ${
                  i % 2 === 0 ? 'bg-[#0F172A]' : 'bg-[#111827]'
                }`}
              >
                {/* Asset name */}
                <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                  {row.label}
                </td>

                {/* Tax badge */}
                <td className="px-4 py-3">
                  <TaxBadge type={row.tax} />
                </td>

                {/* Current */}
                <td className="px-4 py-3 text-right text-slate-200 font-mono tabular-nums">
                  {fmtFull(row.balance)}
                </td>

                {/* Conservative */}
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  <div className="text-slate-300">{fmtFull(row.proj.conservative)}</div>
                  <div className="text-xs text-slate-500">{growthPct(row.balance, row.proj.conservative)}</div>
                </td>

                {/* Moderate */}
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  <div className="text-amber-300 font-semibold">{fmtFull(row.proj.moderate)}</div>
                  <div className="text-xs text-amber-500">{growthPct(row.balance, row.proj.moderate)}</div>
                </td>

                {/* Aggressive */}
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  <div className="text-green-300">{fmtFull(row.proj.aggressive)}</div>
                  <div className="text-xs text-green-600">{growthPct(row.balance, row.proj.aggressive)}</div>
                </td>

                {/* Funds */}
                <td className="px-4 py-3 text-right text-slate-400 whitespace-nowrap text-xs">
                  {row.fundsLabel}
                </td>

                {/* Action */}
                <td className="px-4 py-3 text-slate-400 text-xs max-w-[220px] leading-relaxed">
                  {row.action}
                </td>

                {/* Warning icon */}
                <td className="px-3 py-3 text-center">
                  {row.warned && (
                    <span title="Risk flag applies to this asset" className="text-amber-400 text-base">
                      ⚠️
                    </span>
                  )}
                </td>
              </tr>
            ))}

            {/* Totals row */}
            <tr className="border-t-2 border-amber-500/60 bg-[#1E293B] font-bold">
              <td className="px-4 py-3 text-white" colSpan={2}>Total</td>
              <td className="px-4 py-3 text-right text-white font-mono tabular-nums">
                {fmtFull(rows.reduce((s, r) => s + r.balance, 0))}
              </td>
              <td className="px-4 py-3 text-right text-slate-300 font-mono tabular-nums">
                {fmtFull(rows.reduce((s, r) => s + r.proj.conservative, 0))}
              </td>
              <td className="px-4 py-3 text-right text-amber-300 font-mono tabular-nums">
                {fmtFull(rows.reduce((s, r) => s + r.proj.moderate, 0))}
              </td>
              <td className="px-4 py-3 text-right text-green-300 font-mono tabular-nums">
                {fmtFull(rows.reduce((s, r) => s + r.proj.aggressive, 0))}
              </td>
              <td colSpan={3}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footnote */}
      <p className="text-xs text-slate-600 text-center pb-2">
        Projections are illustrative only and assume a constant annual return with no withdrawals.
        They are not a guarantee of future performance. Consult a licensed financial advisor.
      </p>
    </div>
  );
}
