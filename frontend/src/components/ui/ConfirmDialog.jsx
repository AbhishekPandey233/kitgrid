import Modal from './Modal';
import Button from './Button';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal open={open} onClose={onCancel} className="max-w-sm p-6" aria-label={title}>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {message && <p className="mt-2 text-sm text-slate-500">{message}</p>}
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} size="sm" onClick={onConfirm} disabled={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
