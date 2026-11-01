/* Synopsi brand: a dependency-free logomark (indigo tile, white
   flower glyph) matching the reference logo's structure. Pure SVG, so it
   inherits the accent tokens and renders crisply at 28–56px. */

function FlowerGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      {/* five petals around a center dot — reads as 🌸 at any size */}
      <circle cx="12" cy="5.6" r="3" />
      <circle cx="5.92" cy="9.8" r="3" />
      <circle cx="8.24" cy="17.2" r="3" />
      <circle cx="15.76" cy="17.2" r="3" />
      <circle cx="18.08" cy="9.8" r="3" />
      <circle cx="12" cy="11.9" r="2.6" />
    </svg>
  );
}

export function Logomark({ className = "size-8" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center overflow-clip rounded-[12px] border-[0.5px] border-white/30 bg-primary text-white shadow-[0_4px_8px_0_rgb(79_70_229/0.1)] ${className}`}
    >
      <FlowerGlyph className="size-[55%]" />
    </span>
  );
}
