import type { GlossaryTerm, ScryfallCard, ScryfallSet } from "./types";
import { getSetCards, getSetCardsFrNames, getSetInfo } from "./scryfall";
import { GLOSSARY_TERMS } from "@/data/glossary";
import type { TrackedSetRef } from "@/data/tracked-sets";

/**
 * Logique "métier" pour la section Extensions (demande de Ben du
 * 26/08/2026) : combine les données brutes Scryfall (scryfall.ts) pour
 * produire, pour un set donné, sa checklist complète (EN + noms FR) et
 * ses "mécaniques" — voir la note ci-dessous sur pourquoi ces mécaniques
 * sont dérivées des données Scryfall plutôt que rédigées à la main.
 */

/** Une carte de la checklist d'un set, avec son nom français si disponible. */
export interface SetCardEntry {
  card: ScryfallCard;
  /** Nom imprimé français de cette impression précise, `null` si le set n'a pas d'impression française. */
  frName: string | null;
}

/**
 * Un mot-clé présent parmi les cartes d'un set, avec le nombre de cartes
 * concernées et — quand on a une entrée correspondante — le terme de
 * glossaire associé (traduction FR + définition).
 */
export interface SetMechanic {
  keyword: string;
  cardCount: number;
  glossary: GlossaryTerm | null;
}

export interface SetChecklist {
  code: string;
  info: ScryfallSet | null;
  cards: SetCardEntry[];
  mechanics: SetMechanic[];
  /**
   * `true` si la checklist récupérée est probablement incomplète (cas
   * réaliste : "sld"/Secret Lair Drop, qui agrège des milliers de cartes
   * disparates sous un seul code et peut dépasser la limite de pages
   * qu'on s'autorise à récupérer par prudence — voir
   * SET_CHECKLIST_MAX_PAGES dans scryfall.ts). Calculé en comparant le
   * nombre de cartes récupérées au `card_count` officiel du set : un
   * signal honnête plutôt qu'une simple supposition.
   */
  truncated: boolean;
}

/**
 * ⚠️ Choix de conception (mécaniques d'un set) : plutôt que de rédiger à
 * la main "les mécaniques introduites par ce set" — risqué factuellement
 * (beaucoup des ~58 sets suivis sont des produits Commander
 * préconstruits distincts du set d'extension qui a réellement introduit
 * une mécanique, ex. "Neon Dynasty Commander"/nec n'est pas "Kamigawa:
 * Neon Dynasty"/neo ; et il faudrait vérifier ~58 sets un par un pour
 * être sûr de ne rien avancer à tort) — les "mécaniques" affichées ici
 * sont calculées automatiquement à partir du champ `keywords` officiel
 * de chaque carte Scryfall (voir ScryfallCard.keywords dans types.ts) :
 * factuel et zéro risque d'invention, mais avec une nuance assumée et
 * affichée dans l'UI : ce sont les mots-clés PRÉSENTS dans les cartes de
 * CE set, pas nécessairement des mots-clés qu'il a introduits en
 * premier (certains peuvent réapparaître d'un set antérieur).
 */
function computeMechanics(cards: ScryfallCard[]): SetMechanic[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const keywords = card.keywords ?? [];
    for (const kw of keywords) {
      counts.set(kw, (counts.get(kw) ?? 0) + 1);
    }
  }

  const glossaryByKeyword = new Map<string, GlossaryTerm>();
  for (const term of GLOSSARY_TERMS) {
    glossaryByKeyword.set(term.termEn.toLowerCase(), term);
  }

  return Array.from(counts.entries())
    .map(([keyword, cardCount]) => ({
      keyword,
      cardCount,
      glossary: glossaryByKeyword.get(keyword.toLowerCase()) ?? null,
    }))
    .sort((a, b) => b.cardCount - a.cardCount || a.keyword.localeCompare(b.keyword));
}

/**
 * Charge la checklist complète d'un set : métadonnées, cartes (EN) avec
 * nom FR si disponible, et mécaniques dérivées. Les trois appels réseau
 * (métadonnées + 2 recherches paginées) sont lancés en parallèle : le
 * throttle global de scryfall.ts (~9 req/s) reste respecté même en
 * concurrence, puisque chaque requête passe par le même verrou avant
 * d'être émise (voir throttle() dans scryfall.ts) — seul le temps total
 * d'attente réseau est réduit par rapport à un enchaînement strictement
 * séquentiel.
 */
export async function loadSetChecklist(code: string): Promise<SetChecklist> {
  const [info, enCards, frNames] = await Promise.all([
    getSetInfo(code),
    getSetCards(code),
    getSetCardsFrNames(code),
  ]);

  const cards: SetCardEntry[] = enCards.map((card) => ({
    card,
    frName: frNames.get(card.collector_number) ?? null,
  }));

  const truncated = info ? enCards.length < info.card_count : false;

  return {
    code,
    info,
    cards,
    mechanics: computeMechanics(enCards),
    truncated,
  };
}

/**
 * Libellés français des `set_type` Scryfall (valeurs documentées sur
 * https://scryfall.com/docs/api/sets, vérifiées le 26/08/2026). Repli sur
 * le code brut si une nouvelle valeur apparaît un jour côté Scryfall.
 */
export const SET_TYPE_LABELS: Record<string, string> = {
  core: "Set de base",
  expansion: "Extension",
  masters: "Masters",
  eternal: "Eternal",
  alchemy: "Alchemy (Arena)",
  masterpiece: "Masterpiece",
  arsenal: "Arsenal",
  from_the_vault: "From the Vault",
  spellbook: "Spellbook",
  premium_deck: "Premium Deck",
  duel_deck: "Duel Deck",
  draft_innovation: "Innovation de draft",
  treasure_chest: "Treasure Chest",
  commander: "Commander (préconstruit)",
  planechase: "Planechase",
  archenemy: "Archenemy",
  vanguard: "Vanguard",
  funny: "Un-set / humoristique",
  starter: "Starter",
  box: "Coffret",
  promo: "Promotionnel",
  token: "Jetons",
  memorabilia: "Produit dérivé",
  minigame: "Mini-jeu",
};

export function setTypeLabel(setType: string | undefined): string {
  if (!setType) return "—";
  return SET_TYPE_LABELS[setType] ?? setType;
}

/** Résumé léger d'un set pour la page liste "/extensions" (pas de checklist de cartes). */
export interface TrackedSetSummary {
  code: string;
  name: string;
  releaseDate: string | null;
  cardCount: number | null;
  setType: string | undefined;
  iconUrl: string | undefined;
}

/**
 * Combine la référence locale (repli) et les métadonnées live Scryfall
 * (prioritaires si disponibles) pour un set — voir TRACKED_SETS dans
 * src/data/tracked-sets.ts pour la raison du repli local.
 */
export function buildSetSummary(ref: TrackedSetRef, info: ScryfallSet | null): TrackedSetSummary {
  return {
    code: ref.code,
    name: info?.name ?? ref.name,
    releaseDate: info?.released_at ?? ref.releaseDate,
    cardCount: info?.card_count ?? null,
    setType: info?.set_type,
    iconUrl: info?.icon_svg_uri,
  };
}
