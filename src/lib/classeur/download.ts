/*
 * Téléchargement de fichiers côté navigateur — page Classeur.
 *
 * Remplace les dialogues natifs « Enregistrer sous » de Registre
 * (`@tauri-apps/plugin-dialog` + commandes Rust `write_file` /
 * `write_file_binary`) : ici, le navigateur reçoit un `Blob` par un lien
 * `<a download>` et range le fichier dans son dossier de téléchargements.
 * Même mécanique que `lib/facturation/stamp.ts` (PDF tamponné).
 *
 * L'URL d'objet est révoquée AUSSITÔT après le clic : le navigateur a déjà
 * pris le blob en charge à ce moment-là (précédent en production dans
 * `stamp.ts`). Pour un PDF chargé dans un iframe, c'est différent — voir
 * `lib/print/openPdf.ts`, qui attend le `load`.
 */

import { sanitizeFilename } from '#/lib/classeur/slug.ts'

/** Nom de repli quand le nettoyage ne laisse rien (« ??? » → vide). */
const NOM_REPLI = 'export'

/**
 * Déclenche le téléchargement d'un `Blob` sous `nomFichier` (nettoyé par
 * `sanitizeFilename` : caractères interdits retirés, 200 max). Le lien est
 * attaché au document le temps du clic — Firefox ignore un `click()` sur un
 * lien détaché.
 */
export function telechargerBlob(nomFichier: string, blob: Blob): void {
  const nom = sanitizeFilename(nomFichier) || NOM_REPLI
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.style.display = 'none'
  document.body.appendChild(a)
  try {
    a.click()
  } finally {
    a.remove()
    URL.revokeObjectURL(url)
  }
}

/** Téléchargement d'un texte (Markdown par défaut, JSON sur demande). */
export function telechargerTexte(
  nom: string,
  texte: string,
  type = 'text/markdown;charset=utf-8',
): void {
  telechargerBlob(nom, new Blob([texte], { type }))
}
