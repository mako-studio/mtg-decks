#!/usr/bin/env python3
"""Index de TOUTES les cartes du dépôt Forge, pour l'apprentissage hors ligne.

Usage :
  git clone --depth 1 --filter=blob:none --sparse https://github.com/Card-Forge/forge.git /tmp/forge
  git -C /tmp/forge sparse-checkout set forge-gui/res/editions forge-gui/res/cardsfolder
  python3 scripts/dump-forge-cards.py /tmp/forge /tmp/forge-cards.json
  npm run learn-quality -- /tmp/forge-cards.json

Produit { "cards": { nom: carte } } au format réduit de Scryfall utilisé par
le site (même convertisseur que build-set-cards-from-forge.py), avec en plus
`rarity` : la rareté de l'impression la plus récente (ce que Scryfall renvoie
le plus souvent pour une recherche par nom). 04/10/2026.
"""
import glob
import importlib.util
import json
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("forge", os.path.join(here, "build-set-cards-from-forge.py"))
forge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(forge)

RARITY = {"C": "common", "U": "uncommon", "R": "rare", "M": "mythic", "S": "rare", "L": "common"}


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    res = os.path.join(sys.argv[1], "forge-gui", "res")
    cards = forge.load_cards(res)
    latest = {}  # nom -> (date, rareté)
    for p in glob.glob(os.path.join(res, "editions", "*.txt")):
        meta, entries = forge.load_edition(p)
        date = meta.get("Date", "")
        for e in entries:
            r = RARITY.get(e["rarity"])
            if not r:
                continue
            for name in (e["name"], e["name"].split(" // ")[0]):
                if name not in latest or date > latest[name][0]:
                    latest[name] = (date, r)
    for name, card in cards.items():
        hit = latest.get(name) or latest.get(name.split(" // ")[0])
        if hit:
            card["rarity"] = hit[1]
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump({"cards": cards}, f, ensure_ascii=False)
    print(f"{len(cards)} entrées, dont {sum(1 for c in cards.values() if 'rarity' in c)} avec rareté → {sys.argv[2]}")


if __name__ == "__main__":
    main()
