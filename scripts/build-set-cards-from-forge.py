#!/usr/bin/env python3
"""
Construit src/data/recent-set-cards.json (cartes NOUVELLES d'une extension)
à partir du dépôt GitHub du projet Forge, quand Scryfall est inaccessible.

Pourquoi ce script (03/10/2026, Reality Fracture) : les environnements de dev
de Claude n'ont pas accès à api.scryfall.com (voir HANDOFF.md §5), alors que
github.com l'est. Forge (https://github.com/Card-Forge/forge) publie pour
chaque extension la liste de ses cartes (forge-gui/res/editions/<Nom>.txt)
et, pour chaque carte, un script contenant son coût, ses types et son texte
oracle (forge-gui/res/cardsfolder/<lettre>/<nom>.txt).

Usage :
  git clone --depth 1 --filter=blob:none --sparse https://github.com/Card-Forge/forge /tmp/forge
  git -C /tmp/forge sparse-checkout set forge-gui/res/editions forge-gui/res/cardsfolder
  python3 scripts/build-set-cards-from-forge.py /tmp/forge FRA FRC

Sur le Mac de Ben (accès Scryfall), préférer
`node scripts/fetch-set-cards.mjs fra frc` : mêmes champs, données Scryfall.

Une carte est « nouvelle » si son nom n'apparaît dans aucune édition Forge
datée d'avant la sortie de la première extension demandée.

Fidélité de la conversion, mesurée le 03/10/2026 sur les 4 074 cartes communes
avec analysis/duelcommander/cards-scryfall.json (données Scryfall réelles) :
coût converti et identité couleur identiques sur 100 % ; texte identique sur
61 %, les écarts venant de cartes ANCIENNES que Forge n'a pas reformulées
(« Academy Rector » au lieu de « this creature »). Non mesurable sur les
cartes de l'extension elle-même, faute d'accès à Scryfall.

Limites connues :
- `keywords` : seulement les mots-clés que Forge déclare (lignes K:), pas la
  liste complète de Scryfall (ni Landfall, ni Surveil...) ;
- `produced_mana` : déduit du texte (« Add {R} or {G} ») ;
- pas de légalités, prix, images ni rang EDHREC : le site redemande toujours
  ces cartes à Scryfall avant de les utiliser (voir src/lib/recent-sets.ts).
"""
import datetime
import glob
import json
import os
import re
import subprocess
import sys

SUPERTYPES = {"Legendary", "Basic", "Snow", "World", "Ongoing", "Host", "Elite"}
CARD_TYPES = {
    "Artifact", "Battle", "Creature", "Enchantment", "Instant", "Land",
    "Planeswalker", "Sorcery", "Kindred", "Tribal",
}
# Mots-clés Forge (lignes K:) qui existent tels quels chez Scryfall. Les
# autres (ETBReplacement, AlternateAdditionalCost...) sont internes à Forge.
KEYWORDS = {
    "Flying", "Trample", "Flash", "Vigilance", "Prowess", "Haste", "Deathtouch",
    "Menace", "Reach", "Ward", "Flashback", "Lifelink", "Equip", "Enchant",
    "First Strike", "Double Strike", "Indestructible", "Defender", "Convoke",
    "Hexproof", "Shroud", "Cycling", "Kicker", "Cascade", "Infect", "Toxic",
    "Madness", "Escape", "Unearth", "Dredge",
}
RARITY = {"C": "common", "U": "uncommon", "R": "rare", "M": "mythic", "L": "common", "S": "special"}
LAYOUT = {
    "DoubleFaced": "transform", "Modal": "modal_dfc", "Split": "split",
    "Adventure": "adventure", "Omen": "adventure", "Flip": "flip", "Meld": "meld",
    # Vu dans les données Scryfall réelles (cards-scryfall.json) : layout
    # « prepare », nom « Recto // Sort », mot-clé « Prepared ».
    "Prepare": "prepare",
}
LAND_COLOR = (("Plains", "W"), ("Island", "U"), ("Swamp", "B"), ("Mountain", "R"), ("Forest", "G"))
COLOR_WORD = {"white": "W", "blue": "U", "black": "B", "red": "R", "green": "G"}


def mana_cost(raw):
    """« 1 W U » → ("{1}{W}{U}", 3.0, {"W","U"}). Hybrides Forge : WU, 2W, WP."""
    if not raw or raw.lower() == "no cost":
        return "", 0.0, set()
    out, cmc, cols = [], 0.0, set()
    for tok in raw.split():
        if tok.isdigit():
            out.append("{%s}" % tok)
            cmc += int(tok)
        elif tok in ("X", "Y", "Z"):
            out.append("{%s}" % tok)
        elif tok in ("C", "S"):
            out.append("{%s}" % tok)
            cmc += 1
        else:
            out.append("{%s}" % "/".join(tok))
            cmc += 2 if tok[0] == "2" else 1
            cols |= {ch for ch in tok if ch in "WUBRG"}
    return "".join(out), cmc, cols


def type_line(raw):
    toks = raw.split()
    left = [t for t in toks if t in SUPERTYPES] + [t for t in toks if t in CARD_TYPES]
    sub = [t for t in toks if t not in SUPERTYPES and t not in CARD_TYPES]
    return " ".join(left) + (" — " + " ".join(sub) if sub else "")


def parse_face(lines):
    f = {"keywords": []}
    for ln in lines:
        if ":" not in ln:
            continue
        k, v = ln.split(":", 1)
        v = v.strip()
        if k == "Name":
            f["name"] = v
        elif k == "ManaCost":
            f["mana_raw"] = v
        elif k == "Types":
            f["type_line"] = type_line(v)
        elif k == "PT":
            f["power"], f["toughness"] = v.split("/")[0], v.split("/")[-1]
        elif k == "Loyalty":
            f["loyalty"] = v
        elif k == "Colors":
            f["colors_decl"] = [COLOR_WORD[c] for c in v.lower().split(",") if c in COLOR_WORD]
        elif k == "K":
            kw = v.split(":")[0].strip()
            if kw in KEYWORDS:
                f["keywords"].append(kw[0] + kw[1:].lower())
        elif k == "Oracle":
            f["oracle_text"] = v.replace("\\n", "\n").replace("’", "'")
        elif k == "AlternateMode":
            f["alt"] = v
    f["mana_cost"], f["cmc"], f["cost_colors"] = mana_cost(f.get("mana_raw"))
    return f


def land_subtypes(f):
    tl = f.get("type_line", "")
    return tl.split("—")[-1] if "Land" in tl and "—" in tl else ""


def identity(faces):
    ci = set()
    for f in faces:
        ci |= f["cost_colors"] | set(f.get("colors_decl", []))
        # Les symboles du texte de rappel (entre parenthèses) ne comptent pas.
        txt = re.sub(r"\([^)]*\)", "", f.get("oracle_text", ""))
        for sym in re.findall(r"\{([^}]+)\}", txt):
            ci |= {ch for ch in sym if ch in "WUBRG"}
        for land, c in LAND_COLOR:
            if re.search(r"\b%s\b" % land, land_subtypes(f)):
                ci.add(c)
    return [c for c in "WUBRG" if c in ci]


def produced(faces):
    pm = set()
    for f in faces:
        for land, c in LAND_COLOR:
            if re.search(r"\b%s\b" % land, land_subtypes(f)):
                pm.add(c)
        for m in re.finditer(r"[Aa]dd ([^.\n]*)", f.get("oracle_text", "")):
            seg = m.group(1)
            for sym in re.findall(r"\{([^}]+)\}", seg):
                pm |= {ch for ch in sym if ch in "WUBRGC"}
            if re.search(r"any (one )?(color|type)|different colors|any combination of colors|chosen color|that color", seg):
                pm |= set("WUBRG")
    return [c for c in "WUBRGC" if c in pm] or None


def parse_file(path):
    chunks, cur = [], []
    for ln in open(path, encoding="utf-8").read().splitlines():
        if ln.strip() == "ALTERNATE" or ln.startswith("SPECIALIZE:"):
            chunks.append(cur)
            cur = []
        else:
            cur.append(ln)
    chunks.append(cur)
    faces = [parse_face(c) for c in chunks if any(l.startswith("Name:") for l in c)]
    if not faces:
        return None
    alt = faces[0].get("alt")
    if alt == "Specialize":
        faces = faces[:1]
    layout = LAYOUT.get(alt, "normal") if len(faces) > 1 else "normal"
    front = faces[0]
    keywords = []
    for f in faces:
        for k in f["keywords"]:
            if k not in keywords:
                keywords.append(k)
    if layout == "prepare":
        keywords.append("Prepared")

    def colors(f):
        return f.get("colors_decl") or [c for c in "WUBRG" if c in f["cost_colors"]]

    card = {
        "name": " // ".join(f["name"] for f in faces),
        "layout": layout,
        "cmc": front["cmc"] + (faces[1]["cmc"] if layout == "split" else 0),
        "type_line": " // ".join(f.get("type_line", "") for f in faces),
        "colors": colors(front),
        "color_identity": identity(faces),
        "keywords": keywords,
        "produced_mana": produced(faces),
    }
    if len(faces) == 1:
        card["mana_cost"] = front["mana_cost"]
        card["oracle_text"] = front.get("oracle_text", "")
        for k in ("power", "toughness", "loyalty"):
            if k in front:
                card[k] = front[k]
    else:
        card["mana_cost"] = " // ".join(f["mana_cost"] for f in faces if f["mana_cost"])
        card["card_faces"] = [
            {k: f[k] for k in ("name", "mana_cost", "type_line", "oracle_text", "power", "toughness", "loyalty") if k in f}
            for f in faces
        ]
    return card


def load_cards(res):
    """Index nom → carte (nom complet « A // B » ET nom du recto)."""
    idx = {}
    for p in glob.glob(os.path.join(res, "cardsfolder", "*", "*.txt")):
        if os.sep + "rebalanced" + os.sep in p:  # versions Alchemy
            continue
        card = parse_file(p)
        if card:
            idx[card["name"]] = card
            idx.setdefault(card["name"].split(" // ")[0], card)
    return idx


SECTION = re.compile(r"^\[(.+)\]$")
CARD_LINE = re.compile(r"^(\S+)\s+([A-Z])\s+(.+?)(?:\s+@.*)?$")


def load_edition(path):
    meta, cards, section = {}, [], None
    for ln in open(path, encoding="utf-8"):
        ln = ln.rstrip("\n")
        m = SECTION.match(ln)
        if m:
            section = m.group(1)
        elif section == "metadata" and "=" in ln:
            k, v = ln.split("=", 1)
            meta[k] = v
        elif section and section not in ("metadata", "tokens", "other") and not ln.startswith("#"):
            m = CARD_LINE.match(ln)
            if m:
                cards.append({"section": section, "number": m.group(1), "rarity": m.group(2), "name": m.group(3).strip()})
    return meta, cards


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    forge, codes = sys.argv[1], [c.upper() for c in sys.argv[2:]]
    res = os.path.join(forge, "forge-gui", "res")
    editions = {}
    for p in glob.glob(os.path.join(res, "editions", "*.txt")):
        meta, cards = load_edition(p)
        if "Code" in meta:
            editions[meta["Code"]] = (meta, cards)
    missing = [c for c in codes if c not in editions]
    if missing:
        sys.exit("Édition(s) absente(s) de Forge : %s" % ", ".join(missing))
    release = min(editions[c][0].get("Date", "9999") for c in codes)
    older = {
        c["name"]
        for code, (meta, cards) in editions.items()
        if code not in codes and meta.get("Date", "9999") < release
        for c in cards
    }
    idx = load_cards(res)
    out, seen, unknown = [], set(), []
    for code in codes:
        meta, cards = editions[code]
        for c in cards:
            # Section principale seulement : les variantes (borderless,
            # extended art...) reprennent les mêmes cartes.
            if c["section"] != "cards" or c["name"] in seen or c["name"] in older:
                continue
            seen.add(c["name"])
            card = idx.get(c["name"])
            if card is None:
                unknown.append(c["name"])
                continue
            out.append({
                **card,
                "set": code.lower(),
                "collector_number": c["number"],
                "rarity": RARITY.get(c["rarity"], "common"),
            })
    try:
        commit = subprocess.check_output(["git", "-C", forge, "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        commit = "inconnu"
    data = {
        "generatedAt": datetime.date.today().isoformat(),
        "source": "forge",
        "sourceDetail": "github.com/Card-Forge/forge@%s — texte oracle tel que saisi par Forge, à remplacer par les données Scryfall (node scripts/fetch-set-cards.mjs)" % commit,
        "sets": [
            {"code": c.lower(), "name": editions[c][0].get("Name", c), "releasedAt": editions[c][0].get("Date")}
            for c in codes
        ],
        "cards": out,
    }
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "data", "recent-set-cards.json")
    with open(dest, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print("%d cartes nouvelles écrites dans %s" % (len(out), os.path.normpath(dest)))
    if unknown:
        print("Sans script Forge (ignorées) : %s" % ", ".join(unknown))


if __name__ == "__main__":
    main()
