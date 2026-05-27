import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
  'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
  'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma',
  'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
];

const DEFAULT_STATE = {
  userAge: '',
  hasPartner: false,
  partnerAge: '',
  retirementAgeUser: '',
  retirementAgePartner: '',
  state: '',
  numChildren: 0,
  children: [],
  householdIncome: '',
  retirementSpending: '',
  hasMortgage: false,
  mortgagePayment: '',
  mortgagePayoffYear: '',
  healthcareToday: '',
  healthcareRetirement: '',
  balance401k: '',
  balanceTraditionalIRA: '',
  balanceRothIRA: '',
  balanceBrokerage: '',
  balanceHSA: '',
  balance529: '',
  equityPrimaryHome: '',
  equityRental: '',
  equityBusiness: '',
  cashMoneyMarket: '',
  crypto: '',
  pensionMonthlyIncome: '',
  hasConcentratedStock: false,
  retiringWithin18Months: false,
  retiringBeforeAge65: false,
  livingAbroadPlanned: false,
  liquidityEventExpected: false,
};

function loadFromStorage() {
  try {
    const raw = localStorage.getItem('nirvana_intake');
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

const inputClass =
  'w-full bg-[#0F172A] border border-[#334155] rounded-lg px-3 py-2.5 text-white ' +
  'placeholder-slate-500 focus:outline-none focus:border-[#F59E0B] focus:ring-1 ' +
  'focus:ring-[#F59E0B] transition-colors text-sm';

const labelClass = 'block text-sm font-medium text-slate-300 mb-1.5';

function SectionHeader({ number, title }) {
  return (
    <div className="flex items-center gap-3 mb-7">
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[#F59E0B] text-[#0F172A] text-sm font-bold shrink-0">
        {number}
      </span>
      <h2 className="text-[#F59E0B] font-semibold text-lg tracking-wide">{title}</h2>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ' +
        'focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:ring-offset-2 focus:ring-offset-[#1E293B] ' +
        (checked ? 'bg-[#F59E0B]' : 'bg-[#334155]')
      }
    >
      <span
        className={
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ' +
          (checked ? 'translate-x-6' : 'translate-x-1')
        }
      />
    </button>
  );
}

function DollarInput({ value, onChange, placeholder = '0' }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm select-none">$</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputClass} pl-7`}
      />
    </div>
  );
}

function AssetRow({ label, value, onChange, optional }) {
  return (
    <>
      <div className="flex items-center text-sm text-slate-300">
        {label}
        {optional && <span className="ml-1.5 text-slate-500 text-xs">(optional)</span>}
      </div>
      <DollarInput value={value} onChange={onChange} />
    </>
  );
}

const KEY_FLAGS = [
  {
    key: 'hasConcentratedStock',
    label:
      'I have a concentrated stock position (more than 30% of my portfolio in 1–3 stocks with large unrealized gains)',
  },
  { key: 'retiringWithin18Months', label: 'I plan to retire within the next 18 months' },
  { key: 'retiringBeforeAge65', label: 'I plan to retire before age 65' },
  {
    key: 'livingAbroadPlanned',
    label: 'I plan to spend significant time living outside the US in retirement',
  },
  {
    key: 'liquidityEventExpected',
    label:
      "I'm expecting a large liquidity event in the next 3 years (business sale, large RSU vest, inheritance)",
  },
];

export default function IntakeForm() {
  const [form, setForm] = useState(loadFromStorage);
  const navigate = useNavigate();

  // Keep children array in sync with numChildren
  useEffect(() => {
    const count = Number(form.numChildren);
    setForm(prev => {
      const existing = prev.children || [];
      if (existing.length === count) return prev;
      const next = Array.from(
        { length: count },
        (_, i) => existing[i] ?? { age: '', has529: false }
      );
      return { ...prev, children: next };
    });
  }, [form.numChildren]);

  function set(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function setChild(index, key, value) {
    setForm(prev => {
      const children = [...prev.children];
      children[index] = { ...children[index], [key]: value };
      return { ...prev, children };
    });
  }

  function handleSubmit() {
    localStorage.setItem('nirvana_intake', JSON.stringify(form));
    navigate('/risk');
  }

  const numChildren = Number(form.numChildren);
  const showPartnerRetirement = form.hasPartner && form.partnerAge !== '';

  return (
    <div className="max-w-3xl mx-auto space-y-8">

      {/* ── SECTION 1: Household ─────────────────────────────── */}
      <section className="bg-[#1E293B] rounded-2xl p-8 border border-[#334155]">
        <SectionHeader number="1" title="Household" />

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Your age</label>
              <input
                type="number"
                min="18"
                max="99"
                value={form.userAge}
                onChange={e => set('userAge', e.target.value)}
                placeholder="e.g. 45"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Target retirement age — you</label>
              <input
                type="number"
                min="40"
                max="80"
                value={form.retirementAgeUser}
                onChange={e => set('retirementAgeUser', e.target.value)}
                placeholder="e.g. 62"
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Toggle checked={form.hasPartner} onChange={v => set('hasPartner', v)} />
            <span className="text-slate-300 text-sm">I have a spouse / partner</span>
          </div>

          {form.hasPartner && (
            <div className="grid grid-cols-2 gap-5 pl-5 border-l-2 border-[#F59E0B]/30">
              <div>
                <label className={labelClass}>Partner's age</label>
                <input
                  type="number"
                  min="18"
                  max="99"
                  value={form.partnerAge}
                  onChange={e => set('partnerAge', e.target.value)}
                  placeholder="e.g. 43"
                  className={inputClass}
                />
              </div>
              {showPartnerRetirement && (
                <div>
                  <label className={labelClass}>Target retirement age — partner</label>
                  <input
                    type="number"
                    min="40"
                    max="80"
                    value={form.retirementAgePartner}
                    onChange={e => set('retirementAgePartner', e.target.value)}
                    placeholder="e.g. 60"
                    className={inputClass}
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label className={labelClass}>State of residence</label>
            <select
              value={form.state}
              onChange={e => set('state', e.target.value)}
              className={inputClass}
            >
              <option value="">Select a state…</option>
              {US_STATES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Number of children</label>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set('numChildren', n)}
                  className={
                    'w-10 h-10 rounded-lg text-sm font-semibold transition-colors ' +
                    (Number(form.numChildren) === n
                      ? 'bg-[#F59E0B] text-[#0F172A]'
                      : 'bg-[#0F172A] text-slate-300 border border-[#334155] hover:border-[#475569]')
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {numChildren > 0 && (
            <div className="space-y-3 pl-5 border-l-2 border-[#F59E0B]/30">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Children</p>
              {Array.from({ length: numChildren }).map((_, i) => (
                <div key={i} className="flex items-end gap-5">
                  <div className="w-32">
                    <label className="text-xs text-slate-400 mb-1.5 block">Child {i + 1} age</label>
                    <input
                      type="number"
                      min="0"
                      max="25"
                      value={form.children[i]?.age ?? ''}
                      onChange={e => setChild(i, 'age', e.target.value)}
                      placeholder="Age"
                      className={inputClass}
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-2.5">
                    <Toggle
                      checked={form.children[i]?.has529 ?? false}
                      onChange={v => setChild(i, 'has529', v)}
                    />
                    <span className="text-sm text-slate-300">529 funded</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── SECTION 2: Income & Spending ─────────────────────── */}
      <section className="bg-[#1E293B] rounded-2xl p-8 border border-[#334155]">
        <SectionHeader number="2" title="Income & Spending" />

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>
                Current household income{' '}
                <span className="text-slate-500 font-normal">(pre-tax)</span>
              </label>
              <DollarInput
                value={form.householdIncome}
                onChange={v => set('householdIncome', v)}
                placeholder="e.g. 250000"
              />
            </div>
            <div>
              <label className={labelClass}>
                Expected retirement spending{' '}
                <span className="text-slate-500 font-normal">(post-tax / yr)</span>
              </label>
              <DollarInput
                value={form.retirementSpending}
                onChange={v => set('retirementSpending', v)}
                placeholder="e.g. 120000"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-4">
              <Toggle checked={form.hasMortgage} onChange={v => set('hasMortgage', v)} />
              <span className="text-slate-300 text-sm">I have a mortgage</span>
            </div>
            {form.hasMortgage && (
              <div className="grid grid-cols-2 gap-5 pl-5 border-l-2 border-[#F59E0B]/30">
                <div>
                  <label className={labelClass}>Monthly payment</label>
                  <DollarInput
                    value={form.mortgagePayment}
                    onChange={v => set('mortgagePayment', v)}
                    placeholder="e.g. 3200"
                  />
                </div>
                <div>
                  <label className={labelClass}>Payoff year</label>
                  <input
                    type="number"
                    min="2025"
                    max="2060"
                    value={form.mortgagePayoffYear}
                    onChange={e => set('mortgagePayoffYear', e.target.value)}
                    placeholder="e.g. 2038"
                    className={inputClass}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Healthcare today</label>
              <select
                value={form.healthcareToday}
                onChange={e => set('healthcareToday', e.target.value)}
                className={inputClass}
              >
                <option value="">Select…</option>
                <option value="employer">Employer</option>
                <option value="spouse_employer">Spouse's employer</option>
                <option value="self_employed">Self-employed / marketplace</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Healthcare plan in retirement</label>
              <select
                value={form.healthcareRetirement}
                onChange={e => set('healthcareRetirement', e.target.value)}
                className={inputClass}
              >
                <option value="">Select…</option>
                <option value="spouse_employer">Spouse's employer</option>
                <option value="aca">ACA marketplace</option>
                <option value="not_sure">Not sure yet</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: Assets ────────────────────────────────── */}
      <section className="bg-[#1E293B] rounded-2xl p-8 border border-[#334155]">
        <SectionHeader number="3" title="Assets by Account Type" />

        <div className="grid grid-cols-[1fr_1fr] gap-x-10 gap-y-4 items-center">
          <AssetRow label="401(k) / 403(b)" value={form.balance401k} onChange={v => set('balance401k', v)} />
          <AssetRow label="Traditional IRA" value={form.balanceTraditionalIRA} onChange={v => set('balanceTraditionalIRA', v)} />
          <AssetRow label="Roth IRA / Roth 401(k)" value={form.balanceRothIRA} onChange={v => set('balanceRothIRA', v)} />
          <AssetRow label="Taxable brokerage" value={form.balanceBrokerage} onChange={v => set('balanceBrokerage', v)} />
          <AssetRow label="HSA" value={form.balanceHSA} onChange={v => set('balanceHSA', v)} />
          <AssetRow label="529 total balance" value={form.balance529} onChange={v => set('balance529', v)} />
          <AssetRow label="Real estate equity — primary home" value={form.equityPrimaryHome} onChange={v => set('equityPrimaryHome', v)} />
          <AssetRow label="Rental property equity" value={form.equityRental} onChange={v => set('equityRental', v)} />
          <AssetRow label="Business / private equity" value={form.equityBusiness} onChange={v => set('equityBusiness', v)} />
          <AssetRow label="Cash / money market" value={form.cashMoneyMarket} onChange={v => set('cashMoneyMarket', v)} />
          <AssetRow label="Crypto" value={form.crypto} onChange={v => set('crypto', v)} optional />
          <AssetRow label="Pension / annuity (monthly income)" value={form.pensionMonthlyIncome} onChange={v => set('pensionMonthlyIncome', v)} />
        </div>
      </section>

      {/* ── SECTION 4: Key Flags ─────────────────────────────── */}
      <section className="bg-[#1E293B] rounded-2xl p-8 border border-[#334155]">
        <SectionHeader number="4" title="Key Flags" />
        <p className="text-slate-400 text-sm mb-6 -mt-3">
          These unlock specific risk factors in your analysis.
        </p>

        <div className="space-y-3">
          {KEY_FLAGS.map(({ key, label }) => (
            <div
              key={key}
              className="flex items-start gap-4 p-4 rounded-xl bg-[#0F172A] border border-[#334155] hover:border-[#475569] transition-colors cursor-pointer"
              onClick={() => set(key, !form[key])}
            >
              <div className="mt-0.5" onClick={e => e.stopPropagation()}>
                <Toggle checked={form[key]} onChange={v => set(key, v)} />
              </div>
              <span className="text-slate-200 text-sm leading-relaxed">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <div className="flex justify-end pb-10">
        <button
          type="button"
          onClick={handleSubmit}
          className="bg-[#F59E0B] hover:bg-[#D97706] active:bg-[#B45309] text-[#0F172A] font-bold px-8 py-4 rounded-xl text-base transition-colors shadow-lg shadow-amber-900/30"
        >
          Analyze My Retirement Readiness →
        </button>
      </div>
    </div>
  );
}
