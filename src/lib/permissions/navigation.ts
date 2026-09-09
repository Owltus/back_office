import type { Grade } from '#/lib/permissions/levels.ts'
import type { PagePermissions } from '#/lib/permissions/index.ts'
import { canView } from '#/lib/permissions/index.ts'
import type { PageDef, PageKey } from '#/lib/permissions/pages.ts'
import { PAGE_BY_KEY, PAGES } from '#/lib/permissions/pages.ts'

/* --------------------------------------------------------------------------
 * Navigation d'un compte : l'ordre de ses pages et sa page d'accueil.
 *
 * L'ordre est une PRÉFÉRENCE par compte (`profiles.page_order`, colonne posée
 * le 2026-09-09), et la page en TÊTE de cet ordre est la page d'accueil — celle
 * vers laquelle `/` redirige. Le registre `PAGES` reste la source des libellés,
 * des routes et des icônes ; son ordre n'est plus qu'un REPLI, celui d'un compte
 * sans préférence.
 *
 * Tout tient dans une règle, `orderedPages`, qui doit rester TOLÉRANTE : la
 * préférence stockée peut désigner une page dont le droit a été retiré depuis,
 * ignorer une page nouvellement accordée, contenir une clé inconnue (page
 * renommée) ou un doublon. Aucun de ces cas ne doit produire d'erreur, et surtout
 * aucun ne doit faire DISPARAÎTRE une page accordée — c'est ce qui serait arrivé
 * aux comptes existants lors de l'ajout de `literie` si l'ordre avait fait loi.
 *
 * Métier pur, sans React : testable sans monter quoi que ce soit.
 * ------------------------------------------------------------------------ */

/** Une clé de page connue du registre ? (une page renommée ou retirée du
 *  registre laisse une clé morte dans les préférences déjà stockées). */
function isKnownPage(key: string): key is PageKey {
  return key in PAGE_BY_KEY
}

/**
 * Pages d'un compte, dans SON ordre, filtrées sur ses droits.
 *
 * Trois temps, dans cet ordre :
 *   1. les pages de la préférence, en ignorant les clés inconnues et les
 *      doublons ;
 *   2. dont on ne garde que celles qu'il peut voir ;
 *   3. puis TOUTES les pages visibles absentes de la préférence, dans l'ordre
 *      du registre.
 *
 * Le troisième temps est ce qui rend la préférence auto-réparatrice : elle peut
 * rester partielle et périmée indéfiniment sans qu'aucune page accordée ne soit
 * masquée. Il n'y a donc rien à réécrire lors d'un octroi ou d'un retrait de
 * droit.
 */
export function orderedPages(
  perms: PagePermissions,
  grade: Grade,
  stored: readonly string[] | null | undefined,
): PageDef[] {
  const seen = new Set<PageKey>()
  const out: PageDef[] = []
  for (const key of stored ?? []) {
    if (!isKnownPage(key) || seen.has(key)) continue
    seen.add(key)
    if (canView(perms, grade, key)) out.push(PAGE_BY_KEY[key])
  }
  for (const page of PAGES) {
    if (seen.has(page.key)) continue
    if (canView(perms, grade, page.key)) out.push(page)
  }
  return out
}

/**
 * Page d'accueil du compte : la TÊTE de son ordre effectif.
 *
 * Décision produit du 2026-09-09 : l'accueil n'est pas un réglage distinct, il
 * découle de l'ordre. Cette dérivation a une vertu de sûreté — `orderedPages`
 * ayant déjà filtré sur les droits, l'accueil ne peut pas désigner une page
 * interdite, et aucun chemin de repli ne relit la préférence brute. C'est ce qui
 * interdit la boucle de redirection : une préférence invalide dégrade vers la
 * première page accordée, jamais vers elle-même.
 *
 * `null` = le compte n'a accès à aucune page (`PageGuard` rend alors
 * `NoAccessNotice`).
 */
export function homePage(
  perms: PagePermissions,
  grade: Grade,
  stored: readonly string[] | null | undefined,
): PageKey | null {
  return orderedPages(perms, grade, stored)[0]?.key ?? null
}

/** Route d'accueil du compte, prête pour le routeur. `null` si aucune page. */
export function homeRoute(
  perms: PagePermissions,
  grade: Grade,
  stored: readonly string[] | null | undefined,
): string | null {
  const key = homePage(perms, grade, stored)
  return key ? PAGE_BY_KEY[key].route : null
}

/** Nettoie une préférence avant écriture : clés connues, sans doublon, bornée
 *  au registre. Miroir applicatif du CHECK `profiles_page_order_check`, qui
 *  contrôle l'inclusion et la longueur mais PAS les doublons (l'expression
 *  nécessaire n'est pas immutable, donc impossible en CHECK). */
export function sanitizePageOrder(order: readonly string[]): PageKey[] {
  const seen = new Set<PageKey>()
  for (const key of order) {
    if (isKnownPage(key)) seen.add(key)
  }
  return [...seen]
}
