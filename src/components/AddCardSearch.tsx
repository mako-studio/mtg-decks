"use client";

import { useEffect, useRef, useState } from "react";
import type { ScryfallCard } from "@/lib/types";
import { autocompleteCardName, searchCardToAdd, type CardSearchResult } from "@/lib/actions";
import { getDisplayImageUrl, getDisplayManaCost, getDisplayOracleText } from "@/lib/scryfall";
import { ManaCost } from "./ManaCost";
import { CardImageHover } from "./CardImageHover";

/**
 * Recherche manuelle d'une carte à ajouter au deck, en dehors des
 * suggestions automatiques. Autocomplétion pendant la saisie
 * (`/cards/autocomplete`), puis aperçu complet (image, coût de mana,
 * légalité dans le format en cours) avant confirmation d'ajout.
 *
 * Contrairement aux suggestions, aucun filtre de légalité ou d'identité de
 * couleur n'est appliqué en amont : l'utilisateur peut chercher et
 * ajouter n'importe quelle carte existante. On l'informe simplement par
 * un badge si la carte n'est pas légale dans le format, ou hors identité
 * de couleur du commandant — sans le lui interdire (c'est son deck).
 */
export function AddCardSearch({
  formatKey,
  formatLabel,
  maxCopies,
  hasCommander,
  colorIdentity,
  existingCounts,
  onAdd,
  addDisabled = false,
}: {
  formatKey: string;
  formatLabel: string;
  maxCopies: number;
  hasCommander: boolean;
  /** Identité de couleur du deck (commandant·s) — ignorée si `hasCommander` est faux. */
  colorIdentity: string[];
  /** Nombre d'exemplaires déjà dans le deck, par nom en minuscule. */
  existingCounts: Map<string, number>;
  onAdd: (card: ScryfallCard) => void;
  addDisabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [preview, setPreview] = useState<CardSearchResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [notFound, setNotFound] = useState(false);
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
        if (!cancelled) setSuggestions(names);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function selectCard(name: string) {
    setQuery(name);
    setSuggestions([]);
    setNotFound(false);
    setLoadingPreview(true);
    const res = await searchCardToAdd(name, formatKey);
    setLoadingPreview(false);
    if (!res) {
      setPreview(null);
      setNotFound(true);
      return;
    }
    setPreview(res);
  }

  function handleInputChange(value: string) {
    setQuery(value);
    setPreview(null);
    setNotFound(false);
    if (value.trim().length < 2) setSuggestions([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      selectCard(query.trim());
    }
    if (e.key === "Escape") {
      setSuggestions([]);
    }
  }

  const currentCount = preview ? (existingCounts.get(preview.card.name.toLowerCase()) ?? 0) : 0;
  const isBasicLand = preview?.card.type_line?.includes("Basic Land") ?? false;
  const atMaxCopies = !isBasicLand && currentCount >= maxCopies;

  const outOfColorIdentity =
    hasCommander && preview
      ? preview.card.color_identity.some((c) => !colorIdentity.includes(c))
      : false;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="text-sm font-medium text-muted">Ajouter une carte</h3>
      <p className="mt-1 text-xs text-muted">
        Cherche n&apos;importe quelle carte à ajouter au deck, en dehors des suggestions.
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
        {suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
            {suggestions.map((name) => (
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

      {loadingPreview && <p className="mt-3 text-xs italic text-muted">Recherche…</p>}

      {notFound && !loadingPreview && (
        <p className="mt-3 text-xs text-muted">
          Aucune carte trouvée pour « {query} ». Vérifie l&apos;orthographe.
        </p>
      )}

      {preview && !loadingPreview && (
        <div className="mt-3 flex items-start gap-3 rounded-lg border border-border p-3">
          {getDisplayImageUrl(preview.card, "small") && (
            <CardImageHover
              src={getDisplayImageUrl(preview.card, "small")!}
              zoomSrc={getDisplayImageUrl(preview.card, "large")}
              alt={preview.card.name}
              width={56}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{preview.card.name}</span>
              <ManaCost cost={getDisplayManaCost(preview.card)} />
            </div>
            <p className="mt-0.5 text-xs text-muted">{preview.card.type_line}</p>
            <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-foreground/80">
              {getDisplayOracleText(preview.card) || "—"}
            </p>

            {!preview.legal && (
              <p className="mt-2 text-[11px] font-medium text-warning">
                ⚠ Non légale en {formatLabel} (statut Scryfall : {preview.legalityStatus}).
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
              onClick={() => onAdd(preview.card)}
              disabled={addDisabled || atMaxCopies}
              className="mt-2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:opacity-90 disabled:opacity-50"
            >
              + Ajouter{currentCount > 0 ? ` (${currentCount}× déjà dans le deck)` : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
