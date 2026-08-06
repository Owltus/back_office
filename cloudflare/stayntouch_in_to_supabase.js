/**
 * Cloudflare Email Worker — « stayntouch_in_to_supabase »
 *
 * RÔLE (le « facteur ») : se déclenche à chaque e-mail reçu à l'adresse routée
 * (backoffice@naostack.com). Il ne fait QUE deux choses :
 *   1. Sécurité : n'accepter que les e-mails dont le domaine EXPÉDITEUR contient
 *      « stayntouch » (le PMS). Tout le reste est rejeté (bounce).
 *   2. Relais : transmettre l'e-mail BRUT (MIME complet) à l'Edge Function
 *      Supabase, qui se charge d'en extraire le CSV, de le valider et de l'importer.
 *
 * Il ne parse PAS le CSV lui-même (volontaire : garde le Worker léger et
 * déployable tel quel, sans bibliothèque). Toute l'intelligence d'import vit côté
 * Supabase.
 *
 * VARIABLES À DÉFINIR sur le Worker (Cloudflare → le Worker → Settings → Variables) :
 *   - IMPORT_ENDPOINT : URL de l'Edge Function d'import (ex.
 *       https://ozpavwghrmmkrnmkxodg.supabase.co/functions/v1/import-report)
 *   - IMPORT_SECRET   : secret partagé (chaîne aléatoire) — l'Edge Function
 *       vérifiera cet en-tête pour n'accepter QUE les appels de ce Worker.
 *   (À poser en « Secret » côté Cloudflare, pas en variable en clair.)
 *
 * ⚠ L'Edge Function `import-report` n'existe pas encore : c'est la pièce suivante.
 *   Tant qu'elle n'est pas déployée, le Worker rejettera les mails (relais en échec).
 */

// Domaine expéditeur autorisé (sous-chaîne). Le PMS StayNTouch enverra depuis un
// domaine contenant « stayntouch » ; tout autre expéditeur est refusé.
const ALLOWED_SENDER_SUBSTRING = 'stayntouch'

export default {
  /**
   * @param {ForwardableEmailMessage} message
   * @param {{ IMPORT_ENDPOINT: string, IMPORT_SECRET: string }} env
   */
  async email(message, env) {
    // --- 1. Filtre expéditeur : domaine contenant « stayntouch » -------------
    const from = (message.from || '').toLowerCase()
    const domain = from.split('@')[1] || ''
    if (!domain.includes(ALLOWED_SENDER_SUBSTRING)) {
      message.setReject('Expéditeur non autorisé')
      return
    }

    // --- 2. Lire l'e-mail brut (MIME complet : en-têtes + pièces jointes) -----
    const rawEmail = await new Response(message.raw).text()

    // --- 3. Relais vers l'Edge Function Supabase -----------------------------
    if (!env.IMPORT_ENDPOINT || !env.IMPORT_SECRET) {
      message.setReject('Configuration du Worker incomplète')
      return
    }

    let res
    try {
      res = await fetch(env.IMPORT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'message/rfc822',
          // Authentifie le Worker auprès de l'Edge Function.
          'X-Import-Secret': env.IMPORT_SECRET,
          // Contexte utile pour le diagnostic / la traçabilité côté serveur.
          'X-Mail-From': from,
          'X-Mail-Subject': message.headers.get('subject') || '',
        },
        body: rawEmail,
      })
    } catch (err) {
      // Erreur réseau : rejeter → l'expéditeur (le PMS) réessaiera plus tard.
      message.setReject('Import indisponible, réessayer')
      return
    }

    if (!res.ok) {
      // L'Edge Function a refusé (secret invalide, CSV illisible, doublon strict…).
      // On rejette pour que l'échec soit VISIBLE côté envoi plutôt que perdu.
      const detail = await res.text().catch(() => '')
      console.error('Import refusé', res.status, detail)
      message.setReject('Import refusé par le serveur')
    }
    // Succès (2xx) : rien à faire, l'e-mail a été traité et importé.
  },
}
