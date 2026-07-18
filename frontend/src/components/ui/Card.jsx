export default function Card({ className = '', animate = true, ...props }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${animate ? 'animate-fade-in-up' : ''} ${className}`}
      {...props}
    />
  );
}
