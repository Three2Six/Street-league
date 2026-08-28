// A checkered-flag mark replacing the 🏁 emoji placeholder — scales cleanly at any size and
// reuses the same SVG for the navbar brand and the browser favicon.
export default function Logo({ size = 28, withText = true }) {
  return (
    <span className="brand-logo">
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <pattern id="logo-checker" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#0d0c10" />
            <rect width="3" height="3" fill="#f2f3f5" />
            <rect x="3" y="3" width="3" height="3" fill="#f2f3f5" />
          </pattern>
        </defs>
        <rect x="7" y="4" width="3" height="40" rx="1.5" fill="#9aa1b0" />
        <path
          d="M10 6 C 18 2.5, 27 10.5, 38 6 C 34.5 10.5, 34.5 15.5, 38 20 C 27 24.5, 18 16.5, 10 20 Z"
          fill="url(#logo-checker)"
          stroke="#0d0c10"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
      {withText && <span className="brand-wordmark">Street League</span>}
    </span>
  );
}
