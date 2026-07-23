import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import axiosClient, { resolveImageUrl } from '../../api/axiosClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import EquipmentThumbnail from '../../components/ui/EquipmentThumbnail';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import BookingDetailsDialog from '../../components/ui/BookingDetailsDialog';

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
  const [deletingId, setDeletingId] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);

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

  async function confirmCancel() {
    setCancellingId(cancelTarget._id);
    try {
      await axiosClient.patch(`/bookings/${cancelTarget._id}/cancel`);
      setCancelTarget(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not cancel booking');
    } finally {
      setCancellingId(null);
    }
  }

  async function confirmDelete() {
    setDeletingId(deleteTarget._id);
    try {
      await axiosClient.delete(`/bookings/${deleteTarget._id}`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete booking');
    } finally {
      setDeletingId(null);
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
                <div className="flex items-center gap-4">
                  <EquipmentThumbnail
                    src={resolveImageUrl(booking.equipmentId?.photos?.[0])}
                    alt={`Photo of ${booking.equipmentId?.name || 'equipment'}`}
                    className="h-16 w-16 shrink-0 rounded-lg"
                    iconClassName="h-6 w-6"
                  />
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
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setViewTarget(booking)}>
                    View
                  </Button>
                  {booking.status === 'pending' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCancelTarget(booking)}
                      disabled={cancellingId === booking._id}
                    >
                      Cancel booking
                    </Button>
                  )}
                  {booking.status === 'returned' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() => setDeleteTarget(booking)}
                      disabled={deletingId === booking._id}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <BookingDetailsDialog booking={viewTarget} onClose={() => setViewTarget(null)} />

      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel this booking?"
        message={`Cancel your booking for ${cancelTarget?.equipmentId?.name || 'this item'}?`}
        confirmLabel="Cancel booking"
        danger
        loading={cancellingId === cancelTarget?._id}
        onConfirm={confirmCancel}
        onCancel={() => setCancelTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this booking record?"
        message={`Delete this booking record for ${deleteTarget?.equipmentId?.name || 'this item'}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deletingId === deleteTarget?._id}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
