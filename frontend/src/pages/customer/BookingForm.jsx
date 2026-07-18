import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Field, { inputClass } from '../../components/ui/Field';
import Spinner from '../../components/ui/Spinner';

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
      <div className="mx-auto max-w-sm">
        <Card>
          <Alert>{loadError}</Alert>
          <Link to="/catalog" className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">
            Back to catalog
          </Link>
        </Card>
      </div>
    );
  }

  if (!equipment) {
    return (
      <div className="flex justify-center">
        <Spinner />
      </div>
    );
  }

  const hasErrors = errors.length > 0 || !!error;

  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <h1 className="text-xl font-bold text-slate-900">Book {equipment.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{equipment.quantityAvailable} available in total</p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
          <Field label="Start" htmlFor="booking-start">
            <input
              id="booking-start"
              type="datetime-local"
              value={start}
              min={nowLocal}
              onChange={(e) => setStart(e.target.value)}
              aria-describedby={hasErrors ? 'booking-form-error' : undefined}
              aria-invalid={hasErrors}
              className={inputClass}
              required
            />
          </Field>

          <Field label="End" htmlFor="booking-end">
            <input
              id="booking-end"
              type="datetime-local"
              value={end}
              min={start || nowLocal}
              onChange={(e) => setEnd(e.target.value)}
              aria-describedby={hasErrors ? 'booking-form-error' : undefined}
              aria-invalid={hasErrors}
              className={inputClass}
              required
            />
          </Field>

          <Field label="Quantity" htmlFor="booking-quantity">
            <input
              id="booking-quantity"
              type="number"
              min={1}
              max={equipment.quantityAvailable}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              aria-describedby={hasErrors ? 'booking-form-error' : undefined}
              aria-invalid={hasErrors}
              className={inputClass}
              required
            />
          </Field>

          <Field label="Note (optional)" htmlFor="booking-note">
            <textarea
              id="booking-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className={inputClass}
            />
          </Field>

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Requesting…' : 'Request booking'}
          </Button>

          {hasErrors && (
            <Alert id="booking-form-error">
              {errors.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-4">
                  {errors.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              ) : (
                error
              )}
            </Alert>
          )}
        </form>
      </Card>
    </div>
  );
}
