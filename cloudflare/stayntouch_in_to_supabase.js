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
// en SMTP (stayntouch.com publie DMARC p=none : Cloudflare ne rejette pas en
// amont). D'où le contrôle SPF/DKIM/DMARC ci-dessous, en observation d'abord.
// INCIDENT DU 2026-09-07 : en mode bloquant, les 4 e-mails du PMS ont été
// refusés « SPF/DKIM/DMARC absents » : Cloudflare Email Routing ne fournit pas
// (ou pas sous la forme attendue) l'en-tête Authentication-Results. Le
// contrôle est donc en mode OBSERVATION par défaut : il journalise ce que
// Cloudflare transmet réellement, sans jamais bloquer. Ne passer
// REQUIRE_SENDER_AUTH à « true » qu'après avoir lu dans les journaux du Worker
// un en-tête contenant `=pass` sur un e-mail réel du PMS.
const AUTH_HEADER_NAMES = [
  'authentication-results',
  'arc-authentication-results',
  'received-spf',
  'x-cf-authentication-results',
  'dkim-signature',
]

function describeAuthHeaders(headers) {
  const names = []
  for (const [name] of headers) names.push(name)
  const parts = AUTH_HEADER_NAMES.map((n) => {
    const v = headers.get(n)
    if (v === null) return `${n}=absent`
    return n === 'dkim-signature' ? `${n}=present` : `${n}=${v.slice(0, 160)}`
  })
  return `${parts.join(' | ')} || en-tetes: ${names.join(',').slice(0, 400)}`
}

function senderAuthPassed(headers) {
  const auth = [
    headers.get('authentication-results') || '',
    headers.get('x-cf-authentication-results') || '',
  ]
    .join(' ')
    .toLowerCase()
  // Pas de barre-b (limite de mot) ici : un script d'édition l'avait transformé en caractère
  // « retour arrière » (0x08) invisible, rendant le test impossible (07/09).
  return /(dmarc|dkim|spf)=pass(?![a-z])/.test(auth)
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

/** Valeur d'en-tete HTTP sure. Un sujet d'e-mail contenant un retour chariot, un
 *  saut de ligne ou une tabulation fait lever le constructeur `Headers`, ce qui
 *  ferait rejeter un import parfaitement valide : un expediteur authentifie
 *  pourrait bloquer le pipeline avec un sujet forge. Meme precaution que cote
 *  Edge pour les noms de fichiers. Ecrit caractere par caractere, sans
 *  expression reguliere, pour rester lisible sans echappement. */
function sanitizeHeader(value) {
  let out = ''
  for (const ch of String(value || '')) {
    const code = ch.charCodeAt(0)
    out += code === 13 || code === 10 || code === 9 ? ' ' : ch
  }
  return out.slice(0, 200)
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
    // Authenticité SPF/DKIM/DMARC : observation (journal) par défaut, blocage
    // seulement si REQUIRE_SENDER_AUTH=true a été posé après vérification.
    const authOk = senderAuthPassed(message.headers)
    console.log(
      `[import] auth ${authOk ? 'pass' : 'inconnu'} pour ${domain} : ${describeAuthHeaders(message.headers)}`,
    )
    if (
      !authOk &&
      (env.REQUIRE_SENDER_AUTH || 'false').toLowerCase() === 'true'
    ) {
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
          // Assaini : un sujet contenant CR/LF ferait lever le constructeur
          // Headers, donc rejeter un import parfaitement valide.
          'X-Mail-From': from,
          'X-Mail-Subject': sanitizeHeader(message.headers.get('subject')),
        },
        body: rawEmail,
        // Cloudflare arrête un handler e-mail au bout d'une trentaine de
        // secondes. Rendre la main AVANT, pour que le `catch` ci-dessous puisse
        // décider — plutôt que d'être coupé sans avoir rien tranché.
        signal: AbortSignal.timeout(20_000),
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

  /**
   * VEILLE PLANIFIÉE du rapport journalier (minuterie, cf. wrangler.toml).
   *
   * Le rapport part normalement à l'arrivée du SECOND des deux fichiers
   * nécessaires (Comparison et Forecast), quel que soit le délai qui les
   * sépare. Reste un cas non couvert : ce second fichier arrive très en retard
   * ET son arrivée n'aboutit pas. La veille ouverte côté Supabase par le
   * premier arrivé ne vit que quelques minutes — elle meurt avec l'invocation.
   *
   * Cette minuterie ne dépend d'aucun e-mail ni d'aucune invocation : elle
   * demande simplement, toutes les deux minutes pendant la nuit, « le rapport
   * de cette nuit est-il parti ? ». C'est ce qui permet d'attendre une
   * demi-heure, ou davantage, sans garder quoi que ce soit en vie.
   *
   * Aucune donnée n'est transmise : pas de corps, juste l'en-tête de contrôle
   * et le secret. L'idempotence côté Supabase (réservation atomique) garantit
   * qu'aucun envoi ne peut être doublé, quel que soit le nombre d'appels.
   *
   * @param {ScheduledController} _event
   * @param {{ IMPORT_ENDPOINT: string, IMPORT_SECRET: string }} env
   */
  async scheduled(_event, env) {
    if (!env.IMPORT_ENDPOINT || !env.IMPORT_SECRET) {
      console.error('[veille] configuration du Worker incomplete')
      return
    }
    try {
      const res = await fetch(env.IMPORT_ENDPOINT, {
        method: 'POST',
        headers: {
          'X-Import-Secret': env.IMPORT_SECRET,
          // Distingue ce contrôle d'un e-mail : rien à parser, rien à importer.
          'X-Import-Check': '1',
        },
        // Un contrôle est bref. Si l'autre bout se bloque, on ne reste pas pendu :
        // le passage suivant arrive dans deux minutes, rien n'est perdu.
        signal: AbortSignal.timeout(30_000),
      })
      // Corps non lu : on l'annule pour libérer la connexion.
      res.body?.cancel()
      if (!res.ok) {
        console.error('[veille] controle refuse', res.status)
      }
    } catch (err) {
      // Sans conséquence : le prochain passage de la minuterie réessaiera dans
      // deux minutes. Rien n'est perdu, rien n'est à rejouer.
      console.error('[veille] controle injoignable')
    }
  },
}
