/**
 * Rapprochement des noms de cartes entre sources (04/10/2026).
 *
 * Bug mesuré avec la liste de Ben : mtgtop8 écrit « Lorien Revealed »,
 * Scryfall « Lórien Revealed ». Comparées en minuscules seulement, les deux
 * ne se retrouvaient pas : la carte (26 % des decks de tournoi bleus, 92 % des
 * decks Vivi Ornitier) était lue comme « jamais vue en tournoi ». Dix cartes
 * de l'archive étaient dans ce cas ; d'autres clés portent un caractère
 * abîmé à la place de la lettre accentuée (« D�in Ironfoot »).
 *
 * Deux clés, essayées dans cet ordre :
 * - `foldName` : minuscules, accents retirés (ó → o) ;
 * - `skeletonName` : minuscules, tout caractère non ASCII retiré — rattrape
 *   les clés abîmées (« D�in » et « Dáin » donnent tous deux « din »).
 */
export function foldName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function skeletonName(name: string): string {
  return name.toLowerCase().replace(/[^\x00-\x7f]/g, "");
}

/** Index nom → valeur tolérant aux accents. La première valeur enregistrée pour une clé gagne. */
export class NameIndex<V> {
  private readonly exact = new Map<string, V>();
  private readonly loose = new Map<string, V>();

  constructor(entries?: Iterable<readonly [string, V]>) {
    if (entries) for (const [k, v] of entries) this.set(k, v);
  }

  set(name: string, value: V): void {
    const folded = foldName(name);
    if (!this.exact.has(folded)) this.exact.set(folded, value);
    const skeleton = skeletonName(name);
    if (skeleton !== folded && !this.loose.has(skeleton)) this.loose.set(skeleton, value);
  }

  get(name: string): V | undefined {
    const folded = foldName(name);
    const hit = this.exact.get(folded);
    if (hit !== undefined) return hit;
    // Seulement si l'un des deux noms porte un caractère non ASCII : sinon deux noms ASCII différents ne se confondent jamais.
    const skeleton = skeletonName(name);
    return this.loose.get(skeleton) ?? (skeleton !== name.toLowerCase() ? this.exact.get(skeleton) : undefined);
  }

  /** Clés enregistrées (minuscules, sans accents). */
  keys(): IterableIterator<string> {
    return this.exact.keys();
  }

  has(name: string): boolean {
    return this.get(name) !== undefined;
  }
}
