/*
 * Utilitaires de chaînes de la page Classeur — portés de Registre
 * (`files.rs::slugify`, `lib/utils.ts::stripAccents`,
 * `exportMarkdown.ts::sanitizeFilename`).
 *
 * `slugify` est une CLÉ DE FUSION : l'import JSON apparie un chapitre du
 * fichier à un chapitre local par `uuid`, sinon par `slugify(label)`. Toute
 * modification changerait l'appariement de fichiers déjà exportés — ne pas
 * toucher sans rejouer `merge.test.ts` sur un export réel.
 */

/** Retire les accents (NFD puis suppression des diacritiques). */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Slug ASCII minuscule : accents retirés, tout ce qui n'est ni lettre ni
 * chiffre devient un tiret, tirets fusionnés et rognés. Miroir exact de
 * `slugify` côté Rust (Registre) : « Sécurité incendie » → `securite-incendie`.
 */
export function slugify(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Nom de fichier sûr : caractères interdits retirés, espaces normalisés, 200 max. */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

/** Recherche insensible à la casse et aux accents. */
export function contientSansAccents(texte: string, recherche: string): boolean {
  const r = stripAccents(recherche).toLowerCase().trim()
  if (r === '') return true
  return stripAccents(texte).toLowerCase().includes(r)
}
