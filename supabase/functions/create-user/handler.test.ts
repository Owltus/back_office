// Tests de l'Edge Function `create-user` (gestionnaire `traiter`, handler.ts).
//
// Lancer : `deno test --no-check supabase/functions/create-user/`
// (`--no-check` : comme `send-report/marker.test.ts`, la vérification de types
// exigerait les paquets npm de supabase-js, absents du poste ; le gestionnaire
// n'en importe qu'un TYPE.)
//
// Faux client service_role injecté (`_shared/test/fauxClientAdmin.ts`) : aucun
// réseau. Les oracles cités sont la SPÉCIFICATION écrite (en-tête de index.ts,
// commentaires du gestionnaire, CLAUDE.md), jamais le code relu à rebours.

import {
  assert,
  assertEquals,
} from 'jsr:@std/assert@1'

import { traiter } from './handler.ts'
import {
  DETAIL_INTERNE,
  erreur,
  etatDeBase,
  fauxClientAdmin,
  lire,
  requete,
} from '../_shared/test/fauxClientAdmin.ts'
import type { EtatFaux } from '../_shared/test/fauxClientAdmin.ts'

const MDP_OK = 'Correct-Cheval-42'

/** Lance une requête ; console.error capturé (les détails vont au serveur). */
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

/** Aucune création ni suppression d'identité n'a été tentée. */
function rienEcrit(journal: string[]) {
  assert(
    !journal.some((l) => l.startsWith('createUser') || l.startsWith('deleteUser')),
    `écriture inattendue : ${journal.join(' > ')}`,
  )
}

// ─── Transport ────────────────────────────────────────────────────────────

Deno.test('OPTIONS répond au pré-vol CORS sans rien toucher', async () => {
  // Oracle : convention CORS des Edge Functions (pré-vol navigateur) ; le
  // client n'est même pas construit.
  const r = await appeler(requete(null, { methode: 'OPTIONS' }))
  assertEquals(r.status, 200)
  assertEquals(r.journal, [])
  assertEquals(r.appels, [])
})

Deno.test('une autre méthode que POST est refusée (405)', async () => {
  // Oracle : `Access-Control-Allow-Methods: POST, OPTIONS` (seul POST sert).
  const r = await appeler(requete(null, { methode: 'GET' }))
  assertEquals(r.status, 405)
  assertEquals(r.journal, [])
})

Deno.test('configuration absente → 500 générique, aucun client construit', async () => {
  // Oracle : commentaire « secret absent = erreur 500 », « Aucun repli » sur
  // la clé legacy (révoquée depuis le 2026-07-27).
  for (const variables of [
    { SUPABASE_URL: 'https://p.supabase.co' },
    { SB_SECRET_KEY: 'sb_secret_x' },
    // La clé legacy seule ne doit PAS servir de repli hors local.
    { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'legacy' },
  ]) {
    const r = await appeler(requete({ email: 'a@b.fr', password: MDP_OK }), undefined, variables)
    assertEquals(r.status, 500)
    assertEquals(r.corps.error, 'Configuration serveur manquante')
    assertEquals(r.appels, [])
  }
})

Deno.test('le client est construit avec SB_SECRET_KEY du projet hébergé', async () => {
  // Oracle : `_shared/environnement.ts` (cleServeur) — hors local, SB_SECRET_KEY.
  const r = await appeler(requete({ email: 'neuf@exemple.test', password: MDP_OK }))
  assertEquals(r.appels, [{ url: 'https://projet-essai.supabase.co', cle: 'sb_secret_essai' }])
})

// ─── Authentification et autorisation (priorité) ──────────────────────────

Deno.test('sans en-tête Authorization → 401, aucune lecture', async () => {
  // Oracle : en-tête, défense n° 1-2 « toute requête sans JWT valide est rejetée ».
  const r = await appeler(requete({ email: 'a@exemple.test', password: MDP_OK }, { jeton: null }))
  assertEquals(r.status, 401)
  assertEquals(r.corps.error, 'Non authentifié')
  assertEquals(r.journal, [])
})

Deno.test('« Bearer » sans jeton → 401', async () => {
  // Oracle : idem ; un préfixe vide n'est pas un jeton.
  const r = await appeler(requete({ email: 'a@exemple.test', password: MDP_OK }, { jeton: '' }))
  assertEquals(r.status, 401)
  rienEcrit(r.journal)
})

Deno.test('jeton invalide → 401 « Session invalide », rien créé', async () => {
  // Oracle : « Identité de l'appelant (JWT validé côté serveur) ».
  const r = await appeler(requete({ email: 'a@exemple.test', password: MDP_OK }, { jeton: 'forge' }))
  assertEquals(r.status, 401)
  assertEquals(r.corps.error, 'Session invalide')
  assertEquals(r.journal, ['getUser'])
})

Deno.test('panne de GoTrue sur getUser → 401, sans détail interne', async () => {
  // Oracle : une identité non prouvée vaut refus ; erreurs génériques (CLAUDE.md,
  // pentest 2026-08-04).
  const etat = etatDeBase()
  etat.pannes.getUser = erreur()
  const r = await appeler(requete({ email: 'a@exemple.test', password: MDP_OK }), etat)
  assertEquals(r.status, 401)
  assert(!r.texte.includes(DETAIL_INTERNE))
  rienEcrit(r.journal)
})

Deno.test('appelant non admin → 403, rien créé', async () => {
  // Oracle : « SEUL un `admin` peut poursuivre. Un super_utilisateur, un
  // utilisateur ou un anonyme est refusé (403) ».
  for (const role of ['utilisateur', 'super_utilisateur', 'gestion', 'Admin', '']) {
    const etat = etatDeBase()
    etat.profils.set('user-1', { id: 'user-1', role })
    const r = await appeler(
      requete({ email: 'x@exemple.test', password: MDP_OK }, { jeton: 'jeton-user' }),
      etat,
    )
    assertEquals(r.status, 403, `rôle ${role}`)
    assertEquals(r.corps.error, 'Réservé aux administrateurs')
    rienEcrit(r.journal)
  }
})

Deno.test('appelant SANS profil (compte révoqué au jeton encore valide) → 403', async () => {
  // Oracle : leçon de l'audit 2026-09-28 — un rôle NULL ne doit jamais passer
  // une garde (`admin_update_password`). `.single()` sur 0 ligne = erreur.
  const etat = etatDeBase()
  etat.profils.delete('user-1')
  const r = await appeler(
    requete({ email: 'x@exemple.test', password: MDP_OK }, { jeton: 'jeton-user' }),
    etat,
  )
  assertEquals(r.status, 403)
  rienEcrit(r.journal)
})

Deno.test('lecture du rôle en erreur → 403 (la garde échoue FERMÉE)', async () => {
  // Oracle : « la décision est prise côté serveur » ; un rôle illisible n'est
  // pas un rôle admin.
  const etat = etatDeBase()
  etat.pannes.lireProfil = erreur()
  const r = await appeler(requete({ email: 'x@exemple.test', password: MDP_OK }), etat)
  assertEquals(r.status, 403)
  assert(!r.texte.includes(DETAIL_INTERNE))
  rienEcrit(r.journal)
})

Deno.test('le rôle lu est celui de l’APPELANT du jeton, pas une donnée du corps', async () => {
  // Oracle : en-tête, défense n° 2 « on lit le rôle de l'APPELANT ».
  const r = await appeler(
    requete(
      { email: 'x@exemple.test', password: MDP_OK, role: 'admin', userId: 'admin-1' },
      { jeton: 'jeton-user' },
    ),
  )
  assertEquals(r.status, 403)
  assertEquals(r.journal, ['getUser', 'lireProfil(user-1)'])
})

// ─── Entrées ──────────────────────────────────────────────────────────────

Deno.test('JSON cassé → 400 « Corps de requête invalide »', async () => {
  // Oracle : étape 3 « Corps de requête » ; refus clair sans pile d'erreur.
  const r = await appeler(requete(null, { brut: '{"email": "a@b' }))
  assertEquals(r.status, 400)
  assertEquals(r.corps.error, 'Corps de requête invalide')
  rienEcrit(r.journal)
})

Deno.test('e-mail ou mot de passe manquant → 400', async () => {
  // Oracle : « Email et mot de passe requis ».
  for (const corps of [
    {},
    { email: 'a@exemple.test' },
    { password: MDP_OK },
    { email: '   ', password: MDP_OK },
    { email: 'a@exemple.test', password: '' },
  ]) {
    const r = await appeler(requete(corps))
    assertEquals(r.status, 400, JSON.stringify(corps))
    assertEquals(r.corps.error, 'Email et mot de passe requis')
    rienEcrit(r.journal)
  }
})

Deno.test('e-mail mal formé → 400 « Email invalide »', async () => {
  // Oracle : forme `local@domaine.tld`, sans espace ni second @.
  for (const email of ['sans-arobase', 'a@b', '@exemple.test', 'a@@exemple.test', 'a b@exemple.test', 'a@exemple.']) {
    const r = await appeler(requete({ email, password: MDP_OK }))
    assertEquals(r.status, 400, email)
    assertEquals(r.corps.error, 'Email invalide')
    rienEcrit(r.journal)
  }
})

Deno.test('mot de passe hors critères → 400, un critère manquant à la fois', async () => {
  // Oracle : « Miroir serveur de src/lib/repjour/password.ts (mêmes 5
  // critères) » et CLAUDE.md « mot de passe 12 + complexité ».
  for (const password of [
    'Court-Mdp-1', // 11 caractères
    'minuscules-42-x', // sans majuscule
    'MAJUSCULES-42-X', // sans minuscule
    'Sans-Chiffre-Ici', // sans chiffre
    'SansSpecial4242', // sans caractère spécial
  ]) {
    const r = await appeler(requete({ email: 'a@exemple.test', password }))
    assertEquals(r.status, 400, password)
    assertEquals(r.corps.error, 'Le mot de passe ne respecte pas les critères')
    rienEcrit(r.journal)
  }
})

Deno.test('mot de passe de 12 caractères exactement, 5 critères → accepté', async () => {
  // Oracle : borne `>= 12`.
  const r = await appeler(requete({ email: 'borne@exemple.test', password: 'Abcdefgh1-xy' }))
  assertEquals(r.status, 200)
})

// ─── Création ─────────────────────────────────────────────────────────────

Deno.test('création réussie : e-mail normalisé, confirmé, nom par défaut', async () => {
  // Oracle : étape 5 « email confirmé : aucun mail de vérification requis » ;
  // nom affiché par défaut = partie locale ; e-mail trim + minuscules.
  const etat = etatDeBase()
  const r = await appeler(requete({ email: '  Jean.Dupont@Exemple.TEST ', password: MDP_OK }), etat)
  assertEquals(r.status, 200)
  assertEquals(r.corps.email, 'jean.dupont@exemple.test')
  assertEquals(r.corps.displayName, 'jean.dupont')
  const cree = etat.identites.get(r.corps.userId as string) as unknown as Record<string, unknown>
  assertEquals(cree.email, 'jean.dupont@exemple.test')
  assertEquals(cree.email_confirm, true)
  assertEquals(cree.user_metadata, { display_name: 'jean.dupont' })
  // Oracle : « La fonction ne crée QUE l'identifiant `auth.users` » — aucun profil.
  assertEquals(etat.profils.has(r.corps.userId as string), false)
})

Deno.test('le nom affiché fourni est gardé (rogné)', async () => {
  // Oracle : `displayName.trim() || partie locale`.
  const r = await appeler(requete({ email: 'm@exemple.test', password: MDP_OK, displayName: '  Marie  ' }))
  assertEquals(r.corps.displayName, 'Marie')
})

Deno.test('e-mail déjà pris → 409 explicite', async () => {
  // Oracle : message « Un compte existe déjà avec cet email », statut 409.
  const r = await appeler(requete({ email: 'USER@exemple.test', password: MDP_OK }))
  assertEquals(r.status, 409)
  assertEquals(r.corps.error, 'Un compte existe déjà avec cet email')
})

Deno.test('échec de createUser → 400 générique, détail au journal serveur seulement', async () => {
  // Oracle : « Détail côté serveur uniquement (Mineur-1) ; message générique au
  // client » ; jamais de 200 quand l'étape échoue.
  const etat = etatDeBase()
  etat.pannes.createUser = erreur('unexpected_failure')
  const r = await appeler(requete({ email: 'n@exemple.test', password: MDP_OK }), etat)
  assertEquals(r.status, 400)
  assertEquals(r.corps, { error: 'Création du compte échouée' })
  assert(!r.texte.includes(DETAIL_INTERNE))
  assert(JSON.stringify(r.logs).includes(DETAIL_INTERNE), 'le détail doit aller au journal')
})

// ─── Annulation (rollback) d'un compte orphelin ───────────────────────────

function etatAvecOrphelin(ilYAms: number): EtatFaux {
  const etat = etatDeBase()
  etat.identites.set('orphelin', {
    id: 'orphelin',
    email: 'orphelin@exemple.test',
    created_at: new Date(Date.now() - ilYAms).toISOString(),
  })
  return etat
}

Deno.test('annulation : compte créé à l’instant SANS profil → supprimé', async () => {
  // Oracle : 3bis — le front annule quand `profiles` a échoué après la création.
  const etat = etatAvecOrphelin(60_000)
  const r = await appeler(requete({ rollbackUserId: 'orphelin' }), etat)
  assertEquals(r.status, 200)
  assertEquals(r.corps, { rolledBack: 'orphelin' })
  assertEquals(etat.identites.has('orphelin'), false)
})

Deno.test('annulation : refusée à un non-admin (les gardes passent AVANT)', async () => {
  // Oracle : étapes 1-2 avant 3bis ; seul un admin agit sur auth.users.
  const etat = etatAvecOrphelin(60_000)
  const r = await appeler(requete({ rollbackUserId: 'orphelin' }, { jeton: 'jeton-user' }), etat)
  assertEquals(r.status, 403)
  assertEquals(etat.identites.has('orphelin'), true)
  rienEcrit(r.journal)
})

Deno.test('annulation : refusée si le compte a un profil (compte établi)', async () => {
  // Oracle : « on ne supprime QUE si AUCUNE ligne `profiles` n'existe pour cet
  // id → impossible de détruire un compte établi ».
  // Créé il y a 1 min (dans la fenêtre) : seule la garde du profil peut le sauver.
  const etat = etatAvecOrphelin(60_000)
  etat.profils.set('orphelin', { id: 'orphelin', role: 'utilisateur' })
  const r = await appeler(requete({ rollbackUserId: 'orphelin' }), etat)
  assertEquals(r.status, 409)
  assertEquals(etat.identites.has('orphelin'), true)
  rienEcrit(r.journal)
})

Deno.test('annulation : refusée au-delà de 10 minutes', async () => {
  // Oracle : F6 / CLAUDE.md « rollback `create-user` borné à 10 min ».
  const etat = etatAvecOrphelin(10 * 60 * 1000 + 5_000)
  const r = await appeler(requete({ rollbackUserId: 'orphelin' }), etat)
  assertEquals(r.status, 409)
  assertEquals(etat.identites.has('orphelin'), true)
  rienEcrit(r.journal)
})

Deno.test('annulation : identité inconnue ou illisible → refusée', async () => {
  // Oracle : F6 — sans date de création prouvée, pas de suppression (NaN refusé).
  const r1 = await appeler(requete({ rollbackUserId: 'fantome' }))
  assertEquals(r1.status, 409)
  rienEcrit(r1.journal)
  const etat = etatAvecOrphelin(60_000)
  etat.pannes.getUserById = erreur()
  const r2 = await appeler(requete({ rollbackUserId: 'orphelin' }), etat)
  assertEquals(r2.status, 409)
  assertEquals(etat.identites.has('orphelin'), true)
  rienEcrit(r2.journal)
})

Deno.test('annulation : échec de deleteUser → 400 générique, jamais 200', async () => {
  // Oracle : « Annulation échouée » ; jamais « rolledBack » annoncé à tort.
  const etat = etatAvecOrphelin(60_000)
  etat.pannes.deleteUser = erreur()
  const r = await appeler(requete({ rollbackUserId: 'orphelin' }), etat)
  assertEquals(r.status, 400)
  assertEquals(r.corps, { error: 'Annulation échouée' })
  assert(!r.texte.includes(DETAIL_INTERNE))
})

// ─── Défauts corrigés ─────────────────────────────────────────────────────
// Anciens tests « DÉFAUT » (échec attendu), basculés en tests normaux une
// fois le gestionnaire corrigé.

Deno.test(
  'annulation : la lecture du profil en ERREUR refuse la suppression (400 générique)',
  async () => {
    // Oracle : 3bis « on ne supprime QUE si AUCUNE ligne `profiles` n'existe »
    // — une lecture en échec ne prouve pas l'absence. Avant le correctif,
    // `{ data: existing }` ignorait `error` : un compte de moins de 10 min AVEC
    // profil était supprimé si cette lecture échouait (garde ouverte en panne).
    const etat = etatAvecOrphelin(60_000)
    etat.profils.set('orphelin', { id: 'orphelin', role: 'utilisateur' })
    // La lecture du rôle de l'appelant réussit, celle de la cible échoue.
    const faux = fauxClientAdmin(etat)
    const lectures = { n: 0 }
    const from = faux.client.from.bind(faux.client)
    faux.client.from = (t: string) => {
      const q = from(t)
      const select = q.select
      q.select = (c: string) => {
        lectures.n++
        if (lectures.n === 2) etat.pannes.lireProfil = erreur()
        return select(c)
      }
      return q
    }
    const logs: unknown[][] = []
    const original = console.error
    console.error = (...a: unknown[]) => void logs.push(a)
    try {
      const r = await lire(await traiter(requete({ rollbackUserId: 'orphelin' }), faux.deps()))
      assertEquals(lectures.n, 2, 'la lecture du profil cible doit avoir eu lieu')
      assertEquals(etat.identites.has('orphelin'), true, 'compte avec profil supprimé')
      rienEcrit(faux.journal)
      assertEquals(r.status, 400)
      assertEquals(r.corps, { error: 'Vérification du compte échouée' })
      assert(!r.texte.includes(DETAIL_INTERNE), 'détail de la base exposé au client')
      assert(JSON.stringify(logs).includes(DETAIL_INTERNE), 'le détail doit aller au journal')
    } finally {
      console.error = original
    }
  },
)

Deno.test('corps JSON valide mais non objet (null, 42, [], "x") → 400, rien écrit', async () => {
  // Oracle : « refus clair » d'une entrée invalide, même réponse que le JSON
  // cassé. Avant le correctif, `null.rollbackUserId` levait une TypeError :
  // Deno.serve rendait un 500 opaque.
  for (const brut of ['null', '42', '[]', '"x"', 'true']) {
    const r = await appeler(requete(null, { brut }))
    assertEquals(r.status, 400, brut)
    assertEquals(r.corps, { error: 'Corps de requête invalide' }, brut)
    rienEcrit(r.journal)
  }
})

Deno.test('champ texte non chaîne (`{"email": 5}`…) → 400, rien écrit', async () => {
  // Oracle : idem. Avant le correctif, `(5).trim` levait : 500 opaque.
  const mail = 'a@exemple.test'
  for (const corps of [
    { email: 5, password: MDP_OK },
    { email: ['a@exemple.test'], password: MDP_OK },
    { email: mail, password: 123456789012 },
    { email: mail, password: { v: MDP_OK } },
    { email: mail, password: MDP_OK, displayName: 7 },
    { email: mail, password: MDP_OK, displayName: false },
    { rollbackUserId: 42 },
    { rollbackUserId: true },
    { rollbackUserId: { id: 'orphelin' } },
  ]) {
    const etat = etatAvecOrphelin(60_000)
    const r = await appeler(requete(corps), etat)
    const nom = JSON.stringify(corps)
    assertEquals(r.status, 400, nom)
    assertEquals(r.corps, { error: 'Corps de requête invalide' }, nom)
    assertEquals(etat.identites.has('orphelin'), true, nom)
    rienEcrit(r.journal)
  }
})

Deno.test('champ texte facultatif à `null` → traité comme absent', async () => {
  // Oracle : `displayName` absent = nom tiré de l'e-mail ; `null` n'est pas
  // une valeur invalide, juste une absence.
  const r = await appeler(
    requete({ email: 'nul@exemple.test', password: MDP_OK, displayName: null, rollbackUserId: null }),
  )
  assertEquals(r.status, 200)
  assertEquals(r.corps.displayName, 'nul')
})
