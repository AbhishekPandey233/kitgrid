const VARIANTS = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  active: 'bg-emerald-100 text-emerald-800',
  returned: 'bg-slate-200 text-slate-700',
  rejected: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-rose-100 text-rose-800',
  no_show: 'bg-rose-100 text-rose-800',
};

export default function Badge({ status, children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${VARIANTS[status] || 'bg-slate-100 text-slate-700'}`}
    >
      {children}
    </span>
  );
}
