import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';

function formatDateTime(iso) {
  return new Date(iso).toLocaleString();
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
    return <p>Loading…</p>;
  }

  if (status === 'error') {
    return <p role="alert">{error}</p>;
  }

  return (
    <div>
      <h1>Admin dashboard</h1>

      <section aria-label="Summary counts">
        <ul>
          <li>
            <Link to="/admin/bookings">
              <strong>{pendingCount}</strong> pending booking{pendingCount === 1 ? '' : 's'}
            </Link>
          </li>
          <li>
            <Link to="/admin/bookings">
              <strong>{activeCount}</strong> active booking{activeCount === 1 ? '' : 's'}
            </Link>
          </li>
        </ul>
      </section>

      <section>
        <h2>Recent alerts</h2>
        {alerts.length === 0 && <p>No unresolved alerts.</p>}
        {alerts.length > 0 && (
          <ul>
            {alerts.map((alert) => (
              <li key={alert._id}>
                <p>
                  <strong>{alert.type}</strong> from {alert.ip}
                </p>
                {alert.details && <p>{alert.details}</p>}
                <p>{formatDateTime(alert.timestamp)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
