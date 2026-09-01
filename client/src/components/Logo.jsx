// Navbar brand mark — a tight crop of the "SL" monogram from the full badge logo
// (client/public/logo-badge.png), sized down for small-icon use.
export default function Logo({ size = 30, withText = true }) {
  return (
    <span className="brand-logo">
      <img src="/logo-icon.png" alt="Redline League" width={size} height={size} className="brand-icon" />
      {withText && <span className="brand-wordmark">Redline League</span>}
    </span>
  );
}
