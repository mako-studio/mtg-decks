import type { ScryfallCard } from "./types";
import { getDisplayOracleText } from "./scryfall";

/**
 * Duos de commandants (25/09/2026, demande de Ben : « gère les duos de
 * partenaires »). Règles Commander officielles couvertes (règle 702.124 et
 * mécaniques apparentées) :
 * - « Partner » : deux cartes qui ont chacune Partner (sans précision) ;
 * - « Partner with <nom> » : UNIQUEMENT avec la carte nommée ;
 * - « Partner—<groupe> » (variantes récentes, ex. « Partner—Survivors ») :
 *   avec une autre carte du MÊME groupe ;
 * - « Friends forever » : avec une autre carte Friends forever ;
 * - « Choose a Background » : avec une carte Background (enchantement
 *   légendaire — Background), qui ne peut être commandant qu'ainsi ;
 * - « Doctor's companion » : avec une créature « Time Lord Doctor ».
 * Détection : champ `keywords` de Scryfall quand il est présent, sinon texte
 * oracle (première ligne de capacité). Une formulation future inédite ne
 * serait pas reconnue — la carte serait simplement traitée comme
 * commandant seul.
 */

export type PartnerKind =
  | { kind: "partner" }
  | { kind: "partnerWith"; name: string }
  | { kind: "group"; group: string }
  | { kind: "friends" }
  | { kind: "chooseBackground" }
  | { kind: "background" }
  | { kind: "doctorsCompanion" }
  | { kind: "doctor" };

export function partnerKinds(card: ScryfallCard): PartnerKind[] {
  const text = getDisplayOracleText(card);
  const keywords = (card.keywords ?? []).map((k) => k.toLowerCase());
  const type = card.type_line ?? "";
  const out: PartnerKind[] = [];

  const withMatch = text.match(/(?:^|\n)Partner with ([^(\n]+?)\s*(?:\(|\n|$)/);
  const groupMatch = text.match(/(?:^|\n)Partner\s*[—-]\s*([^(\n]+?)\s*(?:\(|\n|$)/);
  if (withMatch) out.push({ kind: "partnerWith", name: withMatch[1].trim() });
  else if (groupMatch) out.push({ kind: "group", group: groupMatch[1].trim().toLowerCase() });
  else if (keywords.includes("partner") || /(?:^|\n)Partner\s*(?:\(|\n|$)/.test(text)) out.push({ kind: "partner" });

  if (keywords.includes("friends forever") || /(?:^|\n)Friends forever/i.test(text)) out.push({ kind: "friends" });
  if (keywords.includes("choose a background") || /Choose a Background/i.test(text)) out.push({ kind: "chooseBackground" });
  if (type.includes("Background")) out.push({ kind: "background" });
  if (keywords.includes("doctor's companion") || /Doctor's companion/i.test(text)) out.push({ kind: "doctorsCompanion" });
  if (/Time Lord Doctor/.test(type)) out.push({ kind: "doctor" });
  return out;
}

/** La carte peut-elle faire partie d'un duo (partenaire, Background, Doctor...) ? */
export function canHavePartner(card: ScryfallCard): boolean {
  return partnerKinds(card).length > 0;
}

/** Les deux cartes peuvent-elles être commandants ENSEMBLE ? (symétrique) */
export function canPair(a: ScryfallCard, b: ScryfallCard): boolean {
  if (a.name === b.name) return false;
  const ka = partnerKinds(a);
  const kb = partnerKinds(b);
  const has = (ks: PartnerKind[], kind: PartnerKind["kind"]) => ks.some((k) => k.kind === kind);
  const lower = (s: string) => s.toLowerCase();

  // Partner with <nom> : uniquement la carte nommée (dans un sens ou l'autre).
  const aWith = ka.find((k) => k.kind === "partnerWith") as { kind: "partnerWith"; name: string } | undefined;
  const bWith = kb.find((k) => k.kind === "partnerWith") as { kind: "partnerWith"; name: string } | undefined;
  if (aWith && lower(aWith.name) === lower(b.name)) return true;
  if (bWith && lower(bWith.name) === lower(a.name)) return true;

  if (has(ka, "partner") && has(kb, "partner")) return true;
  const ga = ka.find((k) => k.kind === "group") as { kind: "group"; group: string } | undefined;
  const gb = kb.find((k) => k.kind === "group") as { kind: "group"; group: string } | undefined;
  if (ga && gb && ga.group === gb.group) return true;
  if (has(ka, "friends") && has(kb, "friends")) return true;
  if ((has(ka, "chooseBackground") && has(kb, "background")) || (has(kb, "chooseBackground") && has(ka, "background"))) {
    return true;
  }
  if ((has(ka, "doctorsCompanion") && has(kb, "doctor")) || (has(kb, "doctorsCompanion") && has(ka, "doctor"))) return true;
  return false;
}

/** Libellé court du type d'association, pour l'UI. */
export function pairLabel(a: ScryfallCard, b: ScryfallCard): string {
  const ka = partnerKinds(a).map((k) => k.kind);
  const kb = partnerKinds(b).map((k) => k.kind);
  if (ka.includes("background") || kb.includes("background")) return "Background";
  if (ka.includes("friends") && kb.includes("friends")) return "Friends forever";
  if (ka.includes("doctor") || kb.includes("doctor")) return "Doctor's companion";
  if (ka.includes("partnerWith") || kb.includes("partnerWith")) return "Partner with";
  return "Partner";
}
