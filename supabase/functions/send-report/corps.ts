// Validation PURE du corps de requête de `send-report` (testée par corps.test.ts).
//
// Audit du 2026-10-17 : un corps JSON valide mais non objet (`null`, `42`) ou
// un champ non chaîne (`subject: 5`) faisait lever `.trim()` → 500 opaque ; et
// `htmlBody` / `pdfBase64` envoyés en TABLEAU contournaient les plafonds de
// taille (`.length` d'un tableau = nombre d'éléments, pas de caractères), le
// tableau partant ensuite tel quel vers le transport. Même garde que
// `create-user/handler.ts` : objet non nul non tableau, chaînes seulement.

export interface CorpsEnvoi {
  /** Date du rapport (YYYY-MM-DD), optionnelle : sert au marqueur d'envoi. */
  reportDate: string
  subject: string
  htmlBody: string
  pdfBase64: string
  pdfName: string
}

export type ResultatCorps =
  | { ok: true; corps: CorpsEnvoi }
  | { ok: false; status: 400 | 413; error: string }

const CHAMPS = ['date', 'subject', 'htmlBody', 'pdfBase64', 'pdfName'] as const

export const MAX_SUJET = 300
export const MAX_HTML = 200_000
export const MAX_PDF_BASE64 = 8_000_000

/** Valide le corps déjà décodé (`await req.json()`). Ne lève jamais. */
export function validerCorps(brut: unknown): ResultatCorps {
  const invalide = { ok: false, status: 400, error: 'Corps de requête invalide' } as const
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut))
    return invalide
  const champs = brut as Record<string, unknown>
  // Absents (ou null) acceptés, sinon CHAÎNES seulement.
  for (const champ of CHAMPS)
    if (champs[champ] != null && typeof champs[champ] !== 'string')
      return invalide
  const lire = (c: (typeof CHAMPS)[number]) => (champs[c] as string | null | undefined) ?? ''

  const reportDate = lire('date').trim()
  const subject = lire('subject').trim()
  const htmlBody = lire('htmlBody')
  const pdfBase64 = lire('pdfBase64')
  const pdfName = (champs.pdfName == null ? 'rapport.pdf' : lire('pdfName')).trim()

  if (!subject || !htmlBody)
    return { ok: false, status: 400, error: 'Sujet ou corps manquant' }
  // Durcissement (B2) : nom de fichier simple .pdf, jamais de chemin (../, /).
  if (!/^[\w .()-]+\.pdf$/i.test(pdfName))
    return { ok: false, status: 400, error: 'Nom de pièce jointe invalide' }
  if (subject.length > MAX_SUJET || htmlBody.length > MAX_HTML)
    return { ok: false, status: 413, error: 'Contenu trop volumineux' }
  if (pdfBase64.length > MAX_PDF_BASE64)
    return { ok: false, status: 413, error: 'Pièce jointe trop volumineuse' }

  return { ok: true, corps: { reportDate, subject, htmlBody, pdfBase64, pdfName } }
}
