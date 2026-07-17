import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';

function toDatetimeLocal(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function BookingForm() {
  const { equipmentId } = useParams();
  const navigate = useNavigate();

  const [equipment, setEquipment] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const nowLocal = toDatetimeLocal(new Date());

  useEffect(() => {
    let cancelled = false;
    axiosClient
      .get(`/equipment/${equipmentId}`)
      .then(({ data }) => {
        if (!cancelled) setEquipment(data.equipment);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.response?.data?.error || 'Failed to load equipment');
      });
    return () => {
      cancelled = true;
    };
  }, [equipmentId]);

  function validateClientSide() {
    if (!start || !end) {
      return 'Start and end are required';
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (startDate <= new Date()) {
      return 'Start must be in the future';
    }
    if (!(startDate < endDate)) {
      return 'Start must be before end';
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setErrors([]);

    const clientError = validateClientSide();
    if (clientError) {
      setError(clientError);
      return;
    }

    setSubmitting(true);
    try {
      await axiosClient.post('/bookings', {
        equipmentId,
        startDateTime: new Date(start).toISOString(),
        endDateTime: new Date(end).toISOString(),
        quantity: Number(quantity),
        customerNote: note || undefined,
      });
      navigate('/bookings', { state: { booked: true } });
    } catch (err) {
      setErrors(err.response?.data?.details || []);
      setError(err.response?.data?.error || 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div>
        <p role="alert">{loadError}</p>
        <Link to="/">Back to catalog</Link>
      </div>
    );
  }

  if (!equipment) {
    return <p>Loading…</p>;
  }

  const hasErrors = errors.length > 0 || !!error;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h1>Book {equipment.name}</h1>
      <p>{equipment.quantityAvailable} available in total</p>

      <div>
        <label htmlFor="booking-start">Start</label>
        <input
          id="booking-start"
          type="datetime-local"
          value={start}
          min={nowLocal}
          onChange={(e) => setStart(e.target.value)}
          aria-describedby={hasErrors ? 'booking-form-error' : undefined}
          aria-invalid={hasErrors}
          required
        />
      </div>

      <div>
        <label htmlFor="booking-end">End</label>
        <input
          id="booking-end"
          type="datetime-local"
          value={end}
          min={start || nowLocal}
          onChange={(e) => setEnd(e.target.value)}
          aria-describedby={hasErrors ? 'booking-form-error' : undefined}
          aria-invalid={hasErrors}
          required
        />
      </div>

      <div>
        <label htmlFor="booking-quantity">Quantity</label>
        <input
          id="booking-quantity"
          type="number"
          min={1}
          max={equipment.quantityAvailable}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          aria-describedby={hasErrors ? 'booking-form-error' : undefined}
          aria-invalid={hasErrors}
          required
        />
      </div>

      <div>
        <label htmlFor="booking-note">Note (optional)</label>
        <textarea id="booking-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <button type="submit" disabled={submitting}>
        Request booking
      </button>

      {hasErrors && (
        <div id="booking-form-error" role="alert">
          {errors.length > 0 ? (
            <ul>
              {errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          ) : (
            <p>{error}</p>
          )}
        </div>
      )}
    </form>
  );
}
