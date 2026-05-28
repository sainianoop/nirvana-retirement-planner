import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import IntakeForm from './components/IntakeForm';
import AssetOutlook from './components/AssetOutlook';
import ActionPlan from './components/ActionPlan';
import AdvisorBrief from './components/AdvisorBrief';

const tabs = [
  { label: 'Your Profile',  path: '/' },
  { label: 'Asset Outlook', path: '/outlook' },
  { label: 'Action Plan',   path: '/actions' },
  { label: 'Advisor Brief', path: '/advisor' },
];

function Nav() {
  return (
    <nav className="bg-[#1E293B] border-b border-[#334155]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center gap-1 h-14 overflow-x-auto">
        <span className="text-[#F59E0B] font-bold text-lg tracking-wide mr-4 sm:mr-6 flex-shrink-0">
          Nirvana
        </span>
        {tabs.map(({ label, path }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `px-3 sm:px-4 py-2 rounded text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ` +
              (isActive
                ? 'bg-[#F59E0B] text-[#0F172A]'
                : 'text-slate-300 hover:text-white hover:bg-[#334155]')
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#0F172A] text-white">
        <Nav />
        <main className="max-w-5xl mx-auto px-6 py-10">
          <Routes>
            <Route path="/"        element={<IntakeForm />} />
            <Route path="/outlook" element={<AssetOutlook />} />
            <Route path="/actions" element={<ActionPlan />} />
            <Route path="/advisor" element={<AdvisorBrief />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
