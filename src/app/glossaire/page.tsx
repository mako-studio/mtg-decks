import { GLOSSARY_TERMS } from "@/data/glossary";
import { GlossaryBrowser } from "@/components/GlossaryBrowser";

export default async function GlossairePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Glossaire</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Termes Magic: The Gathering expliqués en français, avec leur équivalent anglais —
          capacités mot-clé courantes et vocabulaire de deckbuilding/Commander. Chaque entrée
          indique sa source ; les traductions non confirmées officiellement sont signalées.
        </p>
      </div>
      <GlossaryBrowser terms={GLOSSARY_TERMS} initialQuery={sp.q ?? ""} />
    </div>
  );
}
