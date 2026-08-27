// Decorative tournament-bracket line art behind the leaderboard's "Me vs the world" headline.
// Built as SVG rather than a photo — a bracket converging on one point reads as pure competition
// with no branding/tone tradeoffs to weigh.
function bracketLines(numSeeds, roundWidth, slotHeight) {
  let positions = Array.from({ length: numSeeds }, (_, i) => (i + 0.5) * slotHeight);
  const lines = [];
  let x = 0;
  while (positions.length > 1) {
    const next = [];
    for (let i = 0; i < positions.length; i += 2) {
      const y1 = positions[i];
      const y2 = positions[i + 1];
      const ym = (y1 + y2) / 2;
      const xv = x + roundWidth * 0.6;
      lines.push([x, y1, xv, y1]);
      lines.push([x, y2, xv, y2]);
      lines.push([xv, y1, xv, y2]);
      lines.push([xv, ym, x + roundWidth, ym]);
      next.push(ym);
    }
    positions = next;
    x += roundWidth;
  }
  return { lines, finalX: x, finalY: positions[0] };
}

const NUM_SEEDS = 16;
const ROUND_WIDTH = 70;
const SLOT_HEIGHT = 36;
const HEIGHT = NUM_SEEDS * SLOT_HEIGHT;
const { lines: leftLines, finalX, finalY } = bracketLines(NUM_SEEDS, ROUND_WIDTH, SLOT_HEIGHT);
const CENTER_GAP = 220;
const WIDTH = finalX * 2 + CENTER_GAP;
const centerX = WIDTH / 2;
const mirror = ([x1, y1, x2, y2]) => [WIDTH - x1, y1, WIDTH - x2, y2];
const allLines = [
  ...leftLines,
  ...leftLines.map(mirror),
  [finalX, finalY, centerX, HEIGHT / 2],
  [WIDTH - finalX, finalY, centerX, HEIGHT / 2],
];

// Fixed full-page backdrop (same pattern as PageBackground) — sits behind the leaderboard's
// content rather than in a boxed-off banner, so it reads as the page's background, not a widget.
export default function BracketHero() {
  return (
    <div className="bracket-hero">
      <svg className="bracket-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
        {allLines.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
        <circle cx={centerX} cy={HEIGHT / 2} r={5} className="bracket-final-dot" />
      </svg>
      <div className="bracket-hero-text">
        <span>ME</span>
        <span className="bracket-vs">VS</span>
        <span>THE WORLD</span>
      </div>
    </div>
  );
}
