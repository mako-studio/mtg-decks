"use client";

import { useEffect, useState } from "react";
import type { CardSuggestion } from "@/lib/types";
import { getDisplayImageUrl, getDisplayManaCost, getDisplayOracleText } from "@/lib/scryfall";
import { CATEGORY_LABELS } from "@/lib/deck-score";
import { ManaCost } from "./ManaCost";
import { useLanguage } from "./LanguageProvider";
import { fetchLocalizedText, type LocalizedText } from "@/lib/actions";
import { getCachedTranslation, hasCachedTranslation, setCachedTranslation } from "@/lib/translation-cache";
import { CardImageHover } from "./CardImageHover";

export function SuggestionCard({
  suggestion,
  onAddClick,
  addDisabled = false,
  expanded,
  onToggle,
}: {
  suggestion: CardSuggestion;
  /**
   * Clic sur "Ajouter" / "Swap" — c'est au parent de décider s'il ajoute
   * directement ou ouvre une confirmation de swap (selon `suggestion.swapOut`).
   */
  onAddClick?: () => void;
  addDisabled?: boolean;
  /** Contrôlé par le parent pour un comportement accordéon (un seul déplié à la fois). */
  expanded: boolean;
  onToggle: () => void;
}) {
  const { card } = suggestion;
  const img = getDisplayImageUrl(card, "small");
  const { lang } = useLanguage();
  const [translation, setTranslation] = useState<LocalizedText | null | undefined>(undefined);
  const [loadingTranslation, setLoadingTranslation] = useState(false);

  useEffect(() => {
    if (!expanded || lang !== "fr") return;
    if (hasCachedTranslation(card.name)) {
      // Lecture d'un cache externe (module-level Map, voir translation-cache.ts) :
      // synchronisation ponctuelle avec un système externe, pas une cascade
      // (un seul setState, conditionné par expanded/lang/card qui ne changent
      // pas à chaque rendu). Cf. justification identique dans le useEffect
      // de sauvegarde de DeckBuilder.tsx.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTranslation(getCachedTranslation(card.name) ?? null);
      return;
    }
    setLoadingTranslation(true);
    fetchLocalizedText(card.name)
      .then((res) => {
        setCachedTranslation(card.name, res);
        setTranslation(res);
      })
      .finally(() => setLoadingTranslation(false));
  }, [expanded, lang, card]);

  const displayTypeLine = lang === "fr" && translation ? translation.typeLine : card.type_line;
  const displayText = lang === "fr" && translation ? translation.text : getDisplayOracleText(card);
  const noTranslationFound = lang === "fr" && expanded && !loadingTranslation && translation === null;

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <div className="flex items-start gap-2 px-3 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          {img && (
            <CardImageHover
              src={img}
              zoomSrc={getDisplayImageUrl(card, "large")}
              alt={card.name}
              width={56}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{card.name}</span>
              <ManaCost cost={getDisplayManaCost(card)} />
            </div>
            <p className="mt-1 text-xs text-muted">{suggestion.reason}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {suggestion.categories.map((cat) => (
                <span
                  key={cat}
                  className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent"
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                </span>
              ))}
              {suggestion.archetypeMatch && (
                <span
                  title="Correspond au thème détecté de ton deck, pas à un pilier générique"
                  className="rounded-full bg-synergy-soft px-2 py-0.5 text-[10px] font-semibold text-synergy"
                >
                  ✦ {suggestion.archetypeMatch.label}
                </span>
              )}
            </div>
            {suggestion.swapOut && (
              <p className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-muted">
                <span aria-hidden="true">⇄</span>
                <span>
                  À la place de <span className="font-medium text-foreground/80">{suggestion.swapOut.name}</span>
                </span>
              </p>
            )}
          </div>
        </button>
        {onAddClick && (
          <button
            type="button"
            onClick={onAddClick}
            disabled={addDisabled}
            title={suggestion.swapOut ? `Swap : + ${card.name} / − ${suggestion.swapOut.name}` : undefined}
            className="shrink-0 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {suggestion.swapOut ? "⇄ Swap" : "+ Ajouter"}
          </button>
        )}
      </div>
      {expanded && (
        <div className="border-t border-border px-3 py-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {displayTypeLine}
          </p>
          {lang === "fr" && loadingTranslation && (
            <p className="mt-1 text-xs italic text-muted">Traduction en cours…</p>
          )}
          <p className="mt-1 whitespace-pre-line text-foreground/90">{displayText || "—"}</p>
          {noTranslationFound && (
            <p className="mt-2 text-xs italic text-muted">
              Pas de traduction FR trouvée sur Scryfall — texte anglais affiché.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
