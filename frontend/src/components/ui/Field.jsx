export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ' +
  'placeholder:text-slate-400 transition-colors ' +
  'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ' +
  'disabled:bg-slate-50 disabled:text-slate-500 aria-invalid:border-rose-400';

export default function Field({ label, htmlFor, hint, error, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
