export default function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" fill="#2f6fd6" />
      <circle cx="25" cy="32" r="11" fill="none" stroke="#ffffff" strokeWidth="5" />
      <circle cx="39" cy="32" r="11" fill="none" stroke="#bcd6ff" strokeWidth="5" />
    </svg>
  );
}
