/*
 * Nom de l'AUTEUR d'un classeur (2026-11-16), lu dans la liste des personnes
 * de la page (RPC `classeur_personnes`, jamais écrite sur disque).
 */

import type { PersonneClasseur } from '#/lib/classeur/types.ts'

/** Nom lisible d'une personne : prénom nom, sinon nom affiché. */
export function nomPersonne(
  p: Pick<PersonneClasseur, 'prenom' | 'nom' | 'nom_affiche'>,
): string {
  const complet = `${p.prenom} ${p.nom}`.trim()
  return complet !== '' ? complet : p.nom_affiche.trim() || 'Sans nom'
}

/**
 * Le nom de l'auteur `id` : « Vous » pour soi, son nom s'il a la page,
 * « Ancien compte » sinon (plus de droit sur la page, ou compte supprimé),
 * « Aucun » sans auteur. `personnes` absente (en lecture) : « … ».
 */
export function nomAuteur(
  id: string | null,
  personnes: readonly PersonneClasseur[] | undefined,
  moi: string | null | undefined,
): string {
  if (id === null) return 'Aucun'
  if (moi != null && id === moi) return 'Vous'
  if (personnes === undefined) return '…'
  const p = personnes.find((x) => x.id === id)
  return p ? nomPersonne(p) : 'Ancien compte'
}
