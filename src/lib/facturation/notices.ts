/*
 * Message d'information sur l'état d'une facture — logique PURE (aucun React/DOM). Alimente la
 * zone affichée au CENTRE, sous l'aperçu du PDF. On ne renvoie QUE l'information qui a du sens
 * pour l'utilisateur : ce qui se passe, ce qu'il doit faire, ou ce que le tampon va retenir.
 * Un seul message à la fois, court et sans jargon.
 *
 * `tone` porte le code couleur de la zone : ok (vert), info (neutre), warn (ambre), error (rouge).
 * Les erreurs d'ACTION transitoires (échec du tampon ou de la mémorisation) restent dans le
 * panneau de droite, près du bouton qui les déclenche.
 */

import { canLearn } from '#/lib/facturation/detect.ts'
import type { InvoiceRecord } from '#/lib/facturation/types.ts'

export type NoticeTone = 'ok' | 'info' | 'warn' | 'error'

export interface Notice {
  id: string
  tone: NoticeTone
  text: string
}

/** Messages à afficher pour une facture, le plus important d'abord. En pratique un seul. */
export function invoiceNotices(record: InvoiceRecord): Notice[] {
  if (record.status === 'processing')
    return [{ id: 'processing', tone: 'info', text: 'Lecture de la facture en cours.' }]

  if (record.status === 'error')
    return [
      {
        id: 'error',
        tone: 'error',
        text: record.error ?? 'La lecture de la facture a échoué.',
      },
    ]

  if (record.learned)
    return [
      { id: 'learned', tone: 'ok', text: 'Facture tamponnée et téléchargée.' },
    ]

  if (record.codes.length === 0)
    return [
      {
        id: 'no-code',
        tone: 'warn',
        text: 'Choisissez au moins une imputation pour pouvoir tamponner.',
      },
    ]

  if (record.duplicate)
    return [
      {
        id: 'duplicate',
        tone: 'warn',
        text: 'Cette facture a déjà été tamponnée. La tamponner à nouveau ne la réapprendra pas.',
      },
    ]

  // Facture prête : on dit ce que le tampon va retenir, ou ce qui manque pour qu'il retienne.
  if (canLearn(record.supplierName, record.siren))
    return [
      {
        id: 'will-learn',
        tone: 'ok',
        text: `L'imputation sera mémorisée pour ${record.supplierName.trim()}.`,
      },
    ]

  return [
    {
      id: 'no-issuer',
      tone: 'warn',
      text: "Renseignez le nom de l'émetteur pour que l'imputation soit mémorisée.",
    },
  ]
}
