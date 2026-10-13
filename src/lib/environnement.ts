/**
 * Quelle base l'application vise-t-elle ? (plan environnement-dev-docker-
 * 2026-10-12, étape 7.) Logique PURE : aucune lecture de `import.meta.env`,
 * de `window` ni du réseau — les appelants passent l'URL et le mode.
 *
 * Trois règles en découlent :
 *   - sous `vite dev`, toute cible qui n'est pas LOCALE est refusée au
 *     démarrage, sans aucune requête (D13-A : le front du poste ne vise
 *     jamais la prod ; un `.env.development.local` absent ou mal rempli ne
 *     doit pas retomber EN SILENCE sur la prod) ;
 *   - le bandeau d'environnement ne s'affiche qu'en local ;
 *   - le navigateur ne garde que la session de SA base (ménage au démarrage) :
 *     `localhost:3000` a servi l'app branchée sur la prod pendant des mois,
 *     son `localStorage` contient encore une session prod.
 */

export type Cible = 'locale' | 'prod' | 'autre'

export const REF_PROD = 'ozpavwghrmmkrnmkxodg'

function hoteDe(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** Hôtes de bouclage : la base est sur ce poste. */
export function estHoteLocal(hote: string): boolean {
  return (
    hote === 'localhost' ||
    hote === '127.0.0.1' ||
    hote === '[::1]' ||
    hote.endsWith('.localhost')
  )
}

export function cibleDe(url: string | null | undefined): Cible {
  const hote = hoteDe(url)
  if (hote === null) return 'autre'
  if (estHoteLocal(hote)) return 'locale'
  if (hote === `${REF_PROD}.supabase.co`) return 'prod'
  return 'autre'
}

/**
 * Clé `localStorage` de la session, EXACTEMENT comme supabase-js la nomme
 * (vérifié dans `@supabase/supabase-js` 2.110 : `sb-${hostname.split('.')[0]}
 * -auth-token`). Pour `127.0.0.1`, c'est donc `sb-127-auth-token` — ce
 * n'est pas un défaut, c'est le nom réel, distinct de celui de la prod.
 */
export function cleSession(url: string | null | undefined): string | null {
  const hote = hoteDe(url)
  if (hote === null) return null
  return `sb-${hote.split('.')[0]}-auth-token`
}

// La session et son vérificateur PKCE (`…-auth-token-code-verifier`).
const MOTIF_CLE_SESSION = /^sb-.+-auth-token(-code-verifier)?$/

/** Les clés de session d'une AUTRE base que la cible, à supprimer. */
export function clesSessionEtrangeres(
  cles: ReadonlyArray<string>,
  url: string | null | undefined,
): Array<string> {
  const mienne = cleSession(url)
  return cles.filter(
    (c) =>
      MOTIF_CLE_SESSION.test(c) &&
      c !== mienne &&
      c !== `${mienne}-code-verifier`,
  )
}

/**
 * Marque du propriétaire du cache persisté : la BASE et le compte. Un cache
 * écrit contre une autre base n'est jamais restauré, même pour un
 * identifiant de compte identique (la copie de la prod en local garde les
 * mêmes identifiants).
 */
export function proprietaireCache(
  url: string | null | undefined,
  userId: string,
): string {
  const hote = hoteDe(url) ?? 'inconnu'
  return `${hote.split('.')[0]}:${userId}`
}

/** `vite dev` vers une base non locale : démarrage refusé. */
export function demarrageRefuse(cible: Cible, modeDev: boolean): boolean {
  return modeDev && cible !== 'locale'
}

export const MESSAGE_DEMARRAGE_REFUSE =
  'pnpm dev vise la base LOCALE (http://127.0.0.1:54321). Renseignez ' +
  '.env.development.local (voir .env.example) et lancez la base avec ' +
  'pnpm db:start. La prod se consulte sur le site en ligne.'

export interface Bandeau {
  texte: string
}

/** Bandeau d'environnement : en local seulement, jamais sur le site Vercel. */
export function bandeauDe(cible: Cible, modeDev: boolean): Bandeau | null {
  if (!modeDev || cible !== 'locale') return null
  return { texte: 'DEV · base locale' }
}

/** Titre de l'onglet : préfixé en dev. */
export function titreDe(titre: string, modeDev: boolean): string {
  return modeDev ? `[DEV] ${titre}` : titre
}
