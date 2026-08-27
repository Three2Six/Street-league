// A fixed, dimmed photo behind a page's content — different pages can pass a different `image`,
// so the app can carry its own look section to section instead of one flat background everywhere.
// Renders behind everything (z-index -1) and stays fully out of the way of layout and clicks.
export default function PageBackground({ image, dim = 'normal' }) {
  return <div className={`page-background dim-${dim}`} style={{ backgroundImage: `url(${image})` }} />;
}
