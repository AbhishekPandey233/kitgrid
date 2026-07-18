import { useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';

function formatDateTime(iso) {
  return new Date(iso).toLocaleString();
}

const DEBOUNCE_MS = 400;

const filterInputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ' +
  'placeholder:text-slate-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

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
      <PageHeader title="Audit log" subtitle="Every sensitive action in the system, searchable." />

      <div role="search" className="mb-6 flex flex-wrap gap-4">
        <div className="min-w-48">
          <label htmlFor="audit-action" className="mb-1 block text-xs font-medium text-slate-500">
            Action
          </label>
          <input
            id="audit-action"
            value={action}
            onChange={handleFilterChange(setAction)}
            placeholder="e.g. auth.login_success"
            className={filterInputClass}
          />
        </div>
        <div>
          <label htmlFor="audit-from" className="mb-1 block text-xs font-medium text-slate-500">
            From
          </label>
          <input id="audit-from" type="date" value={from} onChange={handleFilterChange(setFrom)} className={filterInputClass} />
        </div>
        <div>
          <label htmlFor="audit-to" className="mb-1 block text-xs font-medium text-slate-500">
            To
          </label>
          <input id="audit-to" type="date" value={to} onChange={handleFilterChange(setTo)} className={filterInputClass} />
        </div>
      </div>

      {status === 'loading' && (
        <div className="flex justify-center">
          <Spinner />
        </div>
      )}
      {status === 'error' && <Alert>{error}</Alert>}

      {status === 'ready' && logs.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
          No matching audit log entries.
        </p>
      )}

      {status === 'ready' && logs.length > 0 && (
        <div className="animate-fade-in-up overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <caption className="sr-only">Audit log entries</caption>
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Timestamp</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Actor</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Action</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Resource</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log._id} className="transition-colors hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDateTime(log.timestamp)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {log.actorId ? `${log.actorId.name} (${log.actorId.email})` : 'System'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{log.action}</code>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {log.resourceType}
                      {log.resourceId ? ` #${log.resourceId}` : ''}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{log.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <nav aria-label="Audit log pagination" className="mt-6 flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
            Previous
          </Button>
          <span className="text-sm text-slate-500">
            Page {pagination.page} of {pagination.pages}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.pages}>
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
