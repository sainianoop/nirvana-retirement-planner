import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { generateActionPlan } from '../utils/claudeAdvisor';
import { analyzeRisks } from '../utils/riskEngine';
import { hashFormData } from '../utils/projections';
import { buildRetirementPicture } from '../utils/retirementPicture';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const CACHE_KEY         = 'nirvana_action_plan';
const CHECKED_KEY       = 'nirvana_action_plan_checked';
const INTAKE_KEY        = 'nirvana_intake';

const FALLBACK = {
  thirty_days: [
    'Check your 401k contribution rate and increase to IRS maximum ($23,000 for 2025)',
    'Pull your latest Social Security statement at ssa.gov/myaccount',
    'List all accounts and confirm beneficiary designations are current',
  ],
  ninety_days: [
    'Get a fee-only fiduciary advisor quote — search NAPFA.org for local advisors',
    'Model your retirement income from all sources with a spreadsheet or your advisor',
    'Review your insurance coverage — life, disability, and umbrella',
  ],
  this_year: [
    'Max out HSA contributions if you have a high-deductible health plan',
    'Review asset allocation across all accounts — rebalance if target weights have drifted',
    'Explore Roth conversion if you expect lower income this year than in retirement',
  ],
};

const SECTIONS = [
  {
    key: 'thirty_days',
    label: 'Next 30 Days',
    icon: '⚡',
    headerBg:   'bg-red-900/30',
    headerText: 'text-red-300',
    border:     'border-red-700/50',
    badgeBg:    'bg-red-900/50 text-red-300',
    barColor:   'bg-red-500',
  },
  {
    key: 'ninety_days',
    label: 'Next 90 Days',
    icon: '📅',
    headerBg:   'bg-amber-900/30',
    headerText: 'text-amber-300',
    border:     'border-amber-700/50',
    badgeBg:    'bg-amber-900/50 text-amber-300',
    barColor:   'bg-amber-500',
  },
  {
    key: 'this_year',
    label: 'This Year',
    icon: '🎯',
    headerBg:   'bg-green-900/30',
    headerText: 'text-green-300',
    border:     'border-green-700/50',
    badgeBg:    'bg-green-900/50 text-green-300',
    barColor:   'bg-green-500',
  },
];

// ─────────────────────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────────────────────
function loadFormData() {
  try {
    const raw = localStorage.getItem(INTAKE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function loadCachedPlan(hash) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    return cached.hash === hash ? cached.plan : null;
  } catch { return null; }
}

function savePlan(hash, plan) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ hash, plan }));
  } catch {}
}

function loadChecked() {
  try {
    const raw = localStorage.getItem(CHECKED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function persistChecked(set) {
  try {
    localStorage.setItem(CHECKED_KEY, JSON.stringify([...set]));
  } catch {}
}

// ─────────────────────────────────────────────────────────────
// Skeleton loader
// ─────────────────────────────────────────────────────────────
function SkeletonSection({ section }) {
  return (
    <div className={`rounded-xl border ${section.border} overflow-hidden`}>
      <div className={`px-5 py-4 ${section.headerBg} flex items-center gap-2`}>
        <span className="text-xl">{section.icon}</span>
        <span className={`font-bold text-base ${section.headerText}`}>{section.label}</span>
      </div>
      <div className="bg-[#1E293B] p-5 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-5 h-5 rounded border border-slate-600 bg-slate-700 animate-pulse flex-shrink-0" />
            <div
              className="h-3 bg-slate-700 rounded animate-pulse"
              style={{ width: `${60 + i * 12}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Action section
// ─────────────────────────────────────────────────────────────
function ActionSection({ section, items, checked, onToggle }) {
  const completedCount = items.filter((_, i) =>
    checked.has(`${section.key}_${i}`)
  ).length;

  return (
    <div className={`rounded-xl border ${section.border} overflow-hidden`}>
      {/* Header */}
      <div className={`px-5 py-4 ${section.headerBg} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-xl">{section.icon}</span>
          <span className={`font-bold text-base ${section.headerText}`}>
            {section.label}
          </span>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${section.badgeBg}`}>
          {completedCount} of {items.length} completed
        </span>
      </div>

      {/* Items */}
      <div className="bg-[#1E293B] divide-y divide-slate-700/50">
        {items.map((action, i) => {
          const id        = `${section.key}_${i}`;
          const isChecked = checked.has(id);
          return (
            <label
              key={id}
              className="flex items-start gap-4 px-5 py-4 cursor-pointer group hover:bg-[#334155]/30 transition-colors"
            >
              {/* Checkbox */}
              <div className="relative flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isChecked}
                  onChange={() => onToggle(id)}
                />
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    isChecked
                      ? 'bg-[#F59E0B] border-[#F59E0B]'
                      : 'border-slate-500 group-hover:border-slate-400'
                  }`}
                >
                  {isChecked && (
                    <svg className="w-3 h-3 text-[#0F172A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Action text */}
              <span
                className={`text-sm leading-relaxed transition-all ${
                  isChecked
                    ? 'line-through text-slate-500 opacity-60'
                    : 'text-slate-200'
                }`}
              >
                {action}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Retirement Picture — computed locally, no API call
// ─────────────────────────────────────────────────────────────
const PICTURE_SECTIONS = [
  { key: 'household',     title: 'You & Your Household' },
  { key: 'kids',          title: 'Your Kids' },
  { key: 'opportunities', title: 'Opportunities Worth Exploring' },
];

function RetirementPicture({ formData }) {
  const hasChildren = !!formData && Array.isArray(formData.children)
    && formData.children.some(c => parseFloat(c.age) > 0);

  const picture = useMemo(() => buildRetirementPicture(formData), [formData]);

  const [expanded, setExpanded] = useState({ household: true, kids: true, opportunities: true });

  const visibleSections = PICTURE_SECTIONS.filter(s => {
    if (s.key === 'kids' && !hasChildren) return false;
    return (picture[s.key] || []).length > 0;
  });

  if (visibleSections.length === 0) return null;

  return (
    <div className="bg-[#1E293B] rounded-xl border border-[#334155] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-[#0F172A] border-b border-[#334155] flex items-center gap-3">
        <span className="text-[#F59E0B] font-black text-lg leading-none w-6 shrink-0">◆</span>
        <div>
          <h2 className="font-bold text-[#F59E0B] text-base">Your Retirement Picture</h2>
          <p className="text-slate-500 text-xs mt-0.5">What's specifically at stake for your household</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {visibleSections.map(section => {
          const items     = picture[section.key] || [];
          const isExpanded = expanded[section.key];
          return (
            <div key={section.key} className="rounded-lg border border-[#334155] overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(prev => ({ ...prev, [section.key]: !prev[section.key] }))}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#0F172A]/60 hover:bg-[#0F172A]/90 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{section.title}</span>
                  <span className="text-xs text-slate-500 bg-slate-700/60 px-1.5 py-0.5 rounded-full leading-none">
                    {items.length}
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="divide-y divide-[#334155]/50">
                  {items.map((card, i) => (
                    <div
                      key={i}
                      className={`flex gap-3 px-4 py-4 border-l-4 ${card.border} ${card.bg}`}
                    >
                      <span className="text-base mt-0.5 flex-shrink-0">{card.icon}</span>
                      <p className="text-slate-200 text-sm leading-relaxed">{card.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function ActionPlan() {
  const [plan,     setPlan]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [isCalling, setIsCalling] = useState(false); // true while the fetch is in-flight
  const [isError,  setIsError]  = useState(false);
  const [apiError, setApiError] = useState(null);    // raw error message for debug display
  const [checked,  setChecked]  = useState(() => loadChecked());

  // Generate or load cached plan
  useEffect(() => {
    const fd = loadFormData();
    if (!fd) {
      setLoading(false);
      return;
    }

    const hash   = hashFormData(fd);
    const cached = loadCachedPlan(hash);

    if (cached) {
      setPlan(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    setIsCalling(true);
    setIsError(false);
    setApiError(null);

    const risks = analyzeRisks(fd);

    generateActionPlan(fd, risks)
      .then(result => {
        savePlan(hash, result);
        setPlan(result);
        setIsError(false);
        setApiError(null);
      })
      .catch(err => {
        console.error('[ActionPlan] generateActionPlan failed:', err);
        setIsError(true);
        setApiError(err.message || 'Unknown error');
        setPlan(FALLBACK);
      })
      .finally(() => {
        setLoading(false);
        setIsCalling(false);
      });
  }, []);

  // Toggle a checkbox
  function handleToggle(id) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      persistChecked(next);
      return next;
    });
  }

  // ── Empty state (no form data) ────────────────────────────
  const formData = loadFormData();
  if (!formData && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-4xl mb-4">🗓️</div>
        <h2 className="text-2xl font-bold text-white mb-2">Complete your profile first</h2>
        <p className="text-slate-400 max-w-sm mb-6">
          Complete your profile to generate your personalized time-bucketed action plan.
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

  // ── Totals for progress bar ───────────────────────────────
  const allItems = plan
    ? [...plan.thirty_days, ...plan.ninety_days, ...plan.this_year]
    : [];
  const totalCount     = allItems.length;
  const completedCount = SECTIONS.reduce((sum, s) => {
    if (!plan) return sum;
    return sum + plan[s.key].filter((_, i) => checked.has(`${s.key}_${i}`)).length;
  }, 0);
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-white">Action Plan</h1>
        <p className="text-slate-400 text-sm mt-1">
          {loading
            ? isCalling
              ? '⏳ Calling AI — generating your personalized action plan…'
              : 'Loading your action plan…'
            : isError
            ? 'Using suggested starter actions — update your profile for personalized items.'
            : 'AI-generated actions based on your profile and risk flags.'}
        </p>
      </div>

      {/* API error debug box — always visible when an API error occurs */}
      {isError && apiError && (
        <div className="bg-red-950/60 border border-red-700/60 rounded-lg px-4 py-3">
          <p className="text-red-400 text-xs font-bold mb-1 uppercase tracking-wide">
            API Error — showing fallback actions
          </p>
          <p className="text-red-300 text-xs font-mono break-all leading-relaxed">{apiError}</p>
          <p className="text-slate-500 text-xs mt-2">
            Common causes: rate limit exceeded (10 req/hr), missing API key on server, or upstream timeout.
            Check the browser console for full details.
          </p>
        </div>
      )}

      {/* Progress summary */}
      {!loading && plan && (
        <div className="bg-[#1E293B] rounded-xl border border-[#334155] px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-300 font-medium">
              {completedCount} of {totalCount} total actions completed
            </span>
            <span className="text-sm font-bold text-[#F59E0B]">
              {Math.round(progressPct)}%
            </span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#F59E0B] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Your Retirement Picture — computed locally, always visible once formData loads */}
      {formData && <RetirementPicture formData={formData} />}

      {/* Sections */}
      {loading
        ? SECTIONS.map(s => <SkeletonSection key={s.key} section={s} />)
        : plan && SECTIONS.map(s => (
            <ActionSection
              key={s.key}
              section={s}
              items={plan[s.key]}
              checked={checked}
              onToggle={handleToggle}
            />
          ))
      }

      {/* Attribution */}
      {!loading && plan && !isError && (
        <p className="text-xs text-slate-600 text-center pb-2">
          AI-generated — not financial advice. Consult a licensed financial advisor before acting.
        </p>
      )}

      {/* ── Next Step CTA ────────────────────────────────────── */}
      {!loading && plan && !isError && (
        <div className="border-t-2 border-[#F59E0B]/30 bg-[#070C15] rounded-2xl px-6 py-8 flex flex-col items-center gap-3 text-center">
          <h3 className="text-white font-bold text-lg">Take this to your financial advisor</h3>
          <Link
            to="/advisor"
            className="w-full sm:w-auto bg-[#F59E0B] hover:bg-[#D97706] active:bg-[#B45309] text-[#0F172A] font-bold px-10 py-4 rounded-xl text-base transition-colors shadow-lg shadow-amber-900/30 inline-block"
          >
            Generate Advisor Brief →
          </Link>
          <p className="text-slate-500 text-sm">A printable one-page summary with your portfolio, risks, and questions to ask</p>
        </div>
      )}
    </div>
  );
}
