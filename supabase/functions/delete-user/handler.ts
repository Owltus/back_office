// Gestionnaire HTTP de `delete-user`, sorti de `index.ts` pour être testé sans
// monter le serveur (même mécanisme que `send-report/marker.ts`). Le corps est
// celui de l'ancien `Deno.serve`, à l'identique : seules la lecture des
// variables et la création du client service_role sont INJECTÉES (`deps`).
// `index.ts` les branche sur `Deno.env` et `createClient`.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.115.0'
import { cleServeur } from '../_shared/environnement.ts'
import type { LireVariable } from '../_shared/environnement.ts'

export type Dependances = {
  /** Lecture d'une variable d'environnement (`Deno.env.get` en vrai). */
  lire: LireVariable
  /** Client service_role, sans session persistée. */
  creerClient: (url: string, cle: string) => SupabaseClient
}

/** Forme canonique d'un UUID (minuscules), ou null si `brut` n'en est pas un.
 *
 *  Audit du 2026-10-17 : la garde « pas soi-même » comparait des chaînes
 *  exactes, alors que Postgres (`uuid`) et GoTrue acceptent aussi un UUID en
 *  MAJUSCULES ou entre accolades — `"ADMIN-UUID"` passait la garde et désignait
 *  pourtant le compte de l'appelant. On n'accepte donc que la forme stricte
 *  8-4-4-4-12 hexadécimale (sans accolades), ramenée en minuscules, et c'est
 *  CETTE forme qui sert à la comparaison et à toutes les opérations. */
export function normaliserUuid(brut: string): string | null {
  const s = brut.trim().toLowerCase()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)
    ? s
    : null
}

// Ban « quasi permanent » (Go duration). 'none' lèverait le ban (réactivation).
const BAN_DURATION = '876000h' // ~100 ans

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

export async function traiter(
  req: Request,
  deps: Dependances,
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  const url = deps.lire('SUPABASE_URL')
  // Clé secrète : la `sb_secret_…` du secret SB_SECRET_KEY, et elle seule.
  // Aucun repli : la clé service_role legacy est révoquée depuis le 2026-07-27
  // (clés JWT legacy désactivées) ; secret absent = erreur 500 ci-dessous.
  const serviceKey = cleServeur(deps.lire)
  if (!url || !serviceKey)
    return json({ error: 'Configuration serveur manquante' }, 500)

  // Client service_role : valide le JWT de l'appelant, lit son rôle (sans RLS)
  // puis révoque le compte cible. Ne persiste aucune session.
  const admin = deps.creerClient(url, serviceKey)

  // 1. Identité de l'appelant (JWT validé côté serveur).
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Non authentifié' }, 401)

  const {
    data: { user: caller },
    error: callerErr,
  } = await admin.auth.getUser(token)
  if (callerErr || !caller) return json({ error: 'Session invalide' }, 401)

  // 2. Autorisation : l'appelant DOIT être admin.
  const { data: prof, error: profErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()
  if (profErr || prof?.role !== 'admin')
    return json({ error: 'Réservé aux administrateurs' }, 403)

  // 3. Corps de requête.
  let body: { userId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corps de requête invalide' }, 400)
  }
  // Un JSON valide n'est pas forcément un objet (`null`, `42`, `[]`, `"x"`) :
  // sans ce refus, `null.userId` lèverait et Deno.serve rendrait un 500.
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return json({ error: 'Corps de requête invalide' }, 400)
  // Identifiant : absent (ou null) accepté (refusé plus bas), sinon CHAÎNE
  // seulement. Sans ce refus, `(42).trim` lèverait (500 opaque).
  if (body.userId != null && typeof body.userId !== 'string')
    return json({ error: 'Corps de requête invalide' }, 400)
  const saisi = (body.userId ?? '').trim()
  if (!saisi) return json({ error: 'Identifiant du compte requis' }, 400)
  const userId = normaliserUuid(saisi)
  if (!userId) return json({ error: 'Identifiant du compte invalide' }, 400)

  // 3bis. Garde anti-auto-exclusion : jamais son propre compte (formes
  //       canoniques des DEUX côtés, cf. normaliserUuid).
  if (userId === caller.id.toLowerCase())
    return json({ error: 'Vous ne pouvez pas supprimer votre propre compte' }, 400)

  // 3ter. Le compte cible DOIT avoir un profil (compte réellement géré). Empêche
  //       de supprimer un userId sans profil (identité orpheline / inexistante
  //       dans la gestion des comptes). NB : `profiles` étant partagé, cette garde
  //       ne distingue pas les deux apps — elle écarte seulement les uid sans profil.
  const { data: target, error: targetErr } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle()
  if (targetErr) {
    // Détail côté serveur uniquement (B3) ; message générique au client.
    console.error('delete-user: lecture profil cible', targetErr)
    return json({ error: 'Vérification du compte échouée' }, 400)
  }
  if (!target)
    return json({ error: 'Compte introuvable dans la gestion des comptes' }, 404)

  // 3quater. Ne jamais supprimer un autre ADMIN (donc jamais le dernier admin) :
  //          empêche un admin de purger les autres / de se retrouver seul maître,
  //          et bloque un compte auto-promu qui viendrait décapiter les admins.
  if (target.role === 'admin')
    return json(
      { error: 'Impossible de supprimer un compte administrateur.' },
      403,
    )

  // 3quinquies. Accès coupé AVANT toute suppression (revue du 2026-09-28).
  //   Avant, le ban n'était tenté qu'en repli, APRÈS le retrait du profil,
  //   et son échec était avalé (`.catch` inopérant : supabase-js rend
  //   `{ error }` sans lever) : un compte pouvait rester actif sans profil,
  //   invisible de la gestion, alors que la réponse affirmait « banni ».
  //   Bannir d'abord : un échec ici ne change rien, l'admin peut réessayer.
  //   Si la suppression définitive réussit ensuite, le ban part avec elle.
  const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: BAN_DURATION,
  })
  if (banErr) {
    console.error('delete-user: blocage de l’accès', banErr)
    return json(
      { error: 'Blocage de l’accès impossible. Rien n’a été supprimé, réessayez.' },
      500,
    )
  }

  // 4. Retrait de la ligne `profiles` (retire la FK profiles→auth.users qui
  //    bloquerait la suppression de l'identité ; idempotent). Le compte quitte
  //    la gestion des comptes.
  const { error: profDelErr } = await admin
    .from('profiles')
    .delete()
    .eq('id', userId)
  if (profDelErr) {
    // Détail côté serveur uniquement (B3) ; message générique au client.
    console.error('delete-user: suppression profil', profDelErr)
    // Le ban vient d'être posé (3quinquies) : le lever, sinon le compte
    // resterait bloqué tout en paraissant actif dans /comptes.
    const { error: unbanErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    })
    if (unbanErr) {
      console.error('delete-user: levée du blocage', unbanErr)
      return json(
        {
          error:
            'Suppression du profil échouée, et l’accès du compte est resté bloqué. Réessayez la suppression.',
        },
        500,
      )
    }
    return json({ error: 'Suppression du profil échouée' }, 400)
  }

  // 5. Suppression DÉFINITIVE de l'identité auth.users.
  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) {
    // Des données de l'app repjour (rapports, audit…) sont liées à ce compte et
    // empêchent la suppression dure. On ne casse rien : l'accès est déjà coupé
    // par le ban posé à l'étape 3quinquies. `profiles` est retiré → le compte
    // a bien quitté la gestion, mais son identité subsiste (bannie).
    console.error('delete-user: suppression définitive', delErr)
    return json(
      {
        deleted: userId,
        mode: 'banned',
        warning:
          'Suppression définitive impossible (des données de l’app repjour sont liées à ce compte). Accès révoqué (banni) à la place.',
      },
      200,
    )
  }

  return json({ deleted: userId, mode: 'deleted' }, 200)
}
