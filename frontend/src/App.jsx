import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import AdminRoute from './routes/AdminRoute';
import Spinner from './components/ui/Spinner';

import Landing from './pages/Landing';
import Login from './pages/customer/Login';
import Register from './pages/customer/Register';
import ForgotPassword from './pages/customer/ForgotPassword';
import ResetPassword from './pages/customer/ResetPassword';
import Catalog from './pages/customer/Catalog';
import MyBookings from './pages/customer/MyBookings';
import BookingForm from './pages/customer/BookingForm';
import Profile from './pages/customer/Profile';
import MfaSetup from './pages/customer/MfaSetup';

import Dashboard from './pages/admin/Dashboard';
import BookingApprovals from './pages/admin/BookingApprovals';
import EquipmentManager from './pages/admin/EquipmentManager';
import AuditLogViewer from './pages/admin/AuditLogViewer';

function navLinkClass({ isActive }) {
  return `rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
    isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;
}

function Nav() {
  const { user } = useAuth();
  return (
    <nav className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="text-lg font-extrabold tracking-tight text-slate-900">
          Kit<span className="text-indigo-600">Grid</span>
        </Link>

        {user ? (
          <div className="flex flex-wrap items-center gap-1">
            <NavLink to="/catalog" className={navLinkClass}>
              Catalog
            </NavLink>
            <NavLink to="/bookings" className={navLinkClass}>
              My Bookings
            </NavLink>
            <NavLink to="/profile" className={navLinkClass}>
              Profile
            </NavLink>
            {user.role === 'admin' && (
              <>
                <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />
                <NavLink to="/admin" end className={navLinkClass}>
                  Dashboard
                </NavLink>
                <NavLink to="/admin/bookings" className={navLinkClass}>
                  Approvals
                </NavLink>
                <NavLink to="/admin/equipment" className={navLinkClass}>
                  Equipment
                </NavLink>
                <NavLink to="/admin/audit-logs" className={navLinkClass}>
                  Audit Log
                </NavLink>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <NavLink to="/login" className={navLinkClass}>
              Log in
            </NavLink>
            <NavLink to="/register" className={navLinkClass}>
              Register
            </NavLink>
          </div>
        )}
      </div>
    </nav>
  );
}

function OAuthCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    navigate(user ? '/catalog' : '/login?oauth=error', { replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="flex justify-center">
      <Spinner label="Signing you in…" />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />
      <Route path="/oauth/callback" element={<OAuthCallback />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/bookings" element={<MyBookings />} />
        <Route path="/bookings/new/:equipmentId" element={<BookingForm />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/mfa-setup" element={<MfaSetup />} />
      </Route>

      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<Dashboard />} />
        <Route path="/admin/bookings" element={<BookingApprovals />} />
        <Route path="/admin/equipment" element={<EquipmentManager />} />
        <Route path="/admin/audit-logs" element={<AuditLogViewer />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AppShell() {
  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-indigo-700 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        Skip to main content
      </a>
      <Nav />
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <AppRoutes />
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/*" element={<AppShell />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
