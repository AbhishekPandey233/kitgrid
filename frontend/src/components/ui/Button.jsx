const VARIANTS = {
  primary: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 hover:shadow-md',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400 shadow-sm',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-500 hover:shadow-md',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
};

export default function Button({ variant = 'primary', size = 'md', className = '', type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
