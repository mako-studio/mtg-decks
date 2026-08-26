"use client";

import { useEffect, useRef, useState } from "react";
import type { CardSuggestion, EnrichedCard } from "@/lib/types";
import { autocompleteCardName, evaluateCardForDeck, type CardEvaluationResult } from "@/lib/actions";
import { getDisplayImageUrl, getDisplayManaCost, getDisplayOracleText } from "@/lib/scryfall";
import { CATEGORY_LABELS } from "@/lib/deck-score";
import { ManaCost } from "./ManaCost";
import { CardImageHover } from "./CardImageHover";

const VERDICT_STYLES = {
  improve: {
    label: "✓ Améliore le deck",
    className: "bg-success-soft text-success",
  },
  marginal: {
    label: "≈ Impact limité",
    className: "bg-warning-soft text-warning",
  },
  unclear: {
    label: "? Rôle non identifié",
    className: "bg-surface-muted text-muted",
  },
} as const;

/**
 * Teste la compatibilité d'une carte cherchée manuellement avec le deck
 * actuel, plutôt qu'un simple ajout à l'aveugle : autocomplétion pendant la
 * saisie (/cards/autocomplete), puis pour la carte choisie, un verdict
 * (améliore le deck / impact limité / rôle non identifié) et — le cas
 * échéant — une candidate au retrait pour en faire un swap, calculés par
 * `evaluateCardForDeck` (recommend.ts) exactement comme pour les
 * suggestions automatiques. La confirmation d'ajout/swap réutilise ensuite
 * le même flow que les suggestions (popup de swap gérée par le parent).
 *
 * Contrairement aux suggestions automatiques, aucun filtre de légalité ou
 * d'identité de couleur n'est appliqué en amont : l'utilisateur peut
 * chercher et ajouter n'importe quelle carte existante. On l'informe
 * simplement par un badge si la carte n'est pas légale dans le format, ou
 * hors identité de couleur du commandant — sans le lui interdire (c'est son
 * deck).
 */
export function AddCardSearch({
  formatKey,
  formatLabel,
  maxCopies,
  hasCommander,
  colorIdentity,
  currentCards,
  existingCounts,
  onAddClick,
  addDisabled = false,
}: {
  formatKey: string;
  formatLabel: string;
  maxCopies: number;
  hasCommander: boolean;
  /** Identité de couleur du deck (commandant·s) — ignorée si `hasCommander` est faux. */
  colorIdentity: string[];
  /** Cartes actuelles du deck (hors commandant), pour évaluer la compatibilité de la carte cherchée. */
  currentCards: EnrichedCard[];
  /** Nombre d'exemplaires déjà dans le deck, par nom en minuscule. */
  existingCounts: Map<string, number>;
  /** Clic sur "Ajouter"/"Swap" — au parent de décider (ajout direct ou popup de swap), comme pour les suggestions automatiques. */
  onAddClick: (suggestion: CardSuggestion) => void;
  addDisabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [autocomplete, setAutocomplete] = useState<string[]>([]);
  const [preview, setPreview] = useState<CardEvaluationResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // Garde les N dernières candidates au retrait proposées par cette
  // recherche manuelle, pour les exclure des recherches suivantes : sans
  // ça, la carte la plus "sacrifiable" du deck (souvent une seule, très
  // générique) ressort identique à chaque recherche qui ne partage aucune
  // catégorie avec elle — voir evaluateCardCompatibility dans recommend.ts.
  const [recentSwapOuts, setRecentSwapOuts] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autocomplétion débattue pendant la saisie. Le cas "requête trop courte"
  // est traité directement dans handleInputChange (réaction synchrone à la
  // saisie, pas un effet) : l'effet ne gère que la recherche différée.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      autocompleteCardName(q).then((names) => {
        if (!cancelled) setAutocomplete(names);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function selectCard(name: string) {
    setQuery(name);
    setAutocomplete([]);
    setNotFound(false);
    setLoadingPreview(true);
    const res = await evaluateCardForDeck(name, formatKey, currentCards, recentSwapOuts);
    setLoadingPreview(false);
    if (!res) {
      setPreview(null);
      setNotFound(true);
      return;
    }
    setPreview(res);
    const swapOutName = res.suggestion.swapOut?.name;
    if (swapOutName) {
      setRecentSwapOuts((prev) => [
        swapOutName,
        ...prev.filter((n) => n.toLowerCase() !== swapOutName.toLowerCase()),
      ].slice(0, 3));
    }
  }

  function handleInputChange(value: string) {
    setQuery(value);
    setPreview(null);
    setNotFound(false);
    if (value.trim().length < 2) setAutocomplete([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      selectCard(query.trim());
    }
    if (e.key === "Escape") {
      setAutocomplete([]);
    }
  }

  const suggestion = preview?.suggestion ?? null;
  const currentCount = suggestion ? (existingCounts.get(suggestion.card.name.toLowerCase()) ?? 0) : 0;
  const isBasicLand = suggestion?.card.type_line?.includes("Basic Land") ?? false;
  const atMaxCopies = !isBasicLand && currentCount >= maxCopies;

  const outOfColorIdentity =
    hasCommander && suggestion
      ? suggestion.card.color_identity.some((c) => !colorIdentity.includes(c))
      : false;

  const verdictStyle = suggestion?.verdict ? VERDICT_STYLES[suggestion.verdict] : null;
  // "Améliore le deck" est trompeur quand la carte est déjà au nombre
  // d'exemplaires maximum autorisés (donc déjà dans le deck, un cas qui se
  // confond avec "déjà présente" en Commander/Brawl où maxCopies = 1) —
  // demande de Ben du 26/08/2026. On ne touche pas aux verdicts "impact
  // limité"/"rôle non identifié", qui restent pertinents même pour une
  // carte déjà présente.
  const alreadyInDeck = atMaxCopies && suggestion?.verdict === "improve";

  return (
    <div>
      <p className="text-xs text-muted">
        Cherche une carte pour voir si elle améliorerait ton deck et quelle carte elle pourrait
        remplacer, avant de valider l&apos;ajout ou le swap.
      </p>

      <div className="relative mt-3">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nom d'une carte…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {autocomplete.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
            {autocomplete.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => selectCard(name)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-muted"
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {loadingPreview && <p className="mt-3 text-xs italic text-muted">Analyse en cours…</p>}

      {notFound && !loadingPreview && (
        <p className="mt-3 text-xs text-muted">
          Aucune carte trouvée pour « {query} ». Vérifie l&apos;orthographe.
        </p>
      )}

      {suggestion && !loadingPreview && (
        <div className="mt-3 flex items-start gap-3 rounded-lg border border-border p-3">
          {getDisplayImageUrl(suggestion.card, "small") && (
            <CardImageHover
              src={getDisplayImageUrl(suggestion.card, "small")!}
              zoomSrc={getDisplayImageUrl(suggestion.card, "large")}
              alt={suggestion.card.name}
              width={56}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{suggestion.card.name}</span>
              <ManaCost cost={getDisplayManaCost(suggestion.card)} />
            </div>
            <p className="mt-0.5 text-xs text-muted">{suggestion.card.type_line}</p>
            <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-foreground/80">
              {getDisplayOracleText(suggestion.card) || "—"}
            </p>

            {verdictStyle && (
              <span
                className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  alreadyInDeck ? "bg-surface-muted text-muted" : verdictStyle.className
                }`}
              >
                {alreadyInDeck ? "Déjà dans le deck" : verdictStyle.label}
              </span>
            )}
            <p className="mt-1.5 text-xs text-muted">{suggestion.reason}</p>

            {suggestion.categories.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {suggestion.categories.map((cat) => (
                  <span
                    key={cat}
                    className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent"
                  >
                    {CATEGORY_LABELS[cat] ?? cat}
                  </span>
                ))}
              </div>
            )}

            {suggestion.swapOut && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
                <span aria-hidden="true">⇄</span>
                <span>
                  À la place de{" "}
                  <span className="font-medium text-foreground/80">{suggestion.swapOut.name}</span>
                </span>
              </p>
            )}

            {!preview!.legal && (
              <p className="mt-2 text-[11px] font-medium text-warning">
                ⚠ Non légale en {formatLabel} (statut Scryfall : {preview!.legalityStatus}).
              </p>
            )}
            {outOfColorIdentity && (
              <p className="mt-1 text-[11px] font-medium text-warning">
                ⚠ Hors identité de couleur du commandant.
              </p>
            )}
            {atMaxCopies && (
              <p className="mt-1 text-[11px] text-muted">
                Déjà au maximum d&apos;exemplaires autorisés ({maxCopies}×) pour ce format.
              </p>
            )}

            <button
              type="button"
              onClick={() => onAddClick(suggestion)}
              disabled={addDisabled || atMaxCopies}
              title={
                suggestion.swapOut
                  ? `Swap : + ${suggestion.card.name} / − ${suggestion.swapOut.name}`
                  : undefined
              }
              className="mt-2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {suggestion.swapOut ? "⇄ Swap" : "+ Ajouter"}
              {currentCount > 0 ? ` (${currentCount}× déjà dans le deck)` : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
