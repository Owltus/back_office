/*
 * Messages d'information sur l'état d'une facture — logique PURE (aucun React/DOM). Alimente la
 * zone « Informations » affichée au CENTRE, sous l'aperçu du PDF : ce qui se passe (lecture,
 * erreur), ce que le tampon va faire (mémorisation par émetteur) et les points de vigilance
 * (aucune imputation, doublon, émetteur non mémorisable, facture mixte). Pensé pour un lecteur
 * non initié : une idée par message, peu de jargon.
 *
 * Ne contient QUE des messages DÉRIVÉS du record : les erreurs d'ACTION transitoires (échec du
 * tampon ou de la mémorisation) restent dans le panneau de droite, près du bouton qui les
 * déclenche.
 */

import { canLearn } from '#/lib/facturation/detect.ts'
import type { InvoiceRecord } from '#/lib/facturation/types.ts'

export type NoticeTone = 'info' | 'warn' | 'error'

export interface Notice {
  id: string
  tone: NoticeTone
  text: string
}

/** Messages à afficher pour une facture, le plus utile d'abord. Vide possible (rien à dire). */
export function invoiceNotices(record: InvoiceRecord): Notice[] {
  if (record.status === 'processing')
    return [
      { id: 'processing', tone: 'info', text: 'Lecture de la facture en cours.' },
    ]
  if (record.status === 'error')
    return [
      {
        id: 'error',
        tone: 'error',
        text: record.error ?? 'Lecture de la facture impossible.',
      },
    ]

  // Facture déjà tamponnée : état factuel, plus d'action attendue.
  if (record.learned)
    return [
      { id: 'learned', tone: 'info', text: 'Facture tamponnée et mémorisée.' },
    ]

  // Pas encore d'imputation : rien à tamponner tant qu'aucun code n'est choisi.
  if (record.codes.length === 0)
    return [
      {
        id: 'no-code',
        tone: 'warn',
        text: 'Aucune imputation choisie pour le moment. Sélectionnez au moins un code pour pouvoir tamponner.',
      },
    ]

  // Doublon : ce PDF a déjà été appris (présent au journal). Non bloquant.
  if (record.duplicate)
    return [
      {
        id: 'duplicate',
        tone: 'warn',
        text: 'Cette facture a déjà été apprise. La re-tamponner retélécharge le PDF mais ne réapprend pas, pour éviter de compter deux fois.',
      },
    ]

  // Facture prête : on explique en clair ce que le tampon va faire.
  const out: Notice[] = []
  const supplier = record.supplierName.trim()
  if (canLearn(record.supplierName, record.siren))
    out.push({
      id: 'will-learn',
      tone: 'info',
      text: `En tamponnant, l'imputation sera mémorisée pour ${supplier}. La prochaine facture de cet émetteur la proposera d'office.`,
    })
  else
    out.push({
      id: 'no-issuer',
      tone: 'warn',
      text: "L'émetteur ne sera pas mémorisé (nom absent ou trop court) : le filtre par émetteur ne progressera pas pour lui.",
    })

  if (record.codes.length > 1)
    out.push({
      id: 'mixed',
      tone: 'warn',
      text: `Les ${record.codes.length} imputations apprendront le même vocabulaire (facture mixte). Retirez un code accessoire si son imputation n'est pas à mémoriser.`,
    })

  return out
}
