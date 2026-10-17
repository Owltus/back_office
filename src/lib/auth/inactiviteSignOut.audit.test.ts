// @vitest-environment jsdom
/*
 * Audit de sécurité du 2026-10-17 (authentification) — finding « expiration
 * par inactivité annulée par une déconnexion qui échoue ».
 *
 * AuthContext (applyUser l. ~341-347, revalidate l. ~429-433) fait, quand la
 * session a plus de 24 h d'inactivité :
 *     clearLastActive()
 *     void supabase.auth.signOut()        // PAS le signOut durci du contexte
 * Si le backend est injoignable à ce moment, auth-js rend une erreur SANS
 * retirer la session du stockage (GoTrueClient._signOut). L'horodatage ayant
 * déjà été effacé, `readLastActive()` vaut null au démarrage suivant et
 * `isInactiveTooLong(null)` vaut false : la vieille session est rouverte.
 *
 * (Jeton EXPIRÉ seulement : c'est toujours le cas après 24 h, le jeton
 * vit 1 h ; auth-js tente alors un renouvellement, ~25 s de réessais.)
 * Ce fichier exerce le VRAI GoTrueClient (fetch qui échoue comme une panne).
 *
 * CORRIGÉ le 2026-10-17 : AuthContext passe désormais par
 * `fermerSessionInactive` (lib/auth/sessionLocale.ts) — déconnexion durcie
 * (`deconnexionDurcie`, repli `effacerSessionLocale`) PUIS effacement de
 * l'horodatage. L'invariant ci-dessous appelle cette fonction réelle (il
 * était en `it.fails` tant que le défaut existait).
 */
import { GoTrueClient } from '@supabase/auth-js'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearLastActive,
  isInactiveTooLong,
  readLastActive,
  writeLastActive,
} from '#/lib/auth/inactivity.ts'
import {
  deconnexionDurcie,
  effacerSessionLocale,
  fermerSessionInactive,
} from '#/lib/auth/sessionLocale.ts'

const CLE = 'sb-127-auth-token'
const H = 60 * 60_000

function sessionStockee(expireDansS: number) {
  const now = Math.floor(Date.now() / 1000)
  return JSON.stringify({
    access_token: 'x.y.z',
    refresh_token: 'rt-audit',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + expireDansS,
    user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated' },
  })
}

function clientEnPanne() {
  return new GoTrueClient({
    url: 'http://127.0.0.1:9/auth/v1',
    storageKey: CLE,
    storage: window.localStorage,
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    fetch: () => Promise.reject(new TypeError('Failed to fetch')),
  })
}

describe('audit auth — inactivité et déconnexion en panne', () => {
  beforeEach(() => window.localStorage.clear())

  it('auth-js garde la session quand signOut échoue (jeton expiré)', async () => {
    window.localStorage.setItem(CLE, sessionStockee(-25 * 3600))
    const { error } = await clientEnPanne().signOut()
    expect(error).not.toBeNull()
    expect(window.localStorage.getItem(CLE)).not.toBeNull()
  }, 60_000)

  it('INVARIANT : une session expirée par inactivité reste expirée au démarrage suivant', async () => {
    window.localStorage.setItem(CLE, sessionStockee(-25 * 3600))
    writeLastActive(Date.now() - 25 * H)
    expect(isInactiveTooLong(readLastActive(), Date.now())).toBe(true)

    // Ce que font AuthContext.applyUser / revalidate (fermerParInactivite) :
    await fermerSessionInactive(clientEnPanne(), () => window.localStorage)

    // Démarrage suivant : la session est-elle encore là ET considérée
    // comme expirée ? (attendu : soit plus de session, soit expirée)
    const sessionPresente = window.localStorage.getItem(CLE) !== null
    const expiree = isInactiveTooLong(readLastActive(), Date.now())
    expect(!sessionPresente || expiree).toBe(true)
  }, 60_000)

  it('le signOut durci (effacerSessionLocale) ferme la session', async () => {
    window.localStorage.setItem(CLE, sessionStockee(-25 * 3600))
    clearLastActive()
    const { error } = await clientEnPanne().signOut()
    if (error) effacerSessionLocale(window.localStorage)
    expect(window.localStorage.getItem(CLE)).toBeNull()
  }, 60_000)

  it('deconnexionDurcie : panne → session effacée, erreur rendue, jamais levée', async () => {
    window.localStorage.setItem(CLE, sessionStockee(-25 * 3600))
    window.localStorage.setItem('autre-cle', 'gardee')
    const { error } = await deconnexionDurcie(
      clientEnPanne(),
      () => window.localStorage,
    )
    expect(error).not.toBeNull()
    expect(window.localStorage.getItem(CLE)).toBeNull()
    expect(window.localStorage.getItem('autre-cle')).toBe('gardee')
  }, 60_000)

  it('deconnexionDurcie : un signOut qui LÈVE est traité comme un échec', async () => {
    window.localStorage.setItem(CLE, sessionStockee(3600))
    const { error } = await deconnexionDurcie(
      { signOut: () => Promise.reject(new Error('boum')) },
      () => window.localStorage,
    )
    expect(error).toBeInstanceOf(Error)
    expect(window.localStorage.getItem(CLE)).toBeNull()
  })

  it('deconnexionDurcie : signOut réussi → stockage laissé à auth-js', async () => {
    window.localStorage.setItem(CLE, sessionStockee(3600))
    const { error } = await deconnexionDurcie(
      { signOut: () => Promise.resolve({ error: null }) },
      () => window.localStorage,
    )
    expect(error).toBeNull()
    expect(window.localStorage.getItem(CLE)).not.toBeNull()
  })

  it("fermerSessionInactive : l'horodatage reste périmé tant que la déconnexion n'est pas finie", async () => {
    writeLastActive(Date.now() - 25 * H)
    let finir: (v: { error: unknown }) => void = () => {}
    const p = fermerSessionInactive(
      { signOut: () => new Promise((r) => (finir = r)) },
      () => window.localStorage,
    )
    expect(isInactiveTooLong(readLastActive(), Date.now())).toBe(true)
    finir({ error: null })
    await p
    expect(readLastActive()).toBeNull()
  })
})
