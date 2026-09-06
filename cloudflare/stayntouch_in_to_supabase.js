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

// Domaines expéditeurs autorisés : correspondance EXACTE (durci le 2026-09-06,
// red team : l'ancienne sous-chaîne « stayntouch » laissait passer
// `pms.stayntouch-support.evil`). Surchargeable sans redéploiement par la
// variable Cloudflare ALLOWED_SENDER_DOMAINS (liste séparée par des virgules),
// par exemple si le PMS envoie depuis un sous-domaine imprévu : le rejet est
// journalisé avec le domaine vu, il suffit de l'ajouter.
const DEFAULT_ALLOWED_SENDER_DOMAINS = ['stayntouch.com', 'mail.stayntouch.com']

// Le Worker relaie le secret d'import : l'authenticité de l'expéditeur est
// donc le SEUL verrou avant l'écriture en base. L'en-tête From est falsifiable
// en SMTP ; on exige en plus que Cloudflare ait vérifié SPF ou DKIM ou DMARC
// (en-tête Authentication-Results posé par Email Routing).
// Garde-fou d'exploitation : si Cloudflare ne posait pas cet en-tête sur cette
// zone, TOUS les imports seraient refusés (visible dans les logs du Worker :
// « SPF/DKIM/DMARC absents »). Poser alors REQUIRE_SENDER_AUTH=false le temps
// de vérifier la configuration DMARC de la zone, puis remettre à true.
function senderAuthenticated(headers, env) {
  if ((env.REQUIRE_SENDER_AUTH || 'true').toLowerCase() === 'false') return true
  const auth = (headers.get('authentication-results') || '').toLowerCase()
  return /(dmarc|dkim|spf)=pass/.test(auth)
}

function allowedDomains(env) {
  const raw = (env.ALLOWED_SENDER_DOMAINS || '').trim()
  const list = raw
    ? raw
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean)
    : DEFAULT_ALLOWED_SENDER_DOMAINS
  return new Set(list)
}

export default {
  /**
   * @param {ForwardableEmailMessage} message
   * @param {{ IMPORT_ENDPOINT: string, IMPORT_SECRET: string, ALLOWED_SENDER_DOMAINS?: string, REQUIRE_SENDER_AUTH?: string }} env
   */
  async email(message, env) {
    // --- 1. Filtre expéditeur : domaine EXACT + authentification SPF/DKIM/DMARC
    const from = (message.from || '').toLowerCase()
    const domain = from.split('@').pop() || ''
    if (!allowedDomains(env).has(domain)) {
      console.warn(
        `[import] expediteur refuse (domaine non autorise) : ${domain}`,
      )
      message.setReject('Expéditeur non autorisé')
      return
    }
    if (!senderAuthenticated(message.headers, env)) {
      console.warn(
        `[import] expediteur refuse (SPF/DKIM/DMARC absents) : ${domain}`,
      )
      message.setReject('Authentification e-mail insuffisante')
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
