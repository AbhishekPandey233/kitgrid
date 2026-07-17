import { useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient';

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
        <>
          <button type="button" onClick={() => handleAction(booking, 'approve')} disabled={disabled}>
            Approve
          </button>
          <button type="button" onClick={() => handleAction(booking, 'reject')} disabled={disabled}>
            Reject
          </button>
        </>
      );
    }
    if (sectionStatus === 'approved') {
      return (
        <>
          <button type="button" onClick={() => handleAction(booking, 'mark-active')} disabled={disabled}>
            Mark picked up
          </button>
          <button type="button" onClick={() => handleAction(booking, 'mark-no-show')} disabled={disabled}>
            Mark no-show
          </button>
        </>
      );
    }
    if (sectionStatus === 'active') {
      return (
        <button type="button" onClick={() => handleAction(booking, 'mark-returned')} disabled={disabled}>
          Mark returned
        </button>
      );
    }
    return null;
  }

  return (
    <div>
      <h1>Booking approvals</h1>

      {status === 'loading' && <p>Loading…</p>}
      {error && <p role="alert">{error}</p>}

      {status === 'ready' &&
        SECTIONS.map((section) => {
          const bookings = byStatus[section.status];
          return (
            <section key={section.status}>
              <h2>
                {section.title} ({bookings.length})
              </h2>
              {bookings.length === 0 && <p>None right now.</p>}
              {bookings.length > 0 && (
                <table>
                  <caption className="sr-only">{section.title}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Equipment</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Window</th>
                      <th scope="col">Quantity</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking) => (
                      <tr key={booking._id}>
                        <td>{booking.equipmentId?.name || 'Unknown equipment'}</td>
                        <td>
                          {booking.customerId?.name || 'Unknown'}
                          <br />
                          {booking.customerId?.email}
                        </td>
                        <td>
                          {formatDateTime(booking.startDateTime)} – {formatDateTime(booking.endDateTime)}
                        </td>
                        <td>{booking.quantity}</td>
                        <td>{actionsFor(section.status, booking)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
    </div>
  );
}
