import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';

function formatDateTime(iso) {
  return new Date(iso).toLocaleString();
}

function StatTile({ to, value, label, accent }) {
  return (
    <Link to={to} className="block animate-fade-in-up">
      <Card animate={false} className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${accent.bg}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${accent.dot}`} />
        </div>
        <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const [pendingCount, setPendingCount] = useState(null);
  const [activeCount, setActiveCount] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    Promise.all([
      axiosClient.get('/admin/bookings', { params: { status: 'pending', limit: 1 } }),
      axiosClient.get('/admin/bookings', { params: { status: 'active', limit: 1 } }),
      axiosClient.get('/admin/alerts', { params: { resolved: 'false', limit: 5 } }),
    ])
      .then(([pendingRes, activeRes, alertsRes]) => {
        if (cancelled) return;
        setPendingCount(pendingRes.data.pagination.total);
        setActiveCount(activeRes.data.pagination.total);
        setAlerts(alertsRes.data.alerts);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.response?.data?.error || 'Failed to load dashboard');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex justify-center">
        <Spinner />
      </div>
    );
  }

  if (status === 'error') {
    return <Alert>{error}</Alert>;
  }

  return (
    <div>
      <PageHeader title="Admin dashboard" subtitle="A quick look at what needs your attention." />

      <section aria-label="Summary counts" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile
          to="/admin/bookings"
          value={pendingCount}
          label={`Pending booking${pendingCount === 1 ? '' : 's'}`}
          accent={{ bg: 'bg-amber-100', dot: 'bg-amber-500' }}
        />
        <StatTile
          to="/admin/bookings"
          value={activeCount}
          label={`Active booking${activeCount === 1 ? '' : 's'}`}
          accent={{ bg: 'bg-emerald-100', dot: 'bg-emerald-500' }}
        />
      </section>

      <section className="mt-8 animate-fade-in-up">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Recent alerts</h2>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white py-8 text-center text-sm text-slate-500">
            No unresolved alerts.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {alerts.map((alert) => (
              <div key={alert._id} className="p-4">
                <p className="text-sm font-medium text-slate-800">
                  {alert.type} <span className="font-normal text-slate-400">from {alert.ip}</span>
                </p>
                {alert.details && <p className="mt-0.5 text-sm text-slate-500">{alert.details}</p>}
                <p className="mt-1 text-xs text-slate-400">{formatDateTime(alert.timestamp)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
