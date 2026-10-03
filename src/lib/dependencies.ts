import type { ScryfallCard } from "./types";
import { getDisplayOracleText } from "./scryfall";

/**
 * DÉPENDANCES d'une carte envers le reste du deck (03/10/2026, signalement
 * de Ben : « The Eleventh Hour » — « cherchez une carte de docteur » —
 * retenue dans un deck qui ne contient qu'un seul Docteur).
 *
 * Le moteur classait cette saga « Tutor » (deck-score.ts), ce qui rapporte
 * des points de tier, sans regarder si le deck contient de quoi chercher.
 * Même défaut pour toute carte dont la valeur dépend d'AUTRES cartes
 * précises. Ce module lit trois sortes de dépendances dans le texte :
 *
 * 1. RECHERCHE TYPÉE — « search your library for a Doctor card », « an
 *    Equipment card », « an Aura or Equipment card », « a planeswalker
 *    card » : il faut assez de cibles dans la bibliothèque.
 * 2. CARTE NOMMÉE — « search your library for a card named X » : il faut X.
 * 3. TRIBU — « other Elves you control », « Doctor spells you cast cost {1}
 *    less », « for each Zombie you control » : il faut des membres.
 *
 * Conséquence dans le constructeur (competitive-builder.ts) :
 * - dépendance 1 ou 2 non satisfaite sur un sort, une saga, un artefact, un
 *   enchantement → la carte est ÉCARTÉE et le deck reconstruit sans elle
 *   (une recherche sans cible ne fait rien) ;
 * - même cas sur une créature ou un planeswalker, ou dépendance 3 mal
 *   satisfaite → simple MALUS : la carte peut valoir pour autre chose.
 *
 * Seuils (choix de conception, pas des mesures) : 3 cibles pour un type de
 * créature, 2 pour un type d'objet (Équipement, Aura, Véhicule...) ou un
 * type de carte, 1 pour une carte nommée ; 4 membres pour une tribu.
 * Le moteur ne juge PAS la qualité des cibles : trois Docteurs médiocres
 * satisfont la règle. Les recherches de terrains ne sont pas concernées
 * (c'est de la rampe, toujours servie par les terrains de base).
 *
 * Motifs sur le texte oracle anglais : une formulation inhabituelle peut
 * échapper à la lecture (la carte est alors traitée comme avant).
 */

const BASIC_OR_LAND = /\b(basic|lands?|Plains|Islands?|Swamps?|Mountains?|Forests?|Wastes|Deserts?|Gates?|Caves?|Locus|Sphere)\b/;
const CARD_TYPES = ["artifact", "enchantment", "planeswalker", "instant", "sorcery", "battle"];
/** Sous-types qui ne sont pas des types de créature : deux cibles suffisent. */
const OBJECT_SUBTYPES = new Set(["Equipment", "Aura", "Vehicle", "Curse", "Shrine", "Saga", "Room", "Trap", "Arcane", "Lesson", "Food", "Plan", "Mount", "Background", "Class", "Case"]);
/** Mots à majuscule qui ne sont pas des types de créature dans les motifs de tribu. */
const NOT_A_TRIBE = new Set([
  "Creature", "Creatures", "Artifact", "Artifacts", "Enchantment", "Enchantments", "Instant", "Sorcery", "Planeswalker", "Planeswalkers",
  "Land", "Lands", "Permanent", "Permanents", "Noncreature", "Nonland", "Nontoken", "Legendary", "Historic", "Colorless", "Multicolored",
  "White", "Blue", "Black", "Red", "Green", "Token", "Tokens", "Spell", "Spells", "Card", "Cards", "Other", "Each", "Another", "Target",
  "Basic", "Snow", "Attacking", "Blocking", "Tapped", "Untapped", "Enchanted", "Equipped", "Kindred", "The", "This", "That", "Those",
  "These", "Whenever", "When", "If", "At", "As", "You", "Your", "All", "Treasure", "Treasures", "Food", "Clue", "Clues", "Plains", "Island",
  "Islands", "Swamp", "Swamps", "Mountain", "Mountains", "Forest", "Forests", "Jace", "Jaces", "Garruk",
  // Relevés au balayage de toutes les cartes (03/10/2026) : faux positifs des motifs de tribu.
  "Enchant", "Then", "Modified", "Commander", "Commanders", "Gate", "Gates", "Cave", "Caves", "Town", "Towns", "Desert", "Deserts",
  "Locus", "Vehicles", "Shrines", "Auras", "Sagas", "Mounts", "Rune", "Runes", "Powerstone", "Powerstones", "Spacecraft",
]);

export interface TypeAlternative {
  /** Sous-types exigés (« Doctor », « Equipment »), casse d'origine. */
  subtypes: string[];
  /** Types de carte exigés, en minuscules (« artifact », « planeswalker »). */
  types: string[];
}

export interface Dependency {
  kind: "search" | "named" | "tribe";
  /** Ce que la carte attend, en clair (affiché à Ben). */
  label: string;
  alternatives?: TypeAlternative[];
  names?: string[];
  /** Formes acceptées d'un type de créature (singulier, pluriel irrégulier). */
  tribe?: string[];
  min: number;
  /** true = sans cible, la carte ne fait rien : à écarter. false = simple malus. */
  hard: boolean;
}

function parseAlternatives(descriptor: string): TypeAlternative[] | null {
  // Recherche de terrain : pas une dépendance (rampe).
  if (BASIC_OR_LAND.test(descriptor)) return null;
  const terms = descriptor
    .split(/,|\bor\b|\band\/or\b/)
    .map((t) => t.trim())
    .filter(Boolean);
  const alternatives: TypeAlternative[] = [];
  for (const term of terms) {
    const subtypes = (term.match(/\b[A-Z][A-Za-z-]+\b/g) ?? []).filter((w) => !NOT_A_TRIBE.has(w) || OBJECT_SUBTYPES.has(w));
    const types = CARD_TYPES.filter((t) => new RegExp(`\\b${t}\\b`, "i").test(term));
    // « creature », « permanent », « green creature », « card » : cibles en abondance, aucune contrainte.
    if (subtypes.length === 0 && types.length === 0) return null;
    alternatives.push({ subtypes, types });
  }
  return alternatives.length ? alternatives : null;
}

/** Formes d'un mot tribal lu au pluriel : « Elves » → Elf, « Zombies » → Zombie, « Sphinxes » → Sphinx. */
function tribeForms(word: string): string[] {
  const forms = new Set([word]);
  if (word.endsWith("ves")) forms.add(`${word.slice(0, -3)}f`);
  if (word.endsWith("ies")) forms.add(`${word.slice(0, -3)}y`);
  if (word.endsWith("es")) forms.add(word.slice(0, -2));
  if (word.endsWith("s")) forms.add(word.slice(0, -1));
  return Array.from(forms);
}

const cache = new Map<string, Dependency[]>();

export function cardDependencies(card: ScryfallCard): Dependency[] {
  const hit = cache.get(card.name);
  if (hit) return hit;
  const text = getDisplayOracleText(card).replace(/\([^)]*\)/g, " ");
  const out: Dependency[] = [];
  // Une créature ou un planeswalker garde un corps ou d'autres capacités quand
  // sa recherche est sans cible : malus et non exclusion.
  const hard = !/\b(Creature|Planeswalker)\b/.test((card.type_line ?? "").split(" // ")[0]);

  // 1. Recherche typée.
  for (const m of text.matchAll(/[Ss]earch your library for (?:a|an|up to (?:one|two|three|four|x|X)) ([^.]*?)cards?\b/g)) {
    const descriptor = m[1].trim();
    if (!descriptor || /\bnamed\b/.test(m[0])) continue;
    const alternatives = parseAlternatives(descriptor);
    if (!alternatives) continue;
    const creatureType = alternatives.every((a) => a.subtypes.some((s) => !OBJECT_SUBTYPES.has(s)));
    out.push({ kind: "search", label: `cherche une carte « ${descriptor} »`, alternatives, min: creatureType ? 3 : 2, hard });
  }

  // 2. Carte nommée (hors son propre nom : voir hasDeadSingletonSynergy dans deck-score.ts).
  const own = card.name.split(" // ")[0];
  for (const m of text.matchAll(/[Ss]earch your library[^.]*? cards? named ([A-Z][^.]*?)(?:,| and (?:put|reveal)|\.| from | put | reveal )/g)) {
    const names = m[1]
      .split(/ and\/or | or | and /)
      .map((n) => n.replace(/^(?:a )?cards? named /, "").trim())
      // « card named Forest » : les terrains de base sont toujours fournis.
      .filter((n) => n && n !== own && !BASIC_OR_LAND.test(n));
    if (names.length) out.push({ kind: "named", label: `cherche ${names.join(" ou ")}`, names, min: 1, hard });
  }

  // 3. Tribu récompensée. Les jetons créés (« create a 1/1 Human token ») et « Doctor's companion » ne comptent pas.
  const tribal = text.replace(/[Cc]reates? [^.]*?tokens?/g, " ").replace(/\b[A-Z][a-z]+'s companion\b/g, " ");
  const seen = new Set<string>();
  const patterns = [
    /\b(?:other|another|each other|each|for each|number of) ([A-Z][a-z]+) (?:you control|creatures? you control|spells?|cards?)\b/g,
    /\b([A-Z][a-z]+) (?:spells?|cards?) you cast\b/g,
    /\b([A-Z][a-z]+) you control (?:get|have|gain)\b/g,
    /\b([A-Z][a-z]+) creatures? you control\b/g,
  ];
  for (const re of patterns) {
    for (const m of tribal.matchAll(re)) {
      const word = m[1];
      if (NOT_A_TRIBE.has(word) || OBJECT_SUBTYPES.has(word) || /^Non/.test(word)) continue;
      const forms = tribeForms(word);
      if (forms.some((f) => NOT_A_TRIBE.has(f) || OBJECT_SUBTYPES.has(f))) continue;
      const key = forms[forms.length - 1];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: "tribe", label: `récompense les ${word}`, tribe: forms, min: 4, hard: false });
    }
  }

  if (cache.size > 40000) cache.clear();
  cache.set(card.name, out);
  return out;
}

const hasWord = (typeLine: string, word: string) => new RegExp(`\\b${word}\\b`).test(typeLine);

function matchesAlternative(card: ScryfallCard, alt: TypeAlternative): boolean {
  const typeLine = card.type_line ?? "";
  const lower = typeLine.toLowerCase();
  return alt.subtypes.every((s) => hasWord(typeLine, s)) && alt.types.every((t) => lower.includes(t));
}

export interface UnmetDependency {
  name: string;
  dependency: Dependency;
  have: number;
  /** Phrase prête à afficher. */
  reason: string;
}

/**
 * Dépendances non satisfaites dans un deck. `cards` : les cartes de la
 * bibliothèque (hors commandants) ; `commanders` comptent pour une tribu
 * (ils sont en jeu) mais pas comme cible d'une recherche (ils ne sont pas
 * dans la bibliothèque).
 */
export function unmetDependencies(cards: readonly ScryfallCard[], commanders: readonly ScryfallCard[]): UnmetDependency[] {
  const out: UnmetDependency[] = [];
  const names = new Set(cards.map((c) => c.name.split(" // ")[0].toLowerCase()));
  for (const card of cards) {
    for (const dep of cardDependencies(card)) {
      let have = 0;
      if (dep.kind === "search" && dep.alternatives) {
        for (const other of cards) if (other !== card && dep.alternatives.some((a) => matchesAlternative(other, a))) have++;
      } else if (dep.kind === "named" && dep.names) {
        // « named Chandra, Flame's Fury » est lu jusqu'à la virgule : on accepte le nom exact ou « Chandra, ... ».
        const list = Array.from(names);
        have = dep.names.filter((n) => names.has(n.toLowerCase()) || list.some((d) => d.startsWith(`${n.toLowerCase()},`))).length;
      } else if (dep.kind === "tribe" && dep.tribe) {
        for (const other of [...cards, ...commanders]) {
          if (other === card) continue;
          // Membre de la tribu, ou carte qui en crée (« create a Thopter token ») : les jetons comptent.
          const makes = /\bcreates?\b/i.test(other.oracle_text ?? "") ? getDisplayOracleText(other) : "";
          if (dep.tribe.some((f) => hasWord(other.type_line ?? "", f) || (makes !== "" && hasWord(makes, f)))) have++;
        }
      }
      if (have >= dep.min) continue;
      const what =
        dep.kind === "tribe"
          ? `${dep.label}, mais le deck n'en compte que ${have} en dehors d'elle (repère : ${dep.min})`
          : dep.kind === "named"
            ? `${dep.label}, absente${(dep.names?.length ?? 0) > 1 ? "s" : ""} du deck`
            : `${dep.label}, mais le deck n'en contient ${have === 0 ? "aucune" : `que ${have}`} (minimum retenu : ${dep.min})`;
      out.push({ name: card.name, dependency: dep, have, reason: `${card.name} ${what}.` });
    }
  }
  return out;
}
