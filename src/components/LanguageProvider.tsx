"use client";

import { createContext, useContext, useState } from "react";

type Lang = "fr" | "en";

const LanguageContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "fr",
  setLang: () => {},
});

/**
 * Bascule FR/EN pour le texte des cartes (oracle text + type). Ne change
 * jamais les données utilisées par le moteur de score/suggestions ni les
 * noms de cartes (qui restent la clé canonique anglaise partout ailleurs
 * dans l'app — CSV, export Arena, ajout/retrait) : c'est purement
 * l'affichage dans les panneaux dépliés de CardTile/SuggestionCard qui
 * change, via une traduction récupérée à la demande (voir fetchLocalizedText).
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("fr");
  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  return (
    <div className="inline-flex rounded-full border border-border p-0.5 text-xs">
      {(["fr", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`rounded-full px-2.5 py-1 font-medium uppercase transition-colors ${
            lang === l ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
          }`}
          aria-pressed={lang === l}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
