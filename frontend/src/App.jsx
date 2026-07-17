import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import AdminRoute from './routes/AdminRoute';

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

function Nav() {
  const { user } = useAuth();
  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        KitGrid
      </Link>

      {user ? (
        <div className="navbar-links">
          <NavLink to="/" end>
            Catalog
          </NavLink>
          <NavLink to="/bookings">My Bookings</NavLink>
          <NavLink to="/profile">Profile</NavLink>
          {user.role === 'admin' && (
            <>
              <span className="navbar-divider" aria-hidden="true" />
              <NavLink to="/admin" end>
                Dashboard
              </NavLink>
              <NavLink to="/admin/bookings">Approvals</NavLink>
              <NavLink to="/admin/equipment">Equipment</NavLink>
              <NavLink to="/admin/audit-logs">Audit Log</NavLink>
            </>
          )}
        </div>
      ) : (
        <div className="navbar-links">
          <NavLink to="/login">Log in</NavLink>
          <NavLink to="/register">Register</NavLink>
        </div>
      )}
    </nav>
  );
}

function OAuthCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    navigate(user ? '/' : '/login?oauth=error', { replace: true });
  }, [user, loading, navigate]);

  return <p>Signing you in…</p>;
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
        <Route path="/" element={<Catalog />} />
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

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Nav />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
