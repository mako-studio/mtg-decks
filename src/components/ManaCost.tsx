const SYMBOL_STYLES: Record<string, string> = {
  W: "bg-[#f8f4e3] text-[#8a7228] border-[#e0d8b0]",
  U: "bg-[#c1e3f7] text-[#0e5f8a] border-[#8fcbec]",
  B: "bg-[#c9c2be] text-[#211a17] border-[#9b9490]",
  R: "bg-[#f6b99a] text-[#9a2b18] border-[#ef8f66]",
  G: "bg-[#c3d9b3] text-[#1c5c2c] border-[#9cc084]",
  C: "bg-[#dcdbdb] text-[#3a3a3a] border-[#bcbcbc]",
};

function pipStyle(symbol: string): string {
  const clean = symbol.replace("/", "");
  for (const letter of ["W", "U", "B", "R", "G", "C"]) {
    if (clean.includes(letter)) return SYMBOL_STYLES[letter];
  }
  return "bg-surface-muted text-muted border-border";
}

function pipLabel(symbol: string): string {
  // Hybride "W/U" -> "W/U" affiché tel quel ; sinon symbole brut (2, X, S...).
  return symbol;
}

/** Affiche un coût de mana Scryfall (ex: "{2}{U}{U}") sous forme de pips colorés. */
export function ManaCost({ cost, size = "sm" }: { cost: string; size?: "sm" | "md" }) {
  if (!cost) return null;
  const symbols = cost.match(/\{([^}]+)\}/g)?.map((s) => s.slice(1, -1)) ?? [];
  if (symbols.length === 0) return null;

  const dims = size === "sm" ? "h-4 w-4 text-[10px]" : "h-6 w-6 text-xs";

  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {symbols.map((s, i) => (
        <span
          key={`${s}-${i}`}
          className={`inline-flex ${dims} items-center justify-center rounded-full border font-bold leading-none ${pipStyle(s)}`}
          title={s}
        >
          {pipLabel(s)}
        </span>
      ))}
    </span>
  );
}
