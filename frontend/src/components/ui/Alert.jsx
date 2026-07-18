const STYLES = {
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

export default function Alert({ type = 'error', className = '', children, ...props }) {
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`animate-fade-in rounded-lg border px-3 py-2 text-sm ${STYLES[type]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
