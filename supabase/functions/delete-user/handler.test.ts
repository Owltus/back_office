// Tests de l'Edge Function `delete-user` (gestionnaire `traiter`, handler.ts).
//
// Lancer : `deno test --no-check supabase/functions/delete-user/`
// (`--no-check` : voir `send-report/marker.test.ts`.)
//
// Faux client service_role injecté (`_shared/test/fauxClientAdmin.ts`) : aucun
// réseau, journal ORDONNÉ des opérations. Oracles : en-tête de index.ts,
// commentaires du gestionnaire, CLAUDE.md (audit du 2026-09-28 : « ban AVANT
// le retrait du profil »).

import {
  assert,
  assertEquals,
} from 'jsr:@std/assert@1'

import { normaliserUuid, traiter } from './handler.ts'
import {
  DETAIL_INTERNE,
  erreur,
  etatDeBase as etatDeBaseCommun,
  fauxClientAdmin,
  lire,
  requete,
} from '../_shared/test/fauxClientAdmin.ts'
import type { EtatFaux } from '../_shared/test/fauxClientAdmin.ts'

// delete-user n'accepte que des UUID (audit du 2026-10-17) : l'état commun
// (`admin-1`, `user-1`, partagé avec create-user) est ré-étiqueté en UUID.
const ADMIN_ID = 'a0000000-0000-4000-8000-0000000000a1'
const USER_ID = 'b0000000-0000-4000-8000-0000000000b1'
function etatDeBase(): EtatFaux {
  const e = etatDeBaseCommun()
  const id = (x: string) => (x === 'admin-1' ? ADMIN_ID : x === 'user-1' ? USER_ID : x)
  e.jetons = Object.fromEntries(Object.entries(e.jetons).map(([k, v]) => [k, id(v)]))
  e.profils = new Map([...e.profils].map(([k, v]) => [id(k), { ...v, id: id(v.id) }]))
  e.identites = new Map([...e.identites].map(([k, v]) => [id(k), { ...v, id: id(v.id) }]))
  return e
}

const BAN = 'updateUserById(b0000000-0000-4000-8000-0000000000b1, ban=876000h)'
const UNBAN = 'updateUserById(b0000000-0000-4000-8000-0000000000b1, ban=none)'

async function appeler(
  req: Request,
  etat: EtatFaux = etatDeBase(),
  variables?: Record<string, string | undefined>,
) {
  const faux = fauxClientAdmin(etat)
  const logs: unknown[][] = []
  const original = console.error
  console.error = (...a: unknown[]) => void logs.push(a)
  try {
    const r = await lire(await traiter(req, faux.deps(variables)))
    return { ...r, journal: faux.journal, appels: faux.appels, etat, logs }
  } finally {
    console.error = original
  }
}

/** Aucune écriture : ni ban, ni profil retiré, ni identité supprimée. */
function rienTouche(journal: string[]) {
  assert(
    !journal.some(
      (l) =>
        l.startsWith('updateUserById') ||
        l.startsWith('supprimerProfil') ||
        l.startsWith('deleteUser'),
    ),
    `écriture inattendue : ${journal.join(' > ')}`,
  )
}

const cible = (userId: unknown = 'b0000000-0000-4000-8000-0000000000b1') => ({ userId })

// ─── Transport ────────────────────────────────────────────────────────────

Deno.test('OPTIONS → pré-vol CORS, rien touché ; GET → 405', async () => {
  // Oracle : `Access-Control-Allow-Methods: POST, OPTIONS`.
  const o = await appeler(requete(null, { methode: 'OPTIONS' }))
  assertEquals(o.status, 200)
  assertEquals(o.journal, [])
  const g = await appeler(requete(null, { methode: 'GET' }))
  assertEquals(g.status, 405)
  assertEquals(g.journal, [])
})

Deno.test('configuration absente → 500, aucun client', async () => {
  // Oracle : « secret absent = erreur 500 », aucun repli legacy hors local.
  const r = await appeler(requete(cible()), undefined, {
    SUPABASE_URL: 'https://p.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'legacy',
  })
  assertEquals(r.status, 500)
  assertEquals(r.appels, [])
})

// ─── Authentification et autorisation (priorité) ──────────────────────────

Deno.test('sans jeton → 401, aucune lecture', async () => {
  // Oracle : en-tête, défense n° 1-2.
  const r = await appeler(requete(cible(), { jeton: null }))
  assertEquals(r.status, 401)
  assertEquals(r.corps.error, 'Non authentifié')
  assertEquals(r.journal, [])
  // « Bearer » seul : l'en-tête est rogné par Headers, le mot part comme
  // jeton et GoTrue le refuse — 401 quand même, rien touché.
  const vide = await appeler(requete(cible(), { jeton: '' }))
  assertEquals(vide.status, 401)
  rienTouche(vide.journal)
})

Deno.test('jeton invalide ou GoTrue en panne → 401, rien touché', async () => {
  // Oracle : « Identité de l'appelant (JWT validé côté serveur) » ; erreurs
  // génériques.
  const r1 = await appeler(requete(cible(), { jeton: 'forge' }))
  assertEquals(r1.status, 401)
  assertEquals(r1.corps.error, 'Session invalide')
  rienTouche(r1.journal)
  const etat = etatDeBase()
  etat.pannes.getUser = erreur()
  const r2 = await appeler(requete(cible()), etat)
  assertEquals(r2.status, 401)
  assert(!r2.texte.includes(DETAIL_INTERNE))
  rienTouche(r2.journal)
})

Deno.test('appelant non admin → 403, la cible reste intacte', async () => {
  // Oracle : « SEUL un `admin` peut poursuivre (403 sinon) ».
  for (const role of ['utilisateur', 'super_utilisateur', 'gestion', 'ADMIN']) {
    const etat = etatDeBase()
    etat.jetons['jeton-autre'] = 'e0000000-0000-4000-8000-0000000000e1'
    etat.identites.set('e0000000-0000-4000-8000-0000000000e1', { id: 'e0000000-0000-4000-8000-0000000000e1', email: 'o@exemple.test', created_at: '2026-01-01T00:00:00Z' })
    etat.profils.set('e0000000-0000-4000-8000-0000000000e1', { id: 'e0000000-0000-4000-8000-0000000000e1', role })
    const r = await appeler(requete(cible(), { jeton: 'jeton-autre' }), etat)
    assertEquals(r.status, 403, `rôle ${role}`)
    assertEquals(r.corps.error, 'Réservé aux administrateurs')
    rienTouche(r.journal)
    assert(etat.profils.has('b0000000-0000-4000-8000-0000000000b1'))
  }
})

Deno.test('appelant sans profil ou rôle illisible → 403 (garde FERMÉE)', async () => {
  // Oracle : audit 2026-09-28 — un rôle NULL ne passe jamais une garde.
  const e1 = etatDeBase()
  e1.profils.delete('b0000000-0000-4000-8000-0000000000b1')
  e1.profils.set('c0000000-0000-4000-8000-0000000000c2', { id: 'c0000000-0000-4000-8000-0000000000c2', role: 'utilisateur' })
  const r1 = await appeler(requete(cible('c0000000-0000-4000-8000-0000000000c2'), { jeton: 'jeton-user' }), e1)
  assertEquals(r1.status, 403)
  rienTouche(r1.journal)
  const e2 = etatDeBase()
  e2.pannes.lireProfil = erreur()
  const r2 = await appeler(requete(cible()), e2)
  assertEquals(r2.status, 403)
  assert(!r2.texte.includes(DETAIL_INTERNE))
  rienTouche(r2.journal)
})

// ─── Entrées ──────────────────────────────────────────────────────────────

Deno.test('JSON cassé → 400 « Corps de requête invalide »', async () => {
  // Oracle : étape 3 ; refus clair.
  const r = await appeler(requete(null, { brut: 'pas du json' }))
  assertEquals(r.status, 400)
  assertEquals(r.corps.error, 'Corps de requête invalide')
  rienTouche(r.journal)
})

Deno.test('identifiant absent ou blanc → 400', async () => {
  // Oracle : « Identifiant du compte requis ».
  for (const corps of [{}, { userId: '' }, { userId: '   ' }]) {
    const r = await appeler(requete(corps))
    assertEquals(r.status, 400, JSON.stringify(corps))
    assertEquals(r.corps.error, 'Identifiant du compte requis')
    rienTouche(r.journal)
  }
})

Deno.test('un admin ne peut pas supprimer son propre compte (même entouré d’espaces)', async () => {
  // Oracle : 3bis « Garde anti-auto-exclusion : jamais son propre compte ».
  const etat = etatDeBase()
  const r = await appeler(requete(cible('  a0000000-0000-4000-8000-0000000000a1 ')), etat)
  assertEquals(r.status, 400)
  assertEquals(r.corps.error, 'Vous ne pouvez pas supprimer votre propre compte')
  rienTouche(r.journal)
  assert(etat.identites.has('a0000000-0000-4000-8000-0000000000a1') && etat.profils.has('a0000000-0000-4000-8000-0000000000a1'))
})

Deno.test('cible sans profil → 404, rien touché', async () => {
  // Oracle : 3ter « Le compte cible DOIT avoir un profil ».
  const etat = etatDeBase()
  etat.identites.set('d0000000-0000-4000-8000-0000000000d1', { id: 'd0000000-0000-4000-8000-0000000000d1', email: 'o@exemple.test', created_at: '2026-01-01T00:00:00Z' })
  const r = await appeler(requete(cible('d0000000-0000-4000-8000-0000000000d1')), etat)
  assertEquals(r.status, 404)
  rienTouche(r.journal)
  assert(etat.identites.has('d0000000-0000-4000-8000-0000000000d1'))
})

Deno.test('lecture du profil cible en erreur → 400 générique, rien touché', async () => {
  // Oracle : « Détail côté serveur uniquement (B3) ; message générique ».
  const etat = etatDeBase()
  const faux = fauxClientAdmin(etat)
  // 1re lecture (rôle de l'appelant) réussie, 2e (cible) en panne.
  let n = 0
  const from = faux.client.from.bind(faux.client)
  faux.client.from = (t: string) => {
    const q = from(t)
    const select = q.select
    q.select = (c: string) => {
      if (++n === 2) etat.pannes.lireProfil = erreur()
      return select(c)
    }
    return q
  }
  const original = console.error
  const logs: unknown[][] = []
  console.error = (...a: unknown[]) => void logs.push(a)
  try {
    const r = await lire(await traiter(requete(cible()), faux.deps()))
    assertEquals(r.status, 400)
    assertEquals(r.corps, { error: 'Vérification du compte échouée' })
    assert(!r.texte.includes(DETAIL_INTERNE))
    assert(JSON.stringify(logs).includes(DETAIL_INTERNE))
    rienTouche(faux.journal)
  } finally {
    console.error = original
  }
})

Deno.test('cible ADMIN → 403, jamais supprimée', async () => {
  // Oracle : 3quater « Ne jamais supprimer un autre ADMIN ».
  const etat = etatDeBase()
  etat.profils.set('a0000000-0000-4000-8000-0000000000a2', { id: 'a0000000-0000-4000-8000-0000000000a2', role: 'admin' })
  etat.identites.set('a0000000-0000-4000-8000-0000000000a2', { id: 'a0000000-0000-4000-8000-0000000000a2', email: 'a2@exemple.test', created_at: '2026-01-01T00:00:00Z' })
  const r = await appeler(requete(cible('a0000000-0000-4000-8000-0000000000a2')), etat)
  assertEquals(r.status, 403)
  assertEquals(r.corps.error, 'Impossible de supprimer un compte administrateur.')
  rienTouche(r.journal)
  assert(etat.profils.has('a0000000-0000-4000-8000-0000000000a2') && etat.identites.has('a0000000-0000-4000-8000-0000000000a2'))
})

// ─── Ordre des opérations ─────────────────────────────────────────────────

Deno.test('chemin nominal : ban → retrait du profil → suppression définitive', async () => {
  // Oracle : 3quinquies « Accès coupé AVANT toute suppression » (revue
  // 2026-09-28), puis étape 4 (profil, à cause de la FK) puis étape 5.
  const etat = etatDeBase()
  const r = await appeler(requete(cible()), etat)
  assertEquals(r.status, 200)
  assertEquals(r.corps, { deleted: 'b0000000-0000-4000-8000-0000000000b1', mode: 'deleted' })
  assertEquals(r.journal, [
    'getUser',
    'lireProfil(a0000000-0000-4000-8000-0000000000a1)',
    'lireProfil(b0000000-0000-4000-8000-0000000000b1)',
    BAN,
    'supprimerProfil(b0000000-0000-4000-8000-0000000000b1)',
    'deleteUser(b0000000-0000-4000-8000-0000000000b1)',
  ])
  assertEquals(etat.profils.has('b0000000-0000-4000-8000-0000000000b1'), false)
  assertEquals(etat.identites.has('b0000000-0000-4000-8000-0000000000b1'), false)
})

Deno.test('échec du ban → 500 visible, RIEN supprimé', async () => {
  // Oracle : « Bannir d'abord : un échec ici ne change rien, l'admin peut
  // réessayer » ; message « Rien n'a été supprimé ».
  const etat = etatDeBase()
  etat.pannes.updateUserById = erreur()
  const r = await appeler(requete(cible()), etat)
  assertEquals(r.status, 500)
  assert(String(r.corps.error).includes('Rien n’a été supprimé'))
  assert(!r.texte.includes(DETAIL_INTERNE))
  assert(!r.journal.some((l) => l.startsWith('supprimerProfil') || l.startsWith('deleteUser')))
  assert(etat.profils.has('b0000000-0000-4000-8000-0000000000b1') && etat.identites.has('b0000000-0000-4000-8000-0000000000b1'))
})

Deno.test('échec du retrait du profil → ban LEVÉ, 400, identité gardée', async () => {
  // Oracle : étape 4 « Le ban vient d'être posé : le lever, sinon le compte
  // resterait bloqué tout en paraissant actif dans /comptes ».
  const etat = etatDeBase()
  etat.pannes.supprimerProfil = erreur()
  const r = await appeler(requete(cible()), etat)
  assertEquals(r.status, 400)
  assertEquals(r.corps, { error: 'Suppression du profil échouée' })
  assertEquals(r.journal.slice(-3), [BAN, 'supprimerProfil(b0000000-0000-4000-8000-0000000000b1)', UNBAN])
  assert(!r.journal.some((l) => l.startsWith('deleteUser')))
  assertEquals(etat.identites.get('b0000000-0000-4000-8000-0000000000b1')?.banned_until, undefined)
  assert(etat.profils.has('b0000000-0000-4000-8000-0000000000b1'))
})

Deno.test('échec du retrait du profil ET de la levée du ban → 500 qui le dit', async () => {
  // Oracle : « l'accès du compte est resté bloqué. Réessayez la suppression. »
  const etat = etatDeBase()
  etat.pannes.supprimerProfil = erreur()
  etat.panneLeveeBan = erreur()
  const r = await appeler(requete(cible()), etat)
  assertEquals(r.status, 500)
  assert(String(r.corps.error).includes('resté bloqué'))
  assert(!r.texte.includes(DETAIL_INTERNE))
  assert(!r.journal.some((l) => l.startsWith('deleteUser')))
})

Deno.test('suppression définitive refusée (FK) → 200 « banned » SEULEMENT ban posé', async () => {
  // Oracle : étape 5 — repli documenté : profil retiré, identité subsiste mais
  // BANNIE ; « warning » explicite. Le 200 n'est légitime que parce que le ban
  // a réussi plus haut (sinon on serait sorti en 500).
  const etat = etatDeBase()
  etat.pannes.deleteUser = erreur('23503')
  const r = await appeler(requete(cible()), etat)
  assertEquals(r.status, 200)
  assertEquals(r.corps.mode, 'banned')
  assert(typeof r.corps.warning === 'string')
  assert(!r.texte.includes(DETAIL_INTERNE))
  assertEquals(etat.identites.get('b0000000-0000-4000-8000-0000000000b1')?.banned_until, 'ban:876000h')
  assertEquals(etat.profils.has('b0000000-0000-4000-8000-0000000000b1'), false)
})

Deno.test('aucun 200 quand une étape d’écriture a échoué avant la suppression', async () => {
  // Oracle : consigne de l'audit 2026-09-28 — « jamais de succès annoncé à
  // tort » ; balayage de toutes les pannes avant l'étape 5.
  for (const op of ['getUser', 'lireProfil', 'updateUserById', 'supprimerProfil'] as const) {
    const etat = etatDeBase()
    etat.pannes[op] = erreur()
    const r = await appeler(requete(cible()), etat)
    assert(r.status >= 400, `${op} → ${r.status}`)
    assertEquals(r.corps.deleted, undefined, op)
    assert(!r.texte.includes(DETAIL_INTERNE), op)
  }
})

// ─── Défauts corrigés ─────────────────────────────────────────────────────
// Anciens tests « DÉFAUT » (échec attendu), basculés en tests normaux une
// fois le gestionnaire corrigé.

Deno.test('identifiant non textuel (`{"userId": 42}`…) → 400, rien touché', async () => {
  // Oracle : « refus clair » d'une entrée invalide. Avant le correctif,
  // `(42).trim` levait et Deno.serve rendait un 500 opaque.
  for (const userId of [42, true, ['b0000000-0000-4000-8000-0000000000b1'], { id: 'b0000000-0000-4000-8000-0000000000b1' }]) {
    const etat = etatDeBase()
    const r = await appeler(requete(cible(userId)), etat)
    const nom = JSON.stringify(userId)
    assertEquals(r.status, 400, nom)
    assertEquals(r.corps, { error: 'Corps de requête invalide' }, nom)
    rienTouche(r.journal)
  }
})

Deno.test('identifiant `null` → traité comme absent (« Identifiant du compte requis »)', async () => {
  const r = await appeler(requete(cible(null)))
  assertEquals(r.status, 400)
  assertEquals(r.corps.error, 'Identifiant du compte requis')
  rienTouche(r.journal)
})

Deno.test('corps JSON valide mais non objet (null, 42, [], "x") → 400, rien touché', async () => {
  // Oracle : « refus clair » d'une entrée invalide, même réponse que le JSON
  // cassé. Avant le correctif, `null.userId` levait : 500 opaque.
  for (const brut of ['null', '42', '[]', '"x"', 'true']) {
    const r = await appeler(requete(null, { brut }))
    assertEquals(r.status, 400, brut)
    assertEquals(r.corps, { error: 'Corps de requête invalide' }, brut)
    rienTouche(r.journal)
  }
})

// ─── Audit du 2026-10-17 : comparaison « pas soi-même » sur la forme canonique ─

Deno.test('son propre UUID en MAJUSCULES ou entre accolades ne passe plus la garde', async () => {
  // Avant : `"A0000000-…-0000000000A1" === caller.id` était faux, la garde
  // anti-auto-exclusion était sautée (Postgres et GoTrue lisent pourtant le
  // même compte). Majuscules → reconnu comme soi-même ; accolades → refusé.
  const etat = etatDeBase()
  const maj = await appeler(requete(cible(ADMIN_ID.toUpperCase())), etat)
  assertEquals(maj.status, 400)
  assertEquals(maj.corps.error, 'Vous ne pouvez pas supprimer votre propre compte')
  rienTouche(maj.journal)
  for (const forme of [`{${ADMIN_ID}}`, `{${ADMIN_ID.toUpperCase()}}`, `urn:uuid:${ADMIN_ID}`]) {
    const r = await appeler(requete(cible(forme)), etat)
    assertEquals(r.status, 400, forme)
    assertEquals(r.corps.error, 'Identifiant du compte invalide', forme)
    rienTouche(r.journal)
  }
  assert(etat.identites.has(ADMIN_ID) && etat.profils.has(ADMIN_ID))
})

Deno.test('identifiant qui n’est pas un UUID strict → 400, rien touché', async () => {
  for (const userId of ['user-1', '1', ADMIN_ID.replace(/-/g, ''), `${USER_ID}x`, `${USER_ID} ; drop`]) {
    const r = await appeler(requete(cible(userId)))
    assertEquals(r.status, 400, userId)
    assertEquals(r.corps.error, 'Identifiant du compte invalide', userId)
    rienTouche(r.journal)
  }
})

Deno.test('cible en MAJUSCULES : supprimée sous sa forme canonique (minuscules)', async () => {
  const etat = etatDeBase()
  const r = await appeler(requete(cible(` ${USER_ID.toUpperCase()} `)), etat)
  assertEquals(r.status, 200)
  assertEquals(r.corps, { deleted: USER_ID, mode: 'deleted' })
  assertEquals(etat.identites.has(USER_ID), false)
})

Deno.test('normaliserUuid : forme stricte seulement', () => {
  assertEquals(normaliserUuid(` ${USER_ID.toUpperCase()} `), USER_ID)
  for (const x of ['', `{${USER_ID}}`, USER_ID.slice(1), `${USER_ID}0`, USER_ID.replace('b', 'g')])
    assertEquals(normaliserUuid(x), null, x)
})
