/**
 * Codes des sets/extensions couverts par la section "Extensions" du site
 * (demande de Ben du 26/08/2026, portée choisie via AskUserQuestion : les
 * sets déjà référencés par les decks du site — préconstruits Commander
 * papier + decks Arena — plutôt que l'intégralité des sets Magic jamais
 * imprimés).
 *
 * Dédupliqué à partir de `setCode` dans commander-decks.json (53 entrées),
 * arena-brawl-decks.json (1) et arena-starter-decks.json (10) : 58 codes
 * uniques après déduplication (généré le 26/08/2026, voir le script
 * d'extraction dans l'historique — à régénérer si de nouveaux precons
 * sont ajoutés via `npm run fetch-decks`).
 *
 * `name`/`releaseDate` sont une valeur de repli locale (utile si Scryfall
 * est temporairement indisponible) : la page Extensions affiche en
 * priorité les métadonnées live de `/sets/:code` (nom anglais officiel,
 * icône, type de set, nombre de cartes), voir getSetInfo dans scryfall.ts.
 */
export interface TrackedSetRef {
  code: string;
  name: string;
  releaseDate: string;
}

export const TRACKED_SETS: TrackedSetRef[] = [
  { code: "cmd", name: "Commander 2011", releaseDate: "2011-06-17" },
  { code: "c13", name: "Commander 2013", releaseDate: "2013-11-01" },
  { code: "c14", name: "Commander 2014", releaseDate: "2014-11-07" },
  { code: "c15", name: "Commander 2015", releaseDate: "2015-11-13" },
  { code: "c16", name: "Commander 2016", releaseDate: "2016-11-11" },
  { code: "cma", name: "Commander Anthology", releaseDate: "2017-06-09" },
  { code: "c17", name: "Commander 2017", releaseDate: "2017-08-25" },
  { code: "dom", name: "Dominaria", releaseDate: "2018-03-22" },
  { code: "cm2", name: "Commander Anthology Volume II", releaseDate: "2018-06-08" },
  { code: "c18", name: "Commander 2018", releaseDate: "2018-08-10" },
  { code: "m19", name: "Core Set 2019", releaseDate: "2018-09-27" },
  { code: "grn", name: "Guilds of Ravnica", releaseDate: "2018-11-17" },
  { code: "m20", name: "Core Set 2020", releaseDate: "2019-05-03" },
  { code: "c19", name: "Commander 2019", releaseDate: "2019-08-23" },
  { code: "eld", name: "Throne of Eldraine", releaseDate: "2019-10-04" },
  { code: "c20", name: "Commander 2020", releaseDate: "2020-04-17" },
  { code: "anb", name: "Arena Beginner Set", releaseDate: "2020-08-13" },
  { code: "znc", name: "Zendikar Rising Commander", releaseDate: "2020-09-25" },
  { code: "cmr", name: "Commander Legends", releaseDate: "2020-11-20" },
  { code: "khc", name: "Kaldheim Commander", releaseDate: "2021-02-05" },
  { code: "c21", name: "Commander 2021", releaseDate: "2021-04-23" },
  { code: "m21", name: "Core Set 2021", releaseDate: "2021-07-03" },
  { code: "afc", name: "Forgotten Realms Commander", releaseDate: "2021-07-23" },
  { code: "mic", name: "Midnight Hunt Commander", releaseDate: "2021-09-24" },
  { code: "afr", name: "Adventures in the Forgotten Realms", releaseDate: "2021-09-24" },
  { code: "voc", name: "Crimson Vow Commander", releaseDate: "2021-11-19" },
  { code: "nec", name: "Neon Dynasty Commander", releaseDate: "2022-02-18" },
  { code: "ncc", name: "New Capenna Commander", releaseDate: "2022-04-29" },
  { code: "clb", name: "Commander Legends: Battle for Baldur's Gate", releaseDate: "2022-06-10" },
  { code: "dmc", name: "Dominaria United Commander", releaseDate: "2022-09-09" },
  { code: "snc", name: "Streets of New Capenna", releaseDate: "2022-09-09" },
  { code: "40k", name: "Warhammer 40,000 Commander", releaseDate: "2022-10-07" },
  { code: "brc", name: "The Brothers' War Commander", releaseDate: "2022-11-18" },
  { code: "scd", name: "Starter Commander Decks", releaseDate: "2022-12-02" },
  { code: "onc", name: "Phyrexia: All Will Be One Commander", releaseDate: "2023-02-10" },
  { code: "moc", name: "March of the Machine Commander", releaseDate: "2023-04-21" },
  { code: "ltr", name: "The Lord of the Rings: Tales of Middle-earth", releaseDate: "2023-06-20" },
  { code: "ltc", name: "Tales of Middle-earth Commander", releaseDate: "2023-06-23" },
  { code: "cmm", name: "Commander Masters", releaseDate: "2023-08-04" },
  { code: "woc", name: "Wilds of Eldraine Commander", releaseDate: "2023-09-08" },
  { code: "who", name: "Doctor Who", releaseDate: "2023-10-13" },
  { code: "lcc", name: "The Lost Caverns of Ixalan Commander", releaseDate: "2023-11-17" },
  { code: "mkc", name: "Murders at Karlov Manor Commander", releaseDate: "2024-02-09" },
  { code: "pip", name: "Fallout", releaseDate: "2024-03-08" },
  { code: "otc", name: "Outlaws of Thunder Junction Commander", releaseDate: "2024-04-19" },
  { code: "m3c", name: "Modern Horizons 3 Commander", releaseDate: "2024-06-14" },
  { code: "otj", name: "Outlaws of Thunder Junction", releaseDate: "2024-07-08" },
  { code: "blc", name: "Bloomburrow Commander", releaseDate: "2024-08-02" },
  { code: "dsc", name: "Duskmourn: House of Horror Commander", releaseDate: "2024-09-27" },
  { code: "drc", name: "Aetherdrift Commander", releaseDate: "2025-02-14" },
  { code: "tdc", name: "Tarkir: Dragonstorm Commander", releaseDate: "2025-04-11" },
  { code: "fic", name: "Final Fantasy Commander", releaseDate: "2025-06-13" },
  { code: "eoc", name: "Edge of Eternities Commander", releaseDate: "2025-08-01" },
  { code: "ecc", name: "Lorwyn Eclipsed Commander", releaseDate: "2026-01-23" },
  { code: "tmc", name: "Teenage Mutant Ninja Turtles Eternal", releaseDate: "2026-03-06" },
  { code: "soc", name: "Secrets of Strixhaven Commander", releaseDate: "2026-04-24" },
  { code: "sld", name: "Secret Lair Drop", releaseDate: "2026-05-18" },
  { code: "msc", name: "Marvel Super Heroes Commander", releaseDate: "2026-06-26" },
];
