import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { LanguageProvider, LanguageToggle } from "@/components/LanguageProvider";

export const metadata: Metadata = {
  title: "MTG Opti — Améliorez vos decks Commander & MTG Arena",
  description:
    "Partez d'un deck préconstruit (Commander papier ou Arena) ou importez le vôtre, trouvez les cartes qui l'améliorent et visualisez le gain de puissance.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <LanguageProvider>
          <header className="border-b border-border">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect x="1.5" y="9" width="3" height="5.5" rx="1" fill="currentColor" />
                    <rect x="6.5" y="5.5" width="3" height="9" rx="1" fill="currentColor" />
                    <rect x="11.5" y="2" width="3" height="12.5" rx="1" fill="currentColor" />
                  </svg>
                </span>
                <span>MTG Opti</span>
              </Link>
              <nav className="flex items-center gap-5 text-sm text-muted">
                <Link href="/" className="hover:text-foreground transition-colors">
                  Commander (papier)
                </Link>
                <Link href="/arena" className="hover:text-foreground transition-colors">
                  MTG Arena
                </Link>
                <Link href="/extensions" className="hover:text-foreground transition-colors">
                  Extensions
                </Link>
                <Link href="/glossaire" className="hover:text-foreground transition-colors">
                  Glossaire
                </Link>
                <span
                  className="hidden h-4 w-px bg-border sm:inline-block"
                  aria-hidden="true"
                />
                <span className="flex items-center gap-2">
                  <span className="hidden text-xs text-muted sm:inline">Langue des cartes :</span>
                  <LanguageToggle />
                </span>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-border py-6 text-center text-xs text-muted">
            Données de cartes fournies par{" "}
            <a
              className="underline hover:text-foreground"
              href="https://scryfall.com"
              target="_blank"
              rel="noreferrer"
            >
              Scryfall
            </a>
            . Decklists préconstruites issues du dataset communautaire{" "}
            <a
              className="underline hover:text-foreground"
              href="https://github.com/taw/magic-preconstructed-decks-data"
              target="_blank"
              rel="noreferrer"
            >
              magic-preconstructed-decks-data
            </a>
            . Magic: The Gathering est une marque de Wizards of the Coast.
          </footer>
        </LanguageProvider>
      </body>
    </html>
  );
}
