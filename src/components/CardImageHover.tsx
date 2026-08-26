"use client";

import { useState } from "react";

/**
 * Vignette de carte qui affiche l'image en grand format au survol (souris),
 * pour mieux lire le texte/l'illustration sans avoir à déplier la carte.
 * `position: fixed` plutôt qu'`absolute` : échappe aux conteneurs parents
 * en `overflow-hidden` (les cartes de deck/suggestion en ont) tant qu'aucun
 * ancêtre ne pose de `transform`/`filter` (ce n'est pas le cas ici).
 * Purement au survol — pas de gestion tactile, conforme à la demande.
 */
export function CardImageHover({
  src,
  zoomSrc,
  alt,
  width,
  className = "",
}: {
  src: string;
  zoomSrc: string | null;
  alt: string;
  width: number;
  className?: string;
}) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const zoomWidth = 280;
  const zoomMaxHeight = 400;

  return (
    <span
      className="relative inline-block shrink-0 leading-none"
      onMouseEnter={(e) => {
        if (!zoomSrc) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = rect.right + 12;
        if (left + zoomWidth > vw - 8) left = rect.left - zoomWidth - 12;
        if (left < 8) left = 8;
        let top = rect.top;
        if (top + zoomMaxHeight > vh - 8) top = Math.max(8, vh - zoomMaxHeight - 8);
        setPos({ left, top });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={width} className={`h-auto rounded ${className}`} />
      {pos && zoomSrc && (
        <span
          className="pointer-events-none fixed z-50 block rounded-xl border border-border bg-surface p-1.5 shadow-2xl"
          style={{ left: pos.left, top: pos.top, width: zoomWidth }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomSrc} alt={alt} className="h-auto w-full rounded-lg" />
        </span>
      )}
    </span>
  );
}
