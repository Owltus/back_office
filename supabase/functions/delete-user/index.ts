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
// CHOIX : SUPPRESSION DÉFINITIVE (deleteUser), avec repli sur ban si impossible
//   L'admin veut que le compte disparaisse de `auth.users` (Authentication →
//   Users). On supprime donc l'identité pour de bon. Le backend étant PARTAGÉ
//   avec l'app repjour, la suppression dure peut être bloquée par des données
//   liées (clés étrangères vers auth.users : rapports, audit…). Dans ce cas on
//   ne casse RIEN : on REPLIE sur un ban (~100 ans, réversible) pour au moins
//   couper l'accès, et on le signale à l'appelant.
//
// ORDRE : on retire d'abord la ligne `profiles` (service_role) — sinon la FK
//   `profiles → auth.users` bloquerait la suppression de l'identité — PUIS on
//   supprime `auth.users`. Comptes/identités étant communs aux deux apps, la
//   suppression vaut PARTOUT.
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
  //       de supprimer un userId sans profil (identité orpheline / inexistante
  //       dans la gestion des comptes). NB : `profiles` étant partagé, cette garde
  //       ne distingue pas les deux apps — elle écarte seulement les uid sans profil.
  const { data: target, error: targetErr } = await admin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()
  if (targetErr)
    return json({ error: targetErr.message || 'Vérification du compte échouée' }, 400)
  if (!target)
    return json({ error: 'Compte introuvable dans la gestion des comptes' }, 404)

  // 4. Retrait de la ligne `profiles` (retire la FK profiles→auth.users qui
  //    bloquerait la suppression de l'identité ; idempotent). Le compte quitte
  //    la gestion des comptes.
  const { error: profDelErr } = await admin
    .from('profiles')
    .delete()
    .eq('id', userId)
  if (profDelErr)
    return json({ error: profDelErr.message || 'Suppression du profil échouée' }, 400)

  // 5. Suppression DÉFINITIVE de l'identité auth.users.
  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) {
    // Des données de l'app repjour (rapports, audit…) sont liées à ce compte et
    // empêchent la suppression dure. On ne casse rien : on coupe l'accès par un
    // ban (réversible) et on le signale. `profiles` est déjà retiré → le compte
    // a bien quitté la gestion, mais son identité subsiste (bannie).
    await admin.auth.admin
      .updateUserById(userId, { ban_duration: BAN_DURATION })
      .catch(() => {})
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
})
