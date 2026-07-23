import Modal from './Modal';
import Badge from './Badge';
import Button from './Button';
import EquipmentThumbnail from './EquipmentThumbnail';
import { resolveImageUrl } from '../../api/axiosClient';

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

export default function BookingDetailsDialog({ booking, onClose }) {
  const equipment = booking?.equipmentId;

  return (
    <Modal
      open={!!booking}
      onClose={onClose}
      className="max-w-2xl p-6"
      aria-label={`Booking details: ${equipment?.name || 'equipment'}`}
    >
      {booking && (
        <>
          <div className="flex flex-col gap-6 sm:flex-row">
            <EquipmentThumbnail
              src={resolveImageUrl(equipment?.photos?.[0])}
              alt={`Photo of ${equipment?.name || 'equipment'}`}
              className="h-56 w-full shrink-0 rounded-xl sm:h-56 sm:w-56"
              iconClassName="h-14 w-14"
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{equipment?.name || 'Equipment'}</h2>
                <Badge status={booking.status}>{STATUS_LABELS[booking.status]}</Badge>
              </div>
              {equipment?.category && <p className="mt-0.5 text-xs font-medium text-indigo-600">{equipment.category}</p>}
              {equipment?.description && <p className="mt-2 text-sm text-slate-500">{equipment.description}</p>}

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500">Window</dt>
                <dd className="text-slate-700">
                  {formatDateTime(booking.startDateTime)} – {formatDateTime(booking.endDateTime)}
                </dd>

                <dt className="text-slate-500">Quantity booked</dt>
                <dd className="text-slate-700">{booking.quantity}</dd>

                {equipment?.quantityAvailable != null && (
                  <>
                    <dt className="text-slate-500">Total stock</dt>
                    <dd className="text-slate-700">{equipment.quantityAvailable}</dd>
                  </>
                )}

                {booking.customerNote && (
                  <>
                    <dt className="text-slate-500">Your note</dt>
                    <dd className="text-slate-700">{booking.customerNote}</dd>
                  </>
                )}

                {booking.adminNote && (
                  <>
                    <dt className="text-slate-500">Admin note</dt>
                    <dd className="text-slate-700">{booking.adminNote}</dd>
                  </>
                )}

                {booking.status === 'returned' && booking.conditionOnReturn && (
                  <>
                    <dt className="text-slate-500">Condition on return</dt>
                    <dd className="text-slate-700">{booking.conditionOnReturn}</dd>
                  </>
                )}

                {booking.decidedAt && (
                  <>
                    <dt className="text-slate-500">Decided</dt>
                    <dd className="text-slate-700">{formatDateTime(booking.decidedAt)}</dd>
                  </>
                )}
              </dl>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
