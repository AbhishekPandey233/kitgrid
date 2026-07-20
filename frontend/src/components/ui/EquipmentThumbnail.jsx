export default function EquipmentThumbnail({ src, alt, className = 'h-40 w-full rounded-xl', iconClassName = 'h-12 w-12' }) {
  if (src) {
    return <img src={src} alt={alt} className={`${className} object-cover`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 text-indigo-300 ${className}`}>
      <svg className={iconClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
        />
      </svg>
    </div>
  );
}
