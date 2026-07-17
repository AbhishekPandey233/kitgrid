import { useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient';

function formatDateTime(iso) {
  return new Date(iso).toLocaleString();
}

const DEBOUNCE_MS = 400;

export default function AuditLogViewer() {
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const timer = setTimeout(() => {
      axiosClient
        .get('/admin/audit-logs', {
          params: { action: action || undefined, from: from || undefined, to: to || undefined, page },
        })
        .then(({ data }) => {
          if (cancelled) return;
          setLogs(data.auditLogs);
          setPagination(data.pagination);
          setStatus('ready');
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err.response?.data?.error || 'Failed to load audit logs');
          setStatus('error');
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [action, from, to, page]);

  function handleFilterChange(setter) {
    return (e) => {
      setPage(1);
      setter(e.target.value);
    };
  }

  return (
    <div>
      <h1>Audit log</h1>

      <div role="search">
        <div>
          <label htmlFor="audit-action">Action</label>
          <input
            id="audit-action"
            value={action}
            onChange={handleFilterChange(setAction)}
            placeholder="e.g. auth.login_success"
          />
        </div>
        <div>
          <label htmlFor="audit-from">From</label>
          <input id="audit-from" type="date" value={from} onChange={handleFilterChange(setFrom)} />
        </div>
        <div>
          <label htmlFor="audit-to">To</label>
          <input id="audit-to" type="date" value={to} onChange={handleFilterChange(setTo)} />
        </div>
      </div>

      {status === 'loading' && <p>Loading…</p>}
      {status === 'error' && <p role="alert">{error}</p>}

      {status === 'ready' && logs.length === 0 && <p>No matching audit log entries.</p>}

      {status === 'ready' && logs.length > 0 && (
        <table>
          <caption className="sr-only">Audit log entries</caption>
          <thead>
            <tr>
              <th scope="col">Timestamp</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Resource</th>
              <th scope="col">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log._id}>
                <td>{formatDateTime(log.timestamp)}</td>
                <td>{log.actorId ? `${log.actorId.name} (${log.actorId.email})` : 'System'}</td>
                <td>{log.action}</td>
                <td>
                  {log.resourceType}
                  {log.resourceId ? ` #${log.resourceId}` : ''}
                </td>
                <td>{log.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pagination && pagination.pages > 1 && (
        <nav aria-label="Audit log pagination">
          <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
            Previous
          </button>
          <span>
            {' '}
            Page {pagination.page} of {pagination.pages}{' '}
          </span>
          <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.pages}>
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
