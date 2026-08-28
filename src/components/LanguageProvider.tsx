"use client";

import { createContext, useContext, useState } from "react";

type Lang = "fr" | "en";

const LanguageContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "fr",
  setLang: () => {},
});

/**
 * Bascule FR/EN pour le texte des cartes (oracle text + type), affiché dans
 * les panneaux dépliés de CardTile/SuggestionCard via une traduction
 * récupérée à la demande (voir fetchLocalizedText). Ne change jamais les
 * données utilisées par le moteur de score/suggestions ni les noms de
 * cartes stockés dans le deck (qui restent la clé canonique anglaise
 * partout ailleurs dans l'app — CSV, export Arena, ajout/retrait).
 *
 * Depuis le 28/08/2026 (demande de Ben), cette même langue pilote aussi la
 * recherche manuelle de carte ("Tester une carte", voir AddCardSearch.tsx) :
 * en mode FR, taper un nom français retrouve la carte via son impression
 * française plutôt que via son nom anglais canonique. Un message dans
 * AddCardSearch rappelle explicitement cette dépendance à l'utilisateur,
 * avec un raccourci pour changer de langue sans remonter jusqu'ici.
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
