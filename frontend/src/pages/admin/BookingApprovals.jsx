import { useEffect, useState } from 'react';
import axiosClient, { resolveImageUrl } from '../../api/axiosClient';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import EquipmentThumbnail from '../../components/ui/EquipmentThumbnail';

function formatDateTime(iso) {
  return new Date(iso).toLocaleString();
}

const SECTIONS = [
  { status: 'pending', title: 'Pending requests' },
  { status: 'approved', title: 'Approved — awaiting pickup' },
  { status: 'active', title: 'Active — picked up' },
];
const LIMIT = 50;

export default function BookingApprovals() {
  const [byStatus, setByStatus] = useState({ pending: [], approved: [], active: [] });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState(null);

  function load() {
    setStatus('loading');
    Promise.all(SECTIONS.map((s) => axiosClient.get('/admin/bookings', { params: { status: s.status, limit: LIMIT } })))
      .then((responses) => {
        const next = {};
        SECTIONS.forEach((s, i) => {
          next[s.status] = responses[i].data.bookings;
        });
        setByStatus(next);
        setStatus('ready');
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Failed to load bookings');
        setStatus('error');
      });
  }

  useEffect(load, []);

  async function handleAction(booking, action) {
    setActingId(booking._id);
    setError('');
    try {
      await axiosClient.patch(`/admin/bookings/${booking._id}/${action}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed');
    } finally {
      setActingId(null);
    }
  }

  function actionsFor(sectionStatus, booking) {
    const disabled = actingId === booking._id;
    if (sectionStatus === 'pending') {
      return (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => handleAction(booking, 'approve')} disabled={disabled}>
            Approve
          </Button>
          <Button size="sm" variant="secondary" className="text-rose-600" onClick={() => handleAction(booking, 'reject')} disabled={disabled}>
            Reject
          </Button>
        </div>
      );
    }
    if (sectionStatus === 'approved') {
      return (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => handleAction(booking, 'mark-active')} disabled={disabled}>
            Mark picked up
          </Button>
          <Button size="sm" variant="secondary" className="text-rose-600" onClick={() => handleAction(booking, 'mark-no-show')} disabled={disabled}>
            Mark no-show
          </Button>
        </div>
      );
    }
    if (sectionStatus === 'active') {
      return (
        <Button size="sm" onClick={() => handleAction(booking, 'mark-returned')} disabled={disabled}>
          Mark returned
        </Button>
      );
    }
    return null;
  }

  return (
    <div>
      <PageHeader title="Booking approvals" subtitle="Move requests through the approval pipeline." />

      {status === 'loading' && (
        <div className="flex justify-center">
          <Spinner />
        </div>
      )}
      {error && <Alert className="mb-6">{error}</Alert>}

      {status === 'ready' &&
        SECTIONS.map((section, si) => {
          const bookings = byStatus[section.status];
          return (
            <section key={section.status} className="mb-8 animate-fade-in-up" style={{ animationDelay: `${si * 60}ms` }}>
              <h2 className="mb-3 text-base font-semibold text-slate-900">
                {section.title} <span className="font-normal text-slate-500">({bookings.length})</span>
              </h2>
              {bookings.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white py-8 text-center text-sm text-slate-500">
                  None right now.
                </p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100 text-sm">
                      <caption className="sr-only">{section.title}</caption>
                      <thead className="bg-slate-50">
                        <tr>
                          <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Equipment</th>
                          <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Customer</th>
                          <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Window</th>
                          <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Quantity</th>
                          <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bookings.map((booking) => (
                          <tr key={booking._id} className="transition-colors hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-800">
                              <div className="flex items-center gap-3">
                                <EquipmentThumbnail
                                  src={resolveImageUrl(booking.equipmentId?.photos?.[0])}
                                  alt=""
                                  className="h-10 w-10 shrink-0 rounded-md"
                                  iconClassName="h-4 w-4"
                                />
                                {booking.equipmentId?.name || 'Unknown equipment'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-500">
                              <div>{booking.customerId?.name || 'Unknown'}</div>
                              <div className="text-xs text-slate-500">{booking.customerId?.email}</div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                              {formatDateTime(booking.startDateTime)} – {formatDateTime(booking.endDateTime)}
                            </td>
                            <td className="px-4 py-3 text-slate-500">{booking.quantity}</td>
                            <td className="px-4 py-3">{actionsFor(section.status, booking)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          );
        })}
    </div>
  );
}
