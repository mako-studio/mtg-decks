"use client";

import { useState } from "react";

export function ArenaExportButton({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API indisponible (permissions, contexte non sécurisé...) :
      // la zone de texte ci-dessous reste le repli pour copier à la main.
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted">Export Arena</h3>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-medium text-accent hover:underline"
        >
          {open ? "Masquer" : "Afficher"}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <textarea
            readOnly
            value={text}
            rows={10}
            className="w-full resize-none rounded-lg border border-border bg-surface-muted p-2 font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={copy}
            className="w-full rounded-lg bg-accent py-2 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90"
          >
            {copied ? "Copié !" : "Copier (à coller dans le client Arena)"}
          </button>
          <p className="text-xs text-muted">
            Les cartes non trouvées sur Scryfall sont exclues de l&apos;export.
          </p>
        </div>
      )}
    </div>
  );
}
