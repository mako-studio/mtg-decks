import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Commander Booster — Améliorez vos decks Commander & MTG Arena",
  description:
    "Partez d'un deck préconstruit (Commander papier ou Arena) ou importez le vôtre, trouvez les cartes qui l'améliorent et visualisez le gain de puissance.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-foreground text-sm font-bold">
                C
              </span>
              <span>Commander Booster</span>
            </Link>
            <nav className="flex gap-5 text-sm text-muted">
              <Link href="/" className="hover:text-foreground transition-colors">
                Commander (papier)
              </Link>
              <Link href="/arena" className="hover:text-foreground transition-colors">
                MTG Arena
              </Link>
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
      </body>
    </html>
  );
}
