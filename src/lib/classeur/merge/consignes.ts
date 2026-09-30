/*
 * Consignes pour un LLM, embarquées dans `_metadata.instructions` de TOUS les
 * exports JSON du Classeur — classeur complet, chapitre, document (retour
 * utilisateur du 2026-09-30 : « mets à jour les métadonnées de TOUS les
 * exports, du point de vue classeur, chapitre et document »). Une seule
 * source : les conventions de la page (Markdown, images, `===`, `+++`)
 * évoluent ici, jamais dans trois copies.
 *
 * `_metadata` est informatif et ignoré à l'import, ici comme dans
 * l'application de bureau Registre (sa structure serde n'interdit pas les
 * clés inconnues : vérifié dans `files.rs` le 2026-09-30).
 */

/** Ce qui vaut quelle que soit la portée : forme de la réponse, champs, Markdown. */
const COMMUNES: string[] = [
  "Ce fichier vient de la page Classeur du Back Office de l'hôtel OKKO Nantes (classeurs réglementaires, procédures). Il sera RÉIMPORTÉ tel que tu le rends : ta réponse doit être le JSON complet et valide, dans un seul bloc, sans commentaire, sans « … » ni partie omise.",
  'Tu peux modifier : `title`, `description` et `content` des éléments, ainsi que `label` et `description` des chapitres. Tu peux corriger, reformuler, compléter, restructurer.',
  'Ne modifie JAMAIS : `format_version`, `_metadata`, le bloc `classeur`, `uid`, `uuid`, `kind`, `updated_at`, `periodicite_id`, `nombre`. Le `uuid` est la clé qui relie chaque élément à la base : le changer créerait un doublon au lieu de mettre à jour.',
  '`content` est du Markdown (GitHub). Conventions de la page : un retour à la ligne simple COLLE les lignes (il faut une ligne vide pour un nouveau paragraphe) ; `#`, `##`, `###` pour les titres ; `**gras**`, `*italique*`, `~~barré~~` ; listes `- ` ou `1. ` ; case à cocher `- [ ] ` ; encadré avec `> ` en début de ligne ; tableaux avec `|` et une ligne `| --- |` sous l’en-tête ; une ligne contenant seulement `===` fait un SAUT DE PAGE à l’impression.',
  "Les images s'écrivent `![nom](12/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.webp)`, éventuellement suivies de leurs réglages entre guillemets : `![nom](12/…webp \"largeur=40 position=gauche\")`. `largeur` = pourcentage de la largeur de la page (20 à 100 ; absent = pleine largeur), `position` = `gauche` ou `droite` (le texte coule à côté de l'image) ou absent (centrée). Conserve le CHEMIN EXACTEMENT (c'est un fichier stocké : ne le modifie pas, n'en invente pas) ; tu peux déplacer une ligne d'image et ajuster sa largeur et sa position, par exemple pour réduire une capture et mettre le texte à côté.",
  "Le texte qui suit une image à gauche ou à droite l'entoure : une ligne contenant seulement `+++` fait repartir la suite SOUS l'image (un titre y passe de lui-même).",
  "Pages imprimées en A4, en noir et blanc : pas de couleurs, pas de HTML, pas d'emoji ; phrases courtes et claires pour le personnel de la réception.",
]

const AJOUT_DOCUMENT =
  'Pour AJOUTER un document, ajoute un objet { "kind": "document", "title": …, "description": …, "content": …, "sort_order": … } SANS `uuid` : il sera créé. `sort_order` fixe l\'ordre d\'affichage dans le chapitre.'

/** Classeur complet. */
export function consignesClasseur(nom: string): string[] {
  return [
    `PORTÉE : le classeur « ${nom} » en entier (tous ses chapitres). Il est réimporté depuis l'accueil du classeur, par fusion (rien n'est supprimé, le plus récent gagne) ou en remplacement (ce qui manque au fichier est supprimé) : garde donc TOUS les chapitres et éléments, même ceux que tu ne modifies pas.`,
    ...COMMUNES,
    "En fusion, un élément n'est mis à jour que si son `updated_at` est plus récent que celui de la base : pour faire appliquer tes modifications d'un élément existant, l'utilisateur réimporte en REMPLACEMENT, ou exporte le chapitre / le document seul (bouton `{}`), dont la réimportation applique toujours le fichier.",
    AJOUT_DOCUMENT,
    'Pour AJOUTER un chapitre, ajoute un objet { "uid": …, "label": …, "icon": "FileText", "description": …, "sort_order": …, "items": [] } SANS `uuid`.',
  ]
}

/** Un chapitre et ses éléments. */
export function consignesChapitre(label: string): string[] {
  return [
    `PORTÉE : le chapitre « ${label} » et ses éléments. Seul ce chapitre sera modifié à la réimportation.`,
    ...COMMUNES,
    AJOUT_DOCUMENT,
    "Pour RETIRER un élément, supprime son objet du tableau `items` : il ne sera supprimé que si l'utilisateur coche l'option correspondante à la réimportation. En cas de doute, garde-le.",
  ]
}

/** Un seul document. */
export function consignesDocument(titre: string, chapitre: string): string[] {
  return [
    `PORTÉE : le seul document « ${titre} » (chapitre « ${chapitre} »). Seul ce document sera modifié à la réimportation ; le bloc chapitre n'est là que pour le contexte et ne sera pas modifié.`,
    ...COMMUNES,
    "Le tableau `items` doit contenir exactement UN élément : ce document, avec son `uuid` inchangé. N'en ajoute pas, n'en retire pas.",
  ]
}
