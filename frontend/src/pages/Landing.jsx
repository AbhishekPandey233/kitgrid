import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import smoothScrollTo from '../utils/smoothScrollTo';

function handleAnchorClick(e, id) {
  e.preventDefault();
  smoothScrollTo(id);
}

const FEATURES = [
  {
    title: 'Browse & search',
    description: 'Find available equipment by name or category, with live results as you type.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
    ),
  },
  {
    title: 'Instant requests',
    description: 'Pick a time window and quantity, and send a booking request in seconds.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
      />
    ),
  },
  {
    title: 'Admin approvals',
    description: 'A clear pipeline — pending, approved, picked up, returned — so nothing gets overbooked.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
  },
  {
    title: 'Full audit trail',
    description: 'Every login, approval, and change is logged — searchable, exportable, accountable.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75M3.75 6.75h16.5M4.5 3.75h15a.75.75 0 01.75.75v15a.75.75 0 01-.75.75h-15a.75.75 0 01-.75-.75v-15a.75.75 0 01.75-.75z"
      />
    ),
  },
];

const STEPS = [
  { title: 'Browse the catalog', description: 'Search available equipment and check what’s in stock.' },
  { title: 'Request a booking', description: 'Choose your dates and quantity, and submit a request.' },
  { title: 'Pick up & return', description: 'An admin approves it, you pick it up, and mark it returned when done.' },
];

function LandingNav() {
  const { user } = useAuth();
  return (
    <nav className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <span className="text-lg font-extrabold tracking-tight text-slate-900">
          Kit<span className="text-indigo-600">Grid</span>
        </span>

        <div className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          <a href="#features" onClick={(e) => handleAnchorClick(e, 'features')} className="transition-colors hover:text-slate-900">
            Features
          </a>
          <a href="#how-it-works" onClick={(e) => handleAnchorClick(e, 'how-it-works')} className="transition-colors hover:text-slate-900">
            How it works
          </a>
          <a href="#about" onClick={(e) => handleAnchorClick(e, 'about')} className="transition-colors hover:text-slate-900">
            About
          </a>
          <a href="#contact" onClick={(e) => handleAnchorClick(e, 'contact')} className="transition-colors hover:text-slate-900">
            Contact
          </a>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <Link to="/catalog">
              <Button size="sm">Go to catalog</Button>
            </Link>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">Log in</Button>
              </Link>
              <Link to="/register">
                <Button size="sm">Get started</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-indigo-700 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        Skip to main content
      </a>
      <LandingNav />

      <section id="main-content" className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_theme(colors.indigo.100),_transparent_55%)]"
          aria-hidden="true"
        />
        <div className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6 lg:px-8">
          <span className="animate-fade-in-up inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            Equipment booking, done right
          </span>
          <h1
            className="mt-6 animate-fade-in-up text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl"
            style={{ animationDelay: '60ms' }}
          >
            Book the gear you need.
            <br />
            Track it end to end.
          </h1>
          <p className="mx-auto mt-5 max-w-xl animate-fade-in-up text-lg text-slate-600" style={{ animationDelay: '120ms' }}>
            KitGrid is a secure equipment booking platform for teams that share physical gear —
            request it, get it approved, and never worry about double-booking again.
          </p>
          <div className="mt-8 flex animate-fade-in-up flex-wrap items-center justify-center gap-3" style={{ animationDelay: '180ms' }}>
            {user ? (
              <Link to="/catalog">
                <Button size="lg">Go to catalog</Button>
              </Link>
            ) : (
              <>
                <Link to="/register">
                  <Button size="lg">Get started free</Button>
                </Link>
                <Link to="/login">
                  <Button variant="secondary" size="lg">Log in</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Everything you need to manage shared equipment</h2>
          <p className="mt-3 text-slate-600">From request to return, KitGrid keeps the whole process visible and accountable.</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className="animate-fade-in-up rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow duration-200 hover:shadow-md"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
                  {feature.icon}
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-1.5 text-sm text-slate-500">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="bg-white py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">How it works</h2>
            <p className="mt-3 text-slate-600">Three steps, start to finish.</p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="animate-fade-in-up text-center" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-lg font-bold text-white">
                  {i + 1}
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-1.5 text-sm text-slate-500">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="animate-fade-in-up rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">About KitGrid</h2>
          <p className="mt-4 text-slate-600">
            KitGrid was built to solve a simple but common problem: teams that share physical
            equipment — tools, gear, AV kit — need a reliable way to know what&rsquo;s available, who
            has it, and when it&rsquo;s coming back. Spreadsheets and group chats don&rsquo;t scale, and
            they don&rsquo;t leave an audit trail.
          </p>
          <p className="mt-4 text-slate-600">
            Built with security as a first-class concern, not an afterthought: encrypted
            credentials, multi-factor authentication, passkey support, session management, and a
            complete audit log of every sensitive action in the system.
          </p>
        </div>
      </section>

      <section id="contact" className="bg-white py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="animate-fade-in-up text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Get in touch</h2>
          <p className="mt-3 animate-fade-in-up text-slate-600" style={{ animationDelay: '60ms' }}>
            Questions, feedback, or an issue with a booking? We&rsquo;re happy to help.
          </p>
          <a
            href="mailto:support@kitgrid.example"
            className="mt-8 inline-flex animate-fade-in-up items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-indigo-500 hover:shadow-md active:scale-[0.98]"
            style={{ animationDelay: '120ms' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
              />
            </svg>
            support@kitgrid.example
          </a>
        </div>
      </section>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6 lg:px-8">
          <span className="font-semibold text-slate-700">
            Kit<span className="text-indigo-600">Grid</span>
          </span>
          <div className="flex gap-6">
            <a href="#features" onClick={(e) => handleAnchorClick(e, 'features')} className="hover:text-slate-700">
              Features
            </a>
            <a href="#about" onClick={(e) => handleAnchorClick(e, 'about')} className="hover:text-slate-700">
              About
            </a>
            <a href="#contact" onClick={(e) => handleAnchorClick(e, 'contact')} className="hover:text-slate-700">
              Contact
            </a>
          </div>
          <span>© {new Date().getFullYear()} KitGrid</span>
        </div>
      </footer>
    </div>
  );
}
