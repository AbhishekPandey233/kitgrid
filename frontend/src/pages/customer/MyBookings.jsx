import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';

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
      <PageHeader title="My bookings" subtitle="Track the status of your equipment requests." />

      {location.state?.booked && <Alert type="success" className="mb-6">Booking requested — awaiting approval.</Alert>}
      {status === 'error' && <Alert className="mb-6">{error}</Alert>}

      {status === 'loading' && (
        <div className="flex justify-center">
          <Spinner />
        </div>
      )}

      {status === 'ready' && bookings.length === 0 && (
        <p className="animate-fade-in rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
          You have no bookings yet.{' '}
          <Link to="/catalog" className="font-medium text-indigo-600 hover:text-indigo-500">
            Browse the catalog
          </Link>
          .
        </p>
      )}

      {status === 'ready' && bookings.length > 0 && (
        <ul className="flex flex-col gap-4">
          {bookings.map((booking, i) => (
            <li key={booking._id} className="animate-fade-in-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <Card animate={false} className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{booking.equipmentId?.name || 'Equipment'}</h2>
                    <Badge status={booking.status}>{STATUS_LABELS[booking.status]}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatDateTime(booking.startDateTime)} – {formatDateTime(booking.endDateTime)}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">Quantity: {booking.quantity}</p>
                </div>
                {booking.status === 'pending' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCancel(booking)}
                    disabled={cancellingId === booking._id}
                  >
                    Cancel booking
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
