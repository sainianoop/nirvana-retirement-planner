import { useNavigate } from 'react-router-dom';
import { analyzeRisks, getTotalInvestableAssets, getTotalNetWorth } from '../utils/riskEngine';

// ── Hardcoded risk content ────────────────────────────────────────────────────

const RISK_CONTENT = {
  'concentration-risk': {
    why: 'A large portion of your portfolio is concentrated in a small number of stocks with likely significant unrealized gains. This creates both market risk (a single stock event) and tax risk (selling triggers a large capital gains event).',
    options: [
      { name: 'Charitable Remainder Trust (CRT)', desc: 'Donate appreciated shares, receive an income stream, and defer the gain.' },
      { name: 'Exchange Fund', desc: 'Pool shares with others and receive a diversified basket after 7 years — no immediate tax event.' },
      { name: 'Qualified Opportunity Zone (QOZ)', desc: 'Roll gains into a QOZ fund to defer and potentially reduce the tax liability.' },
      { name: 'Options collar strategy', desc: 'Cap downside exposure without triggering a taxable sale.' },
      { name: 'Donor-Advised Fund (DAF)', desc: 'Contribute shares at fair market value, take the deduction now, and grant to charity later.' },
    ],
  },
  'healthcare-bridge': {
    why: "You're planning to retire before Medicare eligibility at 65, and won't have spousal employer coverage. The average marketplace plan for a 60-year-old runs $800–$1,200/month before subsidies — and your income in retirement may affect subsidy eligibility.",
    options: [
      { name: 'ACA marketplace plan', desc: 'Manage income to stay below 400% FPL threshold for subsidy eligibility.' },
      { name: 'HSA strategic drawdown', desc: 'Use accumulated HSA funds tax-free for premiums and out-of-pocket expenses.' },
      { name: 'COBRA bridge', desc: 'If retiring mid-year, extends employer coverage for up to 18 months.' },
      { name: 'Spousal coverage timing', desc: 'If your partner continues working, coordinate retirement dates around their employer coverage.' },
    ],
  },
  'sequence-of-returns': {
    why: 'Your liquid buffer (cash and money market) is relatively low compared to your total portfolio. A market downturn in the first 3–5 years of retirement, combined with ongoing withdrawals, can permanently impair long-term portfolio recovery.',
    options: [
      { name: 'Bucket strategy', desc: 'Keep 2 years in cash, 3–7 years in bonds, and the remainder in equities.' },
      { name: 'TIPS ladder', desc: 'Inflation-protected bonds matched to near-term spending needs.' },
      { name: 'Dynamic withdrawal rate', desc: 'Reduce discretionary spending in down market years to protect the portfolio.' },
      { name: 'Rental or pension income as spending floor', desc: 'Stable income sources reduce dependency on equity withdrawals.' },
    ],
  },
  'roth-conversion-window': {
    why: 'You have significant pre-tax retirement assets and are approaching a window where your income will likely be lower than during your peak earning years. This is often the best opportunity to convert to Roth at a lower effective rate — before RMDs force withdrawals at potentially higher rates.',
    options: [
      { name: 'Systematic Roth conversions', desc: 'Convert up to the top of your current bracket each year.' },
      { name: 'IRMAA bracket management', desc: 'Stay below Medicare premium thresholds — especially important post-65.' },
      { name: '0% capital gains window', desc: 'In low-income years, realize long-term gains at 0% federal rate.' },
      { name: 'Coordinate with Social Security delay', desc: 'Delaying SS extends your low-income conversion window.' },
    ],
  },
  'college-retirement-overlap': {
    why: 'You have children approaching college age while you\'re also approaching retirement. These are the two largest competing financial demands most families face, and the timing creates real sequencing risk — especially for financial aid.',
    options: [
      { name: '529 adequacy review', desc: 'Model total projected cost vs. current balance with your advisor.' },
      { name: 'FAFSA asset positioning', desc: 'Retirement accounts are excluded from aid calculations; taxable accounts are not.' },
      { name: 'Income reduction timing', desc: 'Lower reportable income in the financial aid base years if possible.' },
      { name: 'Coordinate retirement date', desc: 'Retiring before a child\'s junior year of college can affect aid eligibility calculations.' },
    ],
  },
  'real-estate-concentration': {
    why: "A significant portion of your net worth is tied up in real estate, which is illiquid by nature. If you need to rebalance or generate income in a downturn, you can't sell a bedroom.",
    options: [
      { name: '1031 exchange', desc: 'Sell one property and defer capital gains by rolling into another qualifying property.' },
      { name: 'Delaware Statutory Trust (DST)', desc: 'Exchange into a passive, professionally managed real estate structure.' },
      { name: 'UPREIT', desc: 'Contribute property to a REIT in exchange for operating partnership units, deferring the tax event.' },
      { name: 'Installment sale', desc: 'Spread capital gains across multiple years to manage bracket exposure.' },
    ],
  },
  'withdrawal-sequencing': {
    why: 'You have both taxable and tax-advantaged accounts — which is a planning opportunity, not a problem. The order you draw from each account type significantly affects your lifetime tax bill and how long your money lasts.',
    options: [
      { name: 'Draw order optimization', desc: 'Generally: taxable first, traditional IRA second, Roth last.' },
      { name: 'RMD projection', desc: 'Model when Required Minimum Distributions kick in and how they affect your bracket.' },
      { name: 'Social Security delay analysis', desc: 'Delaying to age 70 increases your benefit 8%/year; model the break-even against your portfolio.' },
    ],
  },
  'one-more-year': {
    why: "Based on your assets and expected retirement spending, you may already be financially ready to retire — but your target date suggests you're planning to wait. This is worth an explicit conversation with your advisor about what the extra years are actually buying you.",
    options: [
      { name: 'Shadow retirement test', desc: 'Take an unpaid leave of absence to pressure-test the lifestyle before committing.' },
      { name: 'Phased exit', desc: 'Transition to consulting or part-time work to reduce income dependency gradually.' },
      { name: 'Spousal timeline alignment', desc: 'Model scenarios where one partner stops before the other.' },
      { name: 'Explicit advisor review', desc: 'Ask your advisor to run the math on your current numbers — not just your target numbers.' },
    ],
  },
  'pre-retirement-checklist': {
    why: "You're within 18 months of retirement — which means several financial and logistical moves are significantly easier to execute now, while you still have W2 income, than after you leave.",
    options: [
      { name: 'HELOC', desc: 'Secure a home equity line of credit while your income qualifies.' },
      { name: 'Pledged Asset Line (PAL/SBLOC)', desc: 'Borrow against your brokerage portfolio at low rates with no taxable event.' },
      { name: 'Auto financing', desc: 'Lock in rates and approval based on your current income.' },
      { name: 'Mega-backdoor Roth', desc: 'Make final after-tax 401k contributions and convert before leaving your employer.' },
      { name: 'Employer life insurance conversion', desc: 'Convert group term to an individual policy before employer coverage ends.' },
    ],
  },
  'liquidity-event': {
    why: 'A large, taxable liquidity event in the near term creates a planning window — and a tax challenge. Without preparation, a business sale or large RSU vest could push you into the highest bracket in a single year.',
    options: [
      { name: 'QSBS exclusion', desc: 'If selling a qualified small business, up to $10M in gains may be federally excluded.' },
      { name: 'Installment sale', desc: 'Spread proceeds and tax liability across multiple years.' },
      { name: 'QOZ investment', desc: 'Roll gains into a Qualified Opportunity Zone fund to defer the tax.' },
      { name: 'Income bunching + offset', desc: 'Accelerate deductions or harvest losses in the same year as the event.' },
      { name: 'Charitable strategies', desc: 'A large DAF contribution in the high-income year can offset significant gains.' },
    ],
  },
};

// ── Severity config ───────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  high:   { border: 'border-l-red-500',   badge: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30' },
  medium: { border: 'border-l-amber-400', badge: 'bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30' },
  low:    { border: 'border-l-blue-400',  badge: 'bg-blue-400/15 text-blue-300 ring-1 ring-blue-400/30' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n) {
  return '$' + Math.round(n).toLocaleString();
}

function loadFormData() {
  try {
    const raw = localStorage.getItem('nirvana_intake');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }) {
  const { badge } = SEVERITY_CONFIG[severity];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${badge}`}>
      {severity}
    </span>
  );
}

function RiskCard({ risk }) {
  const content = RISK_CONTENT[risk.id];
  const { border } = SEVERITY_CONFIG[risk.severity];

  return (
    <div className={`bg-[#1E293B] rounded-xl border border-[#334155] border-l-4 ${border} overflow-hidden`}>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-white font-semibold text-base leading-snug">{risk.title}</h3>
          <SeverityBadge severity={risk.severity} />
        </div>

        {/* Why this matters */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Why this matters for you
          </p>
          <p className="text-slate-300 text-sm leading-relaxed">{content.why}</p>
        </div>

        {/* Options */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
            Options to explore with your advisor
          </p>
          <ul className="space-y-2">
            {content.options.map((opt, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="text-[#F59E0B] mt-0.5 shrink-0">›</span>
                <span>
                  <span className="text-white font-medium">{opt.name}</span>
                  <span className="text-slate-400"> — {opt.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-full bg-[#1E293B] border border-[#334155] flex items-center justify-center mb-5">
        <span className="text-2xl">📋</span>
      </div>
      <h2 className="text-white font-semibold text-lg mb-2">No profile found</h2>
      <p className="text-slate-400 text-sm mb-6 max-w-xs">
        Complete your retirement profile first so we can analyze your specific situation.
      </p>
      <button
        onClick={() => navigate('/')}
        className="bg-[#F59E0B] hover:bg-[#D97706] text-[#0F172A] font-bold px-6 py-3 rounded-xl text-sm transition-colors"
      >
        Complete Your Profile →
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RiskCards() {
  const navigate = useNavigate();
  const formData = loadFormData();

  if (!formData) return <EmptyState />;

  const risks     = analyzeRisks(formData);
  const triggered = risks.filter(r => r.triggered);
  const investable = getTotalInvestableAssets(formData);
  const netWorth   = getTotalNetWorth(formData);

  const highCount   = triggered.filter(r => r.severity === 'high').length;
  const mediumCount = triggered.filter(r => r.severity === 'medium').length;
  const lowCount    = triggered.filter(r => r.severity === 'low').length;

  return (
    <div className="max-w-3xl mx-auto space-y-8">

      {/* ── Summary header ─────────────────────────────────────────────────── */}
      <div className="bg-[#1E293B] rounded-2xl p-6 border border-[#334155]">
        <h1 className="text-white font-bold text-xl mb-1">
          We identified{' '}
          <span className="text-[#F59E0B]">{triggered.length} area{triggered.length !== 1 ? 's' : ''}</span>
          {' '}to review based on your profile
        </h1>
        <p className="text-slate-400 text-sm mb-5">
          These aren't problems — they're planning opportunities. Bring this to your next advisor meeting.
        </p>

        {/* Severity tally */}
        <div className="flex gap-3 flex-wrap mb-5">
          {highCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 ring-1 ring-red-500/30 text-red-400 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              {highCount} High priority
            </span>
          )}
          {mediumCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/10 ring-1 ring-amber-400/30 text-amber-300 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />
              {mediumCount} Medium priority
            </span>
          )}
          {lowCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-400/10 ring-1 ring-blue-400/30 text-blue-300 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-300" />
              {lowCount} For consideration
            </span>
          )}
        </div>

        {/* Net worth snapshot */}
        {(investable > 0 || netWorth > 0) && (
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#334155]">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Total investable assets</p>
              <p className="text-white font-semibold text-lg">{fmt(investable)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Estimated net worth</p>
              <p className="text-white font-semibold text-lg">{fmt(netWorth)}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Triggered risk cards ────────────────────────────────────────────── */}
      {triggered.length > 0 ? (
        <div className="space-y-4">
          {triggered.map(risk => (
            <RiskCard key={risk.id} risk={risk} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-400 text-sm">
          No risk flags triggered based on your current profile.
        </div>
      )}

      {/* ── Not triggered (collapsed, low-opacity) ──────────────────────────── */}
      {risks.filter(r => !r.triggered).length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-slate-500 text-sm hover:text-slate-300 transition-colors list-none flex items-center gap-2 select-none">
            <span className="group-open:rotate-90 transition-transform inline-block">›</span>
            {risks.filter(r => !r.triggered).length} additional risk patterns reviewed — none triggered
          </summary>
          <div className="mt-3 space-y-3 opacity-40">
            {risks.filter(r => !r.triggered).map(risk => (
              <div
                key={risk.id}
                className={`bg-[#1E293B] rounded-xl border border-[#334155] border-l-4 ${SEVERITY_CONFIG[risk.severity].border} px-5 py-3 flex items-center justify-between gap-4`}
              >
                <span className="text-slate-300 text-sm">{risk.title}</span>
                <SeverityBadge severity={risk.severity} />
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <div className="flex justify-end pb-10">
        <button
          onClick={() => navigate('/advisor')}
          className="bg-[#F59E0B] hover:bg-[#D97706] active:bg-[#B45309] text-[#0F172A] font-bold px-8 py-4 rounded-xl text-base transition-colors shadow-lg shadow-amber-900/30"
        >
          Generate Advisor Brief →
        </button>
      </div>
    </div>
  );
}
