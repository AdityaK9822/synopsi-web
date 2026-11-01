/* Synopsi brand: a dependency-free logomark (tile + white flower glyph)
   matching the reference logo's structure. Pure SVG, so it renders crisply
   at 28–56px. Tone selects the tile colour. */

const TONE: Record<string, string> = {
  indigo: "bg-primary text-white shadow-[0_4px_8px_0_rgb(79_70_229/0.15)]",
  rose:   "bg-rose-500   text-white shadow-[0_4px_8px_0_rgb(244_63_94/0.25)]",
  amber:  "bg-amber-400  text-amber-950 shadow-[0_4px_8px_0_rgb(245_158_11/0.25)]",
  teal:   "bg-teal-500   text-white shadow-[0_4px_8px_0_rgb(20_184_166/0.25)]",
  slate:  "bg-slate-700  text-white shadow-[0_4px_8px_0_rgb(30_41_59/0.2)]",
};

export function Logomark({
  className = "size-8",
  tone = "indigo",
}: { className?: string; tone?: keyof typeof TONE }) {
  const toneClass = TONE[tone] ?? TONE.indigo;
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center overflow-clip rounded-[12px] border-[0.5px] border-white/30 ${toneClass} ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-[55%]">
        {/* five petals around a center dot — reads as 🌸 at any size */}
        <circle cx="12" cy="5.6" r="3" />
        <circle cx="5.92" cy="9.8" r="3" />
        <circle cx="8.24" cy="17.2" r="3" />
        <circle cx="15.76" cy="17.2" r="3" />
        <circle cx="18.08" cy="9.8" r="3" />
        <circle cx="12" cy="11.9" r="2.6" />
      </svg>
    </span>
  );
}