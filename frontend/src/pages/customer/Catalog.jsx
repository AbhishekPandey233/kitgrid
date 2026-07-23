import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axiosClient, { resolveImageUrl } from '../../api/axiosClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import EquipmentThumbnail from '../../components/ui/EquipmentThumbnail';

const DEBOUNCE_MS = 400;
const POLL_MS = 15000;

export default function Catalog() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [equipment, setEquipment] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    function fetchEquipment({ showSpinner }) {
      if (showSpinner) setStatus('loading');
      axiosClient
        .get('/equipment', { params: { status: 'active', q: search || undefined, category: category || undefined, page } })
        .then(({ data }) => {
          if (cancelled) return;
          setEquipment(data.equipment.filter((item) => item.available > 0));
          setPagination(data.pagination);
          setStatus('ready');
        })
        .catch((err) => {
          if (cancelled || !showSpinner) return;
          setError(err.response?.data?.error || 'Failed to load equipment');
          setStatus('error');
        });
    }

    const debounceTimer = setTimeout(() => fetchEquipment({ showSpinner: true }), DEBOUNCE_MS);
    // Availability changes whenever any user books/cancels/returns equipment, so the list is
    // polled in the background to stay current without the user needing to refresh manually.
    const pollTimer = setInterval(() => fetchEquipment({ showSpinner: false }), POLL_MS);

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      clearInterval(pollTimer);
    };
  }, [search, category, page]);

  function handleSearchChange(e) {
    setPage(1);
    setSearch(e.target.value);
  }

  function handleCategoryChange(e) {
    setPage(1);
    setCategory(e.target.value);
  }

  const fieldClass =
    'w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

  return (
    <div>
      <PageHeader title="Equipment catalog" subtitle="Browse what's available and request a booking." />

      <div role="search" className="mb-8 flex flex-wrap gap-4">
        <div>
          <label htmlFor="catalog-search" className="mb-1 block text-xs font-medium text-slate-500">
            Search by name
          </label>
          <input id="catalog-search" type="search" value={search} onChange={handleSearchChange} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="catalog-category" className="mb-1 block text-xs font-medium text-slate-500">
            Category
          </label>
          <input id="catalog-category" value={category} onChange={handleCategoryChange} className={fieldClass} />
        </div>
      </div>

      {status === 'loading' && (
        <div className="flex justify-center">
          <Spinner />
        </div>
      )}
      {status === 'error' && <Alert>{error}</Alert>}

      {status === 'ready' && equipment.length === 0 && (
        <p className="animate-fade-in rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
          No equipment matches your search.
        </p>
      )}

      {status === 'ready' && equipment.length > 0 && (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {equipment.map((item, i) => (
            <li
              key={item._id}
              className="animate-fade-in-up"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <Card
                animate={false}
                className="flex h-full flex-col p-4 transition-shadow duration-200 hover:shadow-lg"
              >
                <EquipmentThumbnail src={resolveImageUrl(item.photos?.[0])} alt={`Photo of ${item.name}`} />

                <div className="mt-4 flex flex-1 flex-col">
                  <h2 className="font-semibold text-slate-900">{item.name}</h2>
                  {item.category && <p className="mt-0.5 text-xs font-medium text-indigo-600">{item.category}</p>}
                  {item.description && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{item.description}</p>}

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">{item.available} available</span>
                  </div>

                  <Link to={`/bookings/new/${item._id}`} className="mt-4">
                    <Button className="w-full">Book this item</Button>
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {pagination && pagination.pages > 1 && (
        <nav aria-label="Catalog pagination" className="mt-8 flex items-center justify-center gap-3">
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
