// Environnement des Edge Functions (plan environnement-dev-docker-2026-10-12,
// étape 8). Logique PURE : l'appelant passe une fonction de lecture des
// variables (`Deno.env.get` en vrai, un objet dans les tests).
//
// En LOCAL (stack `supabase start`, SUPABASE_URL = http://kong:8000) :
//   - la clé serveur est TOUJOURS celle que la stack injecte
//     (SUPABASE_SERVICE_ROLE_KEY). SB_SECRET_KEY est ignorée : une clé de la
//     prod collée par erreur n'est jamais utilisée. (Elle ne pourrait de toute
//     façon rien atteindre : SUPABASE_URL vise la base locale. Mais la règle
//     évite d'avoir une clé prod qui traîne dans un fichier du poste.)
//   - les e-mails partent dans MAILPIT (http://127.0.0.1:54324), JAMAIS chez
//     Resend, même avec une clé Resend posée (D12-B). Les vrais destinataires
//     peuvent être là (copie de la prod, étape 14) : par construction, ils ne
//     reçoivent rien.
// Ailleurs : rien ne change (SB_SECRET_KEY, Resend, REPORT_TEST_TO).

export type LireVariable = (nom: string) => string | undefined

/** Hôtes d'une stack locale, vus depuis le conteneur ou depuis le poste. */
export function estLocal(supabaseUrl: string | null | undefined): boolean {
  if (!supabaseUrl) return false
  let hote: string
  try {
    hote = new URL(supabaseUrl).hostname.toLowerCase()
  } catch {
    return false
  }
  return (
    hote === 'kong' ||
    hote.startsWith('supabase_kong_') ||
    hote === '127.0.0.1' ||
    hote === 'localhost' ||
    hote === '[::1]' ||
    hote === 'host.docker.internal' ||
    hote.endsWith('.localhost')
  )
}

export function enLocal(lire: LireVariable): boolean {
  return estLocal(lire('SUPABASE_URL'))
}

/** Clé serveur (contourne la RLS) : celle de la stack en local, SB_SECRET_KEY ailleurs. */
export function cleServeur(lire: LireVariable): string | undefined {
  return enLocal(lire) ? lire('SUPABASE_SERVICE_ROLE_KEY') : lire('SB_SECRET_KEY')
}

export type Transport =
  | { genre: 'mailpit'; url: string }
  | { genre: 'resend'; cle: string | undefined }

/** Conteneur Mailpit de la stack, sur le réseau Docker de `supabase start`. */
export const MAILPIT_DEFAUT = 'http://supabase_inbucket_back-office:8025'

export function transportMail(lire: LireVariable): Transport {
  if (enLocal(lire)) {
    return { genre: 'mailpit', url: lire('MAILPIT_URL')?.trim() || MAILPIT_DEFAUT }
  }
  return { genre: 'resend', cle: lire('RESEND_API_KEY') }
}

/**
 * La clé Resend telle que les fonctions la vérifient avant d'envoyer. En
 * local, une valeur factice : l'envoi part dans Mailpit, et les gardes
 * « clé absente » des appelants ne doivent pas bloquer l'essai.
 */
export function cleResend(lire: LireVariable): string | undefined {
  return enLocal(lire) ? 'mailpit-local' : lire('RESEND_API_KEY')
}

/** Corps de l'API d'envoi de Mailpit (`POST /api/v1/send`). */
export function corpsMailpit(m: {
  from: string
  to: ReadonlyArray<string>
  cc: ReadonlyArray<string>
  subject: string
  html: string
  piece?: { filename: string; content: string } | null
}): Record<string, unknown> {
  const adresse = (brut: string) => {
    const r = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(brut)
    return r ? { Name: r[1], Email: r[2] } : { Email: brut.trim() }
  }
  const corps: Record<string, unknown> = {
    From: adresse(m.from),
    To: m.to.map((e) => ({ Email: e })),
    Subject: m.subject,
    HTML: m.html,
  }
  if (m.cc.length > 0) corps.Cc = m.cc.map((e) => ({ Email: e }))
  if (m.piece) corps.Attachments = [{ Filename: m.piece.filename, Content: m.piece.content }]
  return corps
}
