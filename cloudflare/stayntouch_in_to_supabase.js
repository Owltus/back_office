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

/*
 * ---------------------------------------------------------------------------
 * PRECHAUFFAGE DE LA BASE
 *
 * POURQUOI — mesure du 2026-09-23 sur la production. La MEME requete triviale,
 * selon le temps ecoule depuis la derniere activite :
 *
 *   en continu (chaud)        0,17 s
 *   apres  30 s de repos      0,34 s
 *   apres  60 s de repos      0,59 s
 *   apres   2 min de repos    0,62 s
 *   apres   5 min de repos    0,76 s
 *   apres une longue pause    1,37 s
 *
 * La penalite apparait des TRENTE SECONDES d'inactivite. Autrement dit, un
 * utilisateur qui ouvre l'application le matin, ou apres une heure sans y
 * toucher, paie systematiquement huit fois le prix d'une requete chaude — sur
 * CHAQUE page. C'est la premiere cause de lenteur vecue, et elle etait
 * invisible dans mes mesures precedentes, qui rechargeaient en boucle et ne
 * voyaient donc qu'une base deja chaude.
 *
 * COMMENT — une requete anonyme par minute pendant les heures d'ouverture. Elle
 * doit traverser TOUTE la pile pour reveiller ce qu'il faut :
 *
 *   sans cle  -> 73 ms, "No API key found" : rejetee a la porte, ne rechauffe
 *                RIEN. Inutile.
 *   avec cle  -> "42501 permission denied for table profiles". Un code d'erreur
 *                PostgreSQL : la requete est allee jusqu'a la base et a evalue
 *                les RLS. C'est la preuve que la pile entiere est reveillee.
 *
 * Le 401 attendu n'est donc pas un echec, c'est le SUCCES : `anon` n'a aucun
 * privilege sur `public` (durcissement du 2026-09-06) et rien n'est expose.
 *
 * HORAIRES — `4-22` en UTC couvre l'union des deux saisons pour 06h-23h Paris
 * (ete UTC+2 : 04h-21h ; hiver UTC+1 : 05h-22h). La nuit n'est pas prechauffee :
 * personne n'utilise l'app, et la veille d'import a sa propre minuterie.
 *
 * DEUX tirs espaces de 30 s par passage : la minuterie de Cloudflare ne descend
 * pas sous la minute, or la chaleur retombe des 30 s. Deux tirs ramenent le pire
 * cas d'environ 0,59 s a environ 0,34 s.
 * ------------------------------------------------------------------------- */

/** Doit correspondre EXACTEMENT a l'entree de `crons` dans wrangler.toml. */
const PRECHAUFFAGE_CRON = '* 4-22 * * *'

/** Espacement des deux rafales, en millisecondes. */
const PRECHAUFFAGE_ESPACEMENT_MS = 30_000

/** Tirs par rafale. Trois suffisent a atteindre l'etat chaud (cf. `rafale`). */
const PRECHAUFFAGE_TIRS = 3

/**
 * Reveille PostgREST + Postgres (et GoTrue) par des requetes anonymes.
 *
 * Aucune donnee lue, aucune ecriture, aucun secret : la cle `publishable` est
 * publique par construction (elle est embarquee dans le bundle du navigateur).
 *
 * @param {{ SUPABASE_URL?: string, SUPABASE_PUBLISHABLE_KEY?: string }} env
 */
async function prechauffer(env) {
  const base = env.SUPABASE_URL
  const cle = env.SUPABASE_PUBLISHABLE_KEY
  if (!base || !cle) {
    console.error('[prechauffage] SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY absentes')
    return
  }

  /**
   * Un tir. JOURNALISE son issue : ce Worker tourne sans surveillance, et un
   * prechauffage qui echoue en silence est pire qu'un prechauffage absent — on
   * croit le probleme regle. La mesure du 2026-09-23 l'a montre : impossible de
   * savoir si les pings arrivaient, parce que `pg_stat_statements` n'enregistre
   * PAS les requetes refusees en permission (test temoin : cinq pings reels
   * n'ont pas bouge le compteur d'une unite).
   *
   * Un statut 401 est le SUCCES attendu : `anon` n'a aucun privilege sur
   * `public`, et le code d'erreur PostgreSQL `42501` prouve que la requete est
   * allee jusqu'a la base.
   */
  const tir = async (chemin) => {
    const t0 = Date.now()
    try {
      const res = await fetch(base + chemin, {
        headers: { apikey: cle },
        // Un tir est bref. S'il se bloque, on n'attend pas : le passage suivant
        // arrive dans une minute et rien n'est perdu.
        signal: AbortSignal.timeout(15_000),
      })
      res.body?.cancel()
      return `${res.status} en ${Date.now() - t0} ms`
    } catch (err) {
      // Sans consequence pour l'application — le prechauffage est un confort,
      // jamais une dependance — mais ON LE DIT.
      return `ECHEC apres ${Date.now() - t0} ms (${err && err.name})`
    }
  }

  /**
   * Une RAFALE, pas un tir isole. Mesure du 2026-09-23 apres une longue pause :
   *
   *   tir 1   1,372 s
   *   tir 2   0,511 s
   *   tir 3   0,237 s
   *   tir 4   0,157 s
   *
   * Il faut TROIS a QUATRE requetes rapprochees pour atteindre l'etat chaud.
   * Un ping unique toutes les 30 s maintenait la base au niveau « premiere
   * requete » (0,74 s mesure), soit la moitie du gain possible seulement.
   */
  const rafale = async () => {
    const issues = []
    for (let i = 0; i < PRECHAUFFAGE_TIRS; i++) {
      issues.push(await tir('/rest/v1/profiles?select=id&limit=1'))
    }
    return issues
  }

  // PostgREST -> Postgres -> RLS (le chemin que prend chaque page).
  const a = await rafale()
  // GoTrue, que toute requete de donnees attend au demarrage (`_getAccessToken`).
  const sante = await tir('/auth/v1/health')

  await new Promise((r) => setTimeout(r, PRECHAUFFAGE_ESPACEMENT_MS))
  const b = await rafale()

  console.log(`[prechauffage] rafale1=[${a}] gotrue=${sante} rafale2=[${b}]`)
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
  async scheduled(event, env) {
    /*
     * DEUX minuteries partagent ce handler, distinguees par `event.cron` :
     *
     *   toutes les 2 min, 0h-4h UTC -> veille du rapport journalier (ci-dessous)
     *   toutes les minutes, 4h-22h  -> PRECHAUFFAGE (voir `prechauffer`)
     *
     * Le prechauffage ne doit JAMAIS pouvoir empecher la veille de tourner :
     * il est traite en premier, dans sa propre branche, et sort aussitot.
     */
    if (event && event.cron === PRECHAUFFAGE_CRON) {
      await prechauffer(env)
      return
    }

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
