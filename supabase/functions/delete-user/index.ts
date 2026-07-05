// Edge Function `delete-user` — révocation d'un compte par un ADMIN depuis le
// front (/comptes). Pendant de `create-user`.
//
// POURQUOI une Edge Function
//   « Supprimer » un compte doit empêcher la reconnexion. Retirer la seule ligne
//   `profiles` (ce que faisait le front) ne touche PAS `auth.users` : la personne
//   garde son identifiant + mot de passe et peut toujours se connecter. Agir sur
//   `auth.users` exige l'API Admin d'Auth, donc la clé SERVICE_ROLE — SECRÈTE,
//   jamais côté navigateur → elle reste ici, côté serveur.
//
// CHOIX : RÉVOCATION RÉVERSIBLE (ban), pas suppression dure
//   Le backend Supabase est PARTAGÉ avec l'app repjour en prod. Un `deleteUser`
//   effacerait l'identité pour de bon et pourrait casser des données liées de
//   l'autre app (clés étrangères vers auth.users). On BANNIT donc l'utilisateur
//   (durée ~100 ans) : la connexion devient impossible partout, sans rien
//   détruire, et c'est réversible (`ban_duration: 'none'` lève le ban).
//
// PÉRIMÈTRE : cette fonction ne fait QUE le ban (seule action exigeant le
//   service_role). Le retrait de la ligne `profiles` reste CÔTÉ FRONT, sous la
//   session de l'admin (chemin RLS habituel), pour ne pas introduire d'écriture
//   service_role sur cette table partagée. Comptes/identités étant communs aux
//   deux apps, le ban révoque l'accès PARTOUT (comportement voulu).
//
// SÉCURITÉ (défense en profondeur) — identique à create-user
//   1. verify_jwt (passerelle) : requête sans JWT valide rejetée en amont.
//   2. Contrôle applicatif : le rôle de l'APPELANT est lu dans `profiles` via
//      service_role ; SEUL un `admin` peut poursuivre (403 sinon).
//   3. Garde anti-auto-exclusion : un admin ne peut pas révoquer son propre compte.

import { createClient } from 'jsr:@supabase/supabase-js@2'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey)
    return json({ error: 'Configuration serveur manquante' }, 500)

  // Client service_role : valide le JWT de l'appelant, lit son rôle (sans RLS)
  // puis révoque le compte cible. Ne persiste aucune session.
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

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
  const userId = (body.userId ?? '').trim()
  if (!userId) return json({ error: 'Identifiant du compte requis' }, 400)

  // 3bis. Garde anti-auto-exclusion : jamais son propre compte.
  if (userId === caller.id)
    return json({ error: 'Vous ne pouvez pas supprimer votre propre compte' }, 400)

  // 3ter. Le compte cible DOIT avoir un profil (compte réellement géré). Empêche
  //       de bannir un userId sans profil (identité orpheline / inexistante dans
  //       la gestion des comptes). NB : `profiles` étant partagé, cette garde ne
  //       distingue pas les deux apps — elle écarte seulement les uid sans profil.
  const { data: target, error: targetErr } = await admin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()
  if (targetErr)
    return json({ error: targetErr.message || 'Vérification du compte échouée' }, 400)
  if (!target)
    return json({ error: 'Compte introuvable dans la gestion des comptes' }, 404)

  // 4. Révocation de l'accès : ban de l'identité (connexion impossible). Le
  //    retrait de la ligne `profiles` est fait ENSUITE côté front (chemin RLS) ;
  //    si ce retrait échoue, l'accès est déjà coupé et un réessai est sans risque
  //    (le ban est idempotent).
  const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: BAN_DURATION,
  })
  if (banErr)
    return json({ error: banErr.message || 'Révocation de l’accès échouée' }, 400)

  return json({ revoked: userId }, 200)
})
