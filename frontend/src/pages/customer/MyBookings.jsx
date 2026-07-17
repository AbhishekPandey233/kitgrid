import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';

const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  active: 'Active',
  returned: 'Returned',
  no_show: 'No-show',
  cancelled: 'Cancelled',
};

function formatDateTime(iso) {
  return new Date(iso).toLocaleString();
}

export default function MyBookings() {
  const location = useLocation();
  const [bookings, setBookings] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  function load() {
    setStatus('loading');
    axiosClient
      .get('/bookings')
      .then(({ data }) => {
        setBookings(data.bookings);
        setStatus('ready');
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Failed to load bookings');
        setStatus('error');
      });
  }

  useEffect(load, []);

  async function handleCancel(booking) {
    if (!window.confirm(`Cancel your booking for ${booking.equipmentId?.name || 'this item'}?`)) {
      return;
    }
    setCancellingId(booking._id);
    try {
      await axiosClient.patch(`/bookings/${booking._id}/cancel`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not cancel booking');
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div>
      <h1>My bookings</h1>

      {location.state?.booked && <p role="status">Booking requested — awaiting approval.</p>}
      {status === 'error' && <p role="alert">{error}</p>}
      {status === 'loading' && <p>Loading…</p>}

      {status === 'ready' && bookings.length === 0 && (
        <p>
          You have no bookings yet. <Link to="/">Browse the catalog</Link>.
        </p>
      )}

      {status === 'ready' && bookings.length > 0 && (
        <ul>
          {bookings.map((booking) => (
            <li key={booking._id}>
              <h2>{booking.equipmentId?.name || 'Equipment'}</h2>
              <p>
                Status: <span className={`status-badge status-${booking.status}`}>{STATUS_LABELS[booking.status]}</span>
              </p>
              <p>
                {formatDateTime(booking.startDateTime)} – {formatDateTime(booking.endDateTime)}
              </p>
              <p>Quantity: {booking.quantity}</p>
              {booking.status === 'pending' && (
                <button type="button" onClick={() => handleCancel(booking)} disabled={cancellingId === booking._id}>
                  Cancel booking
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
