import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';

const DEBOUNCE_MS = 400;

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
    setStatus('loading');
    const timer = setTimeout(() => {
      axiosClient
        .get('/equipment', { params: { status: 'active', q: search || undefined, category: category || undefined, page } })
        .then(({ data }) => {
          if (cancelled) return;
          setEquipment(data.equipment);
          setPagination(data.pagination);
          setStatus('ready');
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err.response?.data?.error || 'Failed to load equipment');
          setStatus('error');
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
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

  return (
    <div>
      <h1>Equipment catalog</h1>

      <div role="search">
        <div>
          <label htmlFor="catalog-search">Search by name</label>
          <input id="catalog-search" type="search" value={search} onChange={handleSearchChange} />
        </div>
        <div>
          <label htmlFor="catalog-category">Category</label>
          <input id="catalog-category" value={category} onChange={handleCategoryChange} />
        </div>
      </div>

      {status === 'loading' && <p>Loading…</p>}
      {status === 'error' && <p role="alert">{error}</p>}

      {status === 'ready' && equipment.length === 0 && <p>No equipment matches your search.</p>}

      {status === 'ready' && equipment.length > 0 && (
        <ul>
          {equipment.map((item) => (
            <li key={item._id}>
              {item.photos?.[0] && <img src={item.photos[0]} alt={`Photo of ${item.name}`} width={80} height={80} />}
              <h2>{item.name}</h2>
              {item.category && <p>Category: {item.category}</p>}
              <p>{item.quantityAvailable} available</p>
              {item.description && <p>{item.description}</p>}
              <Link to={`/bookings/new/${item._id}`}>Book this item</Link>
            </li>
          ))}
        </ul>
      )}

      {pagination && pagination.pages > 1 && (
        <nav aria-label="Catalog pagination">
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
