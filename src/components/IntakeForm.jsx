import { useState, useEffect, useRef } from 'react';
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
  // Section 1 — Household
  userAge: '',
  hasPartner: false,
  partnerAge: '',
  retirementAgeUser: '',
  retirementAgePartner: '',
  state: '',
  numChildren: 0,
  children: [],

  // Section 2 — Current Income
  householdIncome: '',
  incomeType: '',
  partnerIncomeIncluded: false,

  // Section 2 — Expense breakdown (optional)
  showExpenseBreakdown: false,
  expenseHousing: '',
  expenseChildcare: '',
  expenseHealthcare: '',
  expenseFood: '',
  expenseTransportation: '',
  expenseTravel: '',
  expenseOther: '',

  // Section 2 — Retirement spending
  retirementSpending: '',

  // Section 2 — Healthcare
  healthcareToday: '',
  healthcareRetirement: '',

  // Section 3 — Assets
  balance401k: '',
  balanceTraditionalIRA: '',
  balanceRothIRA: '',
  balanceHSA: '',
  balanceStocks: '',
  balanceBrokerage: '',
  balance529: '',
  equityPrimaryHome: '',
  equityRental: '',
  equityBusiness: '',
  cashMoneyMarket: '',
  crypto: '',
  pensionMonthlyIncome: '',

  // Section 4 — Additional factors
  hasConcentratedStock: false,
  retiringBeforeAge65: false,
  livingAbroadPlanned: false,
  liquidityEventExpected: false,
  realEstateHeavy: false,
  additionalContext: '',

  // Frequency toggles (Annual/Monthly display preference)
  incomeFrequency: 'annual',      // householdIncome stored as annual
  expenseFrequency: 'monthly',    // expense fields stored as monthly
  retirementFrequency: 'annual',  // retirementSpending stored as annual
};

// Keys used to detect Section 3 completion
const ASSET_BALANCE_KEYS = [
  'balance401k', 'balanceTraditionalIRA', 'balanceRothIRA', 'balanceHSA',
  'balanceStocks', 'balanceBrokerage', 'balance529', 'equityPrimaryHome',
  'equityRental', 'equityBusiness', 'cashMoneyMarket', 'crypto', 'pensionMonthlyIncome',
];

function loadFromStorage() {
  try {
    const raw = localStorage.getItem('nirvana_intake');
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

// ─────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────

/** Format a digit-only string with thousands commas, locale-independent. */
function formatCommas(raw) {
  if (raw === '' || raw == null) return '';
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (!digits) return '';
  return parseInt(digits, 10).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtCurrency(n) {
  return '$' + Math.round(n).toLocaleString();
}

// ─────────────────────────────────────────────────────────────
// Frequency conversion helpers
// Income & retirement spending stored as annual integers.
// Expense fields stored as monthly integers.
// All helpers normalise to whole-number strings.
// ─────────────────────────────────────────────────────────────
function annualToDisplay(storedAnnual, freq) {
  if (storedAnnual === '') return '';
  const n = parseFloat(storedAnnual) || 0;
  return freq === 'monthly' ? String(Math.round(n / 12)) : String(Math.round(n));
}
function displayToAnnual(inputVal, freq) {
  if (inputVal === '') return '';
  const n = parseFloat(inputVal) || 0;
  return freq === 'monthly' ? String(Math.round(n * 12)) : String(Math.round(n));
}
function monthlyToDisplay(storedMonthly, freq) {
  if (storedMonthly === '') return '';
  const n = parseFloat(storedMonthly) || 0;
  return freq === 'annual' ? String(Math.round(n * 12)) : String(Math.round(n));
}
function displayToMonthly(inputVal, freq) {
  if (inputVal === '') return '';
  const n = parseFloat(inputVal) || 0;
  return freq === 'annual' ? String(Math.round(n / 12)) : String(Math.round(n));
}

// ─────────────────────────────────────────────────────────────
// Shared style constants
// ─────────────────────────────────────────────────────────────
const inputClass =
  'w-full bg-[#0F172A] border border-[#334155] rounded-lg px-3 py-2.5 text-white ' +
  'placeholder-slate-500 focus:outline-none focus:border-[#F59E0B] focus:ring-1 ' +
  'focus:ring-[#F59E0B] transition-colors text-sm';

const labelClass = 'block text-sm font-medium text-slate-300 mb-1.5';

// ─────────────────────────────────────────────────────────────
// Reusable components
// ─────────────────────────────────────────────────────────────
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

function SubHeader({ title, right }) {
  return (
    <div className="flex items-center justify-between pb-2 border-b border-[#334155]">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      {right}
    </div>
  );
}

function AssetGroupHeader({ title }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 pb-2 border-b border-[#334155]">
      {title}
    </p>
  );
}

function FrequencyToggle({ value, onChange, options = ['Annual', 'Monthly'] }) {
  return (
    <div className="flex rounded-md overflow-hidden border border-[#334155]">
      {options.map(opt => {
        const v = opt.toLowerCase();
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={
              'px-2.5 py-1 text-xs font-medium transition-colors ' +
              (active
                ? 'bg-[#334155] text-white'
                : 'bg-transparent text-slate-500 hover:text-slate-300')
            }
          >
            {opt}
          </button>
        );
      })}
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

/**
 * Plain dollar input for fields with no frequency conversion (asset balances).
 * Shows commas when not focused; shows raw digits when focused for easy editing.
 */
function DollarInput({ value, onChange, placeholder = '0' }) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm select-none">$</span>
      <input
        type="text"
        inputMode="numeric"
        value={isFocused ? value : formatCommas(value)}
        onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        className={`${inputClass} pl-7`}
      />
    </div>
  );
}

/**
 * Dollar input for frequency-converted fields (income, expenses, retirement spending).
 *
 * Converts between storage frequency (always annual or monthly) and the user's
 * chosen display frequency ONLY on blur, not on every keystroke. This avoids
 * the "locked at 0" bug caused by lossy rounding of intermediate typed values.
 *
 * Comma formatting: shows commas when idle, strips them on focus so the user
 * can edit raw digits freely.
 */
function FreqField({ storedValue, freqKey, toDisplay, toStore, onChange, placeholder = '0' }) {
  const [text, setText] = useState(() => formatCommas(toDisplay(storedValue)));
  const isFocusedRef = useRef(false);
  const toDisplayRef = useRef(toDisplay);
  toDisplayRef.current = toDisplay;

  // Sync display when frequency changes or stored value changes externally.
  // storedValue does NOT change while the user is typing (we defer onChange
  // to onBlur), so this effect never clobbers mid-type input.
  useEffect(() => {
    if (!isFocusedRef.current) {
      setText(formatCommas(toDisplayRef.current(storedValue)));
    }
  }, [freqKey, storedValue]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm select-none">$</span>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        placeholder={placeholder}
        onChange={e => setText(e.target.value.replace(/[^0-9]/g, ''))}
        onFocus={() => {
          isFocusedRef.current = true;
          setText(t => t.replace(/,/g, '')); // strip commas for easy editing
        }}
        onBlur={() => {
          isFocusedRef.current = false;
          const raw    = text.replace(/,/g, '');
          const stored = toStore(raw);
          onChange(stored);
          setText(formatCommas(toDisplayRef.current(stored)));
        }}
        className={`${inputClass} pl-7`}
      />
    </div>
  );
}

/**
 * A label + optional sub-label + dollar input, rendered as a single div
 * so it works as a single grid cell in both 1-column and 2-column layouts.
 */
function AssetRow({ label, subLabel, value, onChange, optional, placeholder }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-1.5 text-sm text-slate-300">
        <span>{label}</span>
        {optional && <span className="text-slate-500 text-xs">(optional)</span>}
      </div>
      {subLabel && <p className="text-xs text-slate-500 leading-snug">{subLabel}</p>}
      <DollarInput value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}

const ADDITIONAL_FACTORS = [
  {
    key: 'hasConcentratedStock',
    title: 'Concentrated Position',
    desc: 'I hold 30%+ of my portfolio in 1–3 individual stocks',
  },
  {
    key: 'retiringBeforeAge65',
    title: 'Early Retirement',
    desc: 'I plan to retire before Medicare eligibility at 65',
  },
  {
    key: 'livingAbroadPlanned',
    title: 'Living Abroad',
    desc: 'I plan to spend significant time outside the US in retirement',
  },
  {
    key: 'liquidityEventExpected',
    title: 'Liquidity Event',
    desc: 'Business sale, large RSU vest, or inheritance expected within 3 years',
  },
  {
    key: 'realEstateHeavy',
    title: 'Real Estate Heavy',
    desc: 'More than 35% of my net worth is in real estate',
  },
];

const EXPENSE_KEYS = [
  'expenseHousing', 'expenseChildcare', 'expenseHealthcare',
  'expenseFood', 'expenseTransportation', 'expenseTravel', 'expenseOther',
];

const EXPENSE_LABELS = {
  expenseHousing:       'Housing (mortgage / rent)',
  expenseChildcare:     'Childcare / education',
  expenseHealthcare:    'Healthcare / insurance',
  expenseFood:          'Food & dining',
  expenseTransportation:'Transportation',
  expenseTravel:        'Travel & leisure',
  expenseOther:         'Everything else',
};

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function IntakeForm() {
  const [form, setForm] = useState(loadFromStorage);
  const navigate = useNavigate();
  const prevSuggestedRef = useRef(null);

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

  // Expense totals (stored values are always monthly)
  const totalMonthly = EXPENSE_KEYS.reduce(
    (sum, k) => sum + (parseFloat(form[k]) || 0), 0
  );
  const annualExpenses     = totalMonthly * 12;
  const suggestedRetirement = Math.round(annualExpenses * 0.85);

  // Auto-fill retirement spending at 85% of expenses when breakdown is used
  useEffect(() => {
    if (!form.showExpenseBreakdown || totalMonthly === 0) return;
    const currentVal = parseFloat(form.retirementSpending) || 0;
    const prev = prevSuggestedRef.current;
    if (!form.retirementSpending || currentVal === prev) {
      prevSuggestedRef.current = suggestedRetirement;
      setForm(f => ({ ...f, retirementSpending: String(suggestedRetirement) }));
    }
  }, [suggestedRetirement, form.showExpenseBreakdown]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const userAge   = parseFloat(form.userAge)  || 0;
    const retireAge = parseFloat(form.retirementAgeUser) || 0;
    const retiringSoon = retireAge > 0 && userAge > 0 && (retireAge - userAge) <= 1.5;

    const dataToSave = { ...form, retiringWithin18Months: retiringSoon };
    localStorage.setItem('nirvana_intake', JSON.stringify(dataToSave));
    localStorage.setItem('nirvana_retiring_soon', JSON.stringify(retiringSoon));
    if (form.additionalContext) {
      localStorage.setItem('nirvana_additional_context', form.additionalContext);
    }
    navigate('/outlook');
  }

  // Progress indicator
  const progress = [
    {
      label: 'Household',
      done: !!(form.userAge && form.retirementAgeUser && form.state),
    },
    {
      label: 'Income & Spending',
      done: !!(form.householdIncome && form.retirementSpending),
    },
    {
      label: 'Assets',
      done: ASSET_BALANCE_KEYS.filter(k => parseFloat(form[k]) > 0).length >= 3,
    },
    {
      label: 'Additional Factors',
      done: ADDITIONAL_FACTORS.some(f => form[f.key]) || form.additionalContext.trim().length > 0,
    },
  ];
  const completedSections = progress.filter(p => p.done).length;

  const numChildren          = Number(form.numChildren);
  const showPartnerRetirement = form.hasPartner && form.partnerAge !== '';
  const expenseAutoFilled     =
    form.showExpenseBreakdown &&
    totalMonthly > 0 &&
    parseFloat(form.retirementSpending) === suggestedRetirement;

  return (
    <div className="max-w-3xl mx-auto space-y-8">

      {/* ── Profile summary card (visible when saved data exists) ── */}
      {form.userAge && (
        <div className="bg-[#1E293B] border border-[#F59E0B]/30 rounded-xl px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          <span className="text-base select-none">👨‍👩‍👧</span>
          <span className="text-slate-300">
            <span className="text-white font-semibold">Age {form.userAge}</span>
            {form.state ? <span> · {form.state}</span> : null}
            {numChildren > 0
              ? <span> · {numChildren} child{numChildren !== 1 ? 'ren' : ''}</span>
              : <span> · No children</span>
            }
            {form.retirementAgeUser
              ? <span> · Retiring in {Math.max(0, Number(form.retirementAgeUser) - Number(form.userAge))} years</span>
              : null
            }
          </span>
          <span className="ml-auto text-xs text-slate-500 italic">Your saved profile ✓</span>
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="pt-2">
        <h1 className="text-3xl font-bold text-white leading-tight mb-3">
          Understand your retirement picture before your advisor does.
        </h1>
        <p className="text-slate-400 text-base leading-relaxed">
          Answer a few questions about your financial situation. Nirvana projects your asset
          growth, identifies risks specific to your household, and tells you exactly what to ask
          your advisor.
        </p>
      </div>

      {/* ── Progress indicator ───────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs text-slate-500">
          {completedSections} of 4 sections complete
          {completedSections === 4 && (
            <span className="ml-2 text-[#F59E0B] font-medium">— ready to analyze</span>
          )}
        </p>
        <div className="flex gap-1.5">
          {progress.map(step => (
            <div key={step.label} className="flex-1">
              <div
                title={step.label}
                className={`h-1.5 rounded-full transition-colors duration-300 ${
                  step.done ? 'bg-[#F59E0B]' : 'bg-[#334155]'
                }`}
              />
              <p className={`text-xs mt-1 text-center hidden sm:block truncate ${
                step.done ? 'text-slate-400' : 'text-slate-600'
              }`}>
                {step.done ? '✓ ' : ''}{step.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 1: Household ─────────────────────────────── */}
      <section className="bg-[#1E293B] rounded-2xl p-6 sm:p-8 border border-[#334155]">
        <SectionHeader number="1" title="Household" />

        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Your age</label>
              <input
                type="number" min="18" max="99"
                value={form.userAge}
                onChange={e => set('userAge', e.target.value)}
                placeholder="e.g. 45"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Target retirement age — you</label>
              <input
                type="number" min="40" max="80"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pl-5 border-l-2 border-[#F59E0B]/30">
              <div>
                <label className={labelClass}>Partner's age</label>
                <input
                  type="number" min="18" max="99"
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
                    type="number" min="40" max="80"
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
            <select value={form.state} onChange={e => set('state', e.target.value)} className={inputClass}>
              <option value="">Select a state…</option>
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Number of children</label>
            <div className="flex gap-2 flex-wrap">
              {[0, 1, 2, 3, 4, 5, 6].map(n => (
                <button
                  key={n} type="button"
                  onClick={() => set('numChildren', n)}
                  className={
                    'w-10 h-10 rounded-lg text-sm font-semibold transition-colors ' +
                    (Number(form.numChildren) === n
                      ? 'bg-[#F59E0B] text-[#0F172A]'
                      : 'bg-[#0F172A] text-slate-300 border border-[#334155] hover:border-[#475569]')
                  }
                >{n}</button>
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
                      type="number" min="0" max="25"
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
      <section className="bg-[#1E293B] rounded-2xl p-6 sm:p-8 border border-[#334155]">
        <SectionHeader number="2" title="Income & Spending" />

        <div className="space-y-6">

          {/* Current Income */}
          <div className="space-y-4">
            <SubHeader
              title="Current Income"
              right={
                <FrequencyToggle
                  value={form.incomeFrequency}
                  onChange={v => set('incomeFrequency', v)}
                />
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>
                  {form.incomeFrequency === 'monthly' ? 'Monthly' : 'Annual'} household income{' '}
                  <span className="text-slate-500 font-normal">(pre-tax)</span>
                </label>
                <FreqField
                  storedValue={form.householdIncome}
                  freqKey={form.incomeFrequency}
                  toDisplay={v => annualToDisplay(v, form.incomeFrequency)}
                  toStore={v => displayToAnnual(v, form.incomeFrequency)}
                  onChange={v => set('householdIncome', v)}
                  placeholder={form.incomeFrequency === 'monthly' ? 'e.g. 20,833' : 'e.g. 250,000'}
                />
              </div>
              <div>
                <label className={labelClass}>Income type</label>
                <select
                  value={form.incomeType}
                  onChange={e => set('incomeType', e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select…</option>
                  <option value="salary_w2">Salary / W2</option>
                  <option value="self_employed">Self-employed</option>
                  <option value="mix">Mix of both</option>
                </select>
              </div>
            </div>

            {form.hasPartner && (
              <div className="flex items-center gap-3">
                <Toggle
                  checked={form.partnerIncomeIncluded}
                  onChange={v => set('partnerIncomeIncluded', v)}
                />
                <span className="text-slate-300 text-sm">Partner income included in total above</span>
              </div>
            )}
          </div>

          {/* Expense Breakdown */}
          <div className="space-y-4">
            <SubHeader
              title={`Current ${form.expenseFrequency === 'annual' ? 'Annual' : 'Monthly'} Expenses`}
              right={
                <div className="flex items-center gap-3">
                  <Toggle
                    checked={form.showExpenseBreakdown}
                    onChange={v => set('showExpenseBreakdown', v)}
                  />
                  <span className="text-slate-400 text-xs">
                    Break down my expenses <span className="text-slate-600">(optional)</span>
                  </span>
                </div>
              }
            />

            {form.showExpenseBreakdown && (
              <div className="pl-5 border-l-2 border-[#F59E0B]/30 space-y-3">
                <div className="flex justify-end">
                  <FrequencyToggle
                    value={form.expenseFrequency}
                    onChange={v => set('expenseFrequency', v)}
                    options={['Monthly', 'Annual']}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                  {EXPENSE_KEYS.map(key => (
                    <div key={key}>
                      <label className="text-xs text-slate-400 mb-1.5 block">{EXPENSE_LABELS[key]}</label>
                      <FreqField
                        storedValue={form[key]}
                        freqKey={form.expenseFrequency}
                        toDisplay={v => monthlyToDisplay(v, form.expenseFrequency)}
                        toStore={v => displayToMonthly(v, form.expenseFrequency)}
                        onChange={v => set(key, v)}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
                {totalMonthly > 0 && (
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#334155]">
                    {form.expenseFrequency === 'monthly' ? (
                      <>
                        <span className="text-xs text-slate-500 uppercase tracking-wider">Total monthly</span>
                        <span className="text-white font-semibold">{fmtCurrency(totalMonthly)}</span>
                        <span className="text-slate-600 text-xs">·</span>
                        <span className="text-xs text-slate-500 uppercase tracking-wider">Annual</span>
                        <span className="text-white font-semibold">{fmtCurrency(annualExpenses)}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-slate-500 uppercase tracking-wider">Total annual</span>
                        <span className="text-white font-semibold">{fmtCurrency(annualExpenses)}</span>
                        <span className="text-slate-600 text-xs">·</span>
                        <span className="text-xs text-slate-500 uppercase tracking-wider">Monthly</span>
                        <span className="text-white font-semibold">{fmtCurrency(totalMonthly)}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Retirement Spending */}
          <div className="space-y-3">
            <SubHeader
              title="Retirement Spending"
              right={
                <FrequencyToggle
                  value={form.retirementFrequency}
                  onChange={v => set('retirementFrequency', v)}
                />
              }
            />

            <div>
              <label className={labelClass}>
                Expected {form.retirementFrequency === 'monthly' ? 'monthly' : 'annual'} spending in retirement{' '}
                <span className="text-slate-500 font-normal">(post-tax)</span>
              </label>
              <FreqField
                storedValue={form.retirementSpending}
                freqKey={form.retirementFrequency}
                toDisplay={v => annualToDisplay(v, form.retirementFrequency)}
                toStore={v => displayToAnnual(v, form.retirementFrequency)}
                onChange={v => {
                  prevSuggestedRef.current = null; // user took manual control
                  set('retirementSpending', v);
                }}
                placeholder={form.retirementFrequency === 'monthly' ? 'e.g. 10,000' : 'e.g. 120,000'}
              />
              {expenseAutoFilled && (
                <p className="text-xs text-slate-500 mt-1.5 italic">
                  Pre-filled at 85% of current expenses — a common rule of thumb
                </p>
              )}
            </div>
          </div>

          {/* Healthcare */}
          <div className="space-y-3">
            <SubHeader title="Healthcare" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Coverage today</label>
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
                <label className={labelClass}>Plan in retirement</label>
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

        </div>
      </section>

      {/* ── SECTION 3: Assets ────────────────────────────────── */}
      <section className="bg-[#1E293B] rounded-2xl p-6 sm:p-8 border border-[#334155]">
        <SectionHeader number="3" title="Assets by Account Type" />

        <div className="space-y-7">

          {/* Retirement Accounts */}
          <div>
            <AssetGroupHeader title="Retirement Accounts" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <AssetRow label="401(k) / 403(b)" value={form.balance401k} onChange={v => set('balance401k', v)} placeholder="e.g. 150,000" />
              <AssetRow label="Traditional IRA" value={form.balanceTraditionalIRA} onChange={v => set('balanceTraditionalIRA', v)} placeholder="e.g. 80,000" />
              <AssetRow label="Roth IRA / Roth 401(k)" value={form.balanceRothIRA} onChange={v => set('balanceRothIRA', v)} placeholder="e.g. 60,000" />
              <AssetRow label="HSA" value={form.balanceHSA} onChange={v => set('balanceHSA', v)} />
            </div>
          </div>

          {/* Brokerage & Investments */}
          <div>
            <AssetGroupHeader title="Brokerage & Investments" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <AssetRow
                label="Stocks / Individual Equities"
                subLabel="Individual stock positions (not held in a brokerage account)"
                value={form.balanceStocks}
                onChange={v => set('balanceStocks', v)}
              />
              <AssetRow
                label="Taxable Brokerage"
                subLabel="Mutual funds, ETFs, index funds"
                value={form.balanceBrokerage}
                onChange={v => set('balanceBrokerage', v)}
              />
              <AssetRow label="Crypto" value={form.crypto} onChange={v => set('crypto', v)} optional />
            </div>
          </div>

          {/* Real Estate */}
          <div>
            <AssetGroupHeader title="Real Estate" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <AssetRow label="Primary Home Equity" value={form.equityPrimaryHome} onChange={v => set('equityPrimaryHome', v)} />
              <AssetRow label="Rental Property Equity" value={form.equityRental} onChange={v => set('equityRental', v)} />
            </div>
          </div>

          {/* Other Assets */}
          <div>
            <AssetGroupHeader title="Other Assets" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <AssetRow label="529 Total Balance" value={form.balance529} onChange={v => set('balance529', v)} />
              <AssetRow label="Business / Private Equity" value={form.equityBusiness} onChange={v => set('equityBusiness', v)} />
              <AssetRow label="Cash / Money Market" value={form.cashMoneyMarket} onChange={v => set('cashMoneyMarket', v)} />
              <AssetRow
                label="Pension / Annuity"
                subLabel="Monthly income — not a lump sum"
                value={form.pensionMonthlyIncome}
                onChange={v => set('pensionMonthlyIncome', v)}
              />
            </div>
          </div>

        </div>
      </section>

      {/* ── SECTION 4: Additional Factors ────────────────────── */}
      <section className="bg-[#1E293B] rounded-2xl p-6 sm:p-8 border border-[#334155]">
        <SectionHeader number="4" title="Additional Factors" />
        <p className="text-slate-400 text-sm mb-6 -mt-3">
          These help us identify risks specific to your situation.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ADDITIONAL_FACTORS.map(({ key, title, desc }) => {
            const selected = form[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => set(key, !selected)}
                className={
                  'text-left p-4 rounded-xl border transition-all ' +
                  (selected
                    ? 'border-[#F59E0B] bg-[#F59E0B]/10 ring-1 ring-[#F59E0B]/20'
                    : 'border-[#334155] bg-[#0F172A] hover:border-[#475569]')
                }
              >
                <p className={`text-sm font-semibold mb-1 ${selected ? 'text-[#F59E0B]' : 'text-white'}`}>
                  {title}
                </p>
                <p className="text-xs text-slate-400 leading-snug">{desc}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          <label className={labelClass}>
            Anything else we should know about your situation?
          </label>
          <textarea
            value={form.additionalContext}
            onChange={e => set('additionalContext', e.target.value)}
            placeholder="e.g. I have a pension from a prior employer, or I'm supporting aging parents..."
            rows={3}
            className={`${inputClass} resize-none`}
          />
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
