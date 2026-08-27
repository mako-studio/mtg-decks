import Link from "next/link";
import { notFound } from "next/navigation";
import { TRACKED_SETS } from "@/data/tracked-sets";
import { loadSetChecklist, setTypeLabel } from "@/lib/sets";
import { formatFrenchDate } from "@/lib/text";
import { SetDetail } from "@/components/SetDetail";

// Rendu à la demande (pas de generateStaticParams), même raisonnement que
// /decks/[id] : précalculer les ~58 checklists complètes au build serait
// lent et dépendrait de la disponibilité de Scryfall pendant le build. Le
// cache `fetch` (24h, voir scryfall.ts) rend les visites suivantes rapides.
export default async function ExtensionDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  // On ne sert que les sets suivis par le site (portée choisie par Ben le
  // 26/08/2026) : un code arbitraire renvoie 404 plutôt que de déclencher
  // un appel Scryfall pour n'importe quel set jamais imprimé.
  const ref = TRACKED_SETS.find((s) => s.code === code);
  if (!ref) notFound();

  const checklist = await loadSetChecklist(code);
  const name = checklist.info?.name ?? ref.name;
  const releaseDate = checklist.info?.released_at ?? ref.releaseDate;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href="/extensions"
        className="mb-6 inline-block text-xs font-medium text-muted hover:text-foreground"
      >
        ← Extensions
      </Link>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            {checklist.info?.icon_svg_uri && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={checklist.info.icon_svg_uri}
                alt=""
                aria-hidden="true"
                className="h-6 w-6 dark:invert"
              />
            )}
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {setTypeLabel(checklist.info?.set_type)} · {formatFrenchDate(releaseDate)} ·{" "}
            <span className="uppercase">{code}</span>
          </p>
        </div>
        {checklist.info && (
          <p className="text-right text-xs text-muted">
            {checklist.info.card_count} carte{checklist.info.card_count > 1 ? "s" : ""} au total
            {checklist.info.block ? ` · bloc ${checklist.info.block}` : ""}
          </p>
        )}
      </div>

      {!checklist.info && (
        <p className="mb-6 rounded-lg border border-warning-soft bg-warning-soft p-3 text-xs text-warning">
          Impossible de récupérer les métadonnées à jour de ce set auprès de Scryfall — affichage
          basé sur les informations connues localement.
        </p>
      )}

      {checklist.truncated && (
        <p className="mb-6 rounded-lg border border-warning-soft bg-warning-soft p-3 text-xs text-warning">
          Ce set contient beaucoup de cartes ({checklist.info?.card_count} au total) : la liste
          ci-dessous ({checklist.cards.length} cartes) peut être incomplète.
        </p>
      )}

      {checklist.cards.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-muted">
          Aucune carte récupérée pour ce set — Scryfall est peut-être temporairement indisponible,
          réessaie plus tard.
        </p>
      ) : (
        <SetDetail mechanics={checklist.mechanics} cards={checklist.cards} note={checklist.note} />
      )}
    </div>
  );
}
