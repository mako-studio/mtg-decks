"use client";

import { useEffect, useState } from "react";
import type { EnrichedCard } from "@/lib/types";
import { getDisplayImageUrl, getDisplayManaCost, getDisplayOracleText } from "@/lib/scryfall";
import { CATEGORY_LABELS, classifyCard } from "@/lib/deck-score";
import { ManaCost } from "./ManaCost";
import { useLanguage } from "./LanguageProvider";
import { fetchLocalizedText, type LocalizedText } from "@/lib/actions";
import { getCachedTranslation, hasCachedTranslation, setCachedTranslation } from "@/lib/translation-cache";
import { CardImageHover } from "./CardImageHover";

export function CardTile({
  entry,
  added = false,
  markedForRemoval = false,
  onRemove,
  removeDisabled = false,
  expanded,
  onToggle,
}: {
  entry: EnrichedCard;
  /** Marque visuellement une carte ajoutée via une suggestion pendant la session. */
  added?: boolean;
  /** Marque visuellement une carte taguée "à retirer" suite à un swap non confirmé. */
  markedForRemoval?: boolean;
  /** Si fourni, affiche un bouton de retrait (retire 1 exemplaire). */
  onRemove?: () => void;
  removeDisabled?: boolean;
  /** Contrôlé par le parent pour un comportement accordéon (un seul déplié à la fois). */
  expanded: boolean;
  onToggle: () => void;
}) {
  const card = entry.card;
  // Rôle(s) de la carte dans le deck, affiché·s en ligne plutôt que
  // seulement disponible en dépliant la carte ou en la retapant dans
  // "Tester une carte" (voir refonte UX du 26/08/2026) — pas pour le
  // commandant, dont le rôle en tant que "pilier" n'est pas ce qui compte.
  const categories = card && !entry.isCommander ? classifyCard(card) : [];
  const shownCategories = categories.slice(0, 2);
  const extraCategoryCount = categories.length - shownCategories.length;
  const { lang } = useLanguage();
  const [translation, setTranslation] = useState<LocalizedText | null | undefined>(undefined);
  const [loadingTranslation, setLoadingTranslation] = useState(false);

  useEffect(() => {
    if (!expanded || lang !== "fr" || !card) return;
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

  const displayTypeLine = lang === "fr" && translation ? translation.typeLine : card?.type_line;
  const displayText =
    lang === "fr" && translation ? translation.text : card ? getDisplayOracleText(card) : "";
  const noTranslationFound = lang === "fr" && expanded && card && !loadingTranslation && translation === null;

  return (
    <div
      className={`rounded-lg border bg-surface ${added ? "border-accent/50" : "border-border"}`}
    >
      <div className="flex items-center gap-1 pr-2">
        <button
          type="button"
          onClick={onToggle}
          disabled={!card}
          className="flex w-full min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left text-sm disabled:cursor-default"
        >
          <span className="w-5 shrink-0 text-right text-muted tabular-nums">{entry.count}×</span>
          <span className="min-w-0 flex-1 truncate font-medium">
            {entry.name}
            {entry.isCommander && (
              <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                Commandant
              </span>
            )}
            {added && !entry.isCommander && (
              <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                Ajoutée
              </span>
            )}
            {markedForRemoval && (
              <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                À retirer
              </span>
            )}
          </span>
          {card && !entry.isCommander && (
            <span className="flex shrink-0 items-center gap-1">
              {categories.length === 0 ? (
                <span className="text-[10px] italic text-muted">non identifiée</span>
              ) : (
                <>
                  {shownCategories.map((cat) => (
                    <span
                      key={cat}
                      className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent"
                    >
                      {CATEGORY_LABELS[cat]}
                    </span>
                  ))}
                  {extraCategoryCount > 0 && (
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted">
                      +{extraCategoryCount}
                    </span>
                  )}
                </>
              )}
            </span>
          )}
          {card ? (
            <ManaCost cost={getDisplayManaCost(card)} />
          ) : (
            <span className="text-xs text-muted italic">non trouvée</span>
          )}
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={removeDisabled}
            title="Retirer 1 exemplaire"
            aria-label={`Retirer ${entry.name}`}
            className="shrink-0 rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-40"
          >
            ×
          </button>
        )}
      </div>

      {expanded && card && (
        <div className="flex gap-4 border-t border-border px-3 py-3">
          {getDisplayImageUrl(card, "small") && (
            <CardImageHover
              src={getDisplayImageUrl(card, "small")!}
              zoomSrc={getDisplayImageUrl(card, "large")}
              alt={card.name}
              width={110}
              className="rounded-md"
            />
          )}
          <div className="min-w-0 flex-1 text-sm">
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
            {(card.power || card.toughness) && (
              <p className="mt-2 text-xs text-muted">
                Force/Endurance : {card.power}/{card.toughness}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
