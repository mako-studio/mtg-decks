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
import type { CardVerdict } from "@/lib/deck-audit";

/** Pastille du verdict (deck-audit.ts) : rien pour « ok ». */
const VERDICT_BADGE: Record<CardVerdict["level"], { label: string; className: string } | null> = {
  ok: null,
  "contre-intuitif": { label: "Choix surprenant", className: "bg-synergy-soft text-synergy" },
  discutable: { label: "À revoir", className: "bg-warning-soft text-warning" },
  "contre-productif": { label: "Contre-productive", className: "bg-warning text-accent-foreground" },
};
const BASIS_LABEL: Record<CardVerdict["basis"], string> = {
  tournoi: "présence dans les decks de tournoi",
  popularité: "popularité en Commander (rang EDHREC)",
  texte: "estimation d'après le texte de la carte",
};

export function CardTile({
  entry,
  added = false,
  markedForRemoval = false,
  onRemove,
  removeDisabled = false,
  expanded,
  onToggle,
  verdict,
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
  /**
   * Lecture de la carte dans CE deck (04/10/2026, demande de Ben : la
   * justification de chaque carte sur la page de deck) : rôle, raison de sa
   * présence, et réserve éventuelle. Absent pour le commandant et les terrains.
   */
  verdict?: CardVerdict;
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
  const badge = verdict ? VERDICT_BADGE[verdict.level] : null;
  const flagged = verdict && verdict.level !== "ok";

  return (
    <div
      className={`rounded-lg border bg-surface ${
        verdict?.level === "contre-productif" || verdict?.level === "discutable" ? "border-warning/60" : added ? "border-accent/50" : "border-border"
      }`}
    >
      <div className="flex items-center gap-1 pr-2">
        <button
          type="button"
          onClick={onToggle}
          disabled={!card}
          className="flex w-full min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left text-sm disabled:cursor-default"
        >
          <span className="w-5 shrink-0 self-start text-right text-muted tabular-nums">{entry.count}×</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
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
            {badge && (
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}>
                {badge.label}
              </span>
            )}
            </span>
            {/* Justification de la carte dans ce deck : toujours visible, sous le nom. */}
            {verdict && verdict.group !== "terrain" && (
              <span className="mt-0.5 block text-xs font-normal leading-snug text-muted">{verdict.why}</span>
            )}
            {flagged && verdict.note && (
              <span className={`mt-0.5 block text-xs font-normal leading-snug ${verdict.level === "contre-intuitif" ? "text-synergy" : "text-warning"}`}>
                {verdict.note}
              </span>
            )}
          </span>
          {card && !entry.isCommander && (
            <span className="flex shrink-0 items-center gap-1 self-start">
              {categories.length === 0 ? (
                // Avec la lecture du deck, la phrase sous le nom dit le rôle : pas de « non identifiée ».
                verdict ? null : <span className="text-[10px] italic text-muted">non identifiée</span>
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
            <span className="shrink-0 self-start">
              <ManaCost cost={getDisplayManaCost(card)} />
            </span>
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
            {verdict && verdict.group !== "terrain" && (
              <p className="mt-2 text-xs text-muted">
                Qualité estimée : {verdict.quality.toLocaleString("fr-FR")}/10 — {BASIS_LABEL[verdict.basis]}.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
