// Edge Function `create-user` — création d'un compte par un ADMIN depuis le
// front (/comptes), SANS réactiver l'inscription publique Supabase
// (« Allow new users to sign up » reste OFF sur le projet partagé).
//
// POURQUOI une Edge Function
//   Créer un utilisateur avec mot de passe quand l'inscription publique est
//   désactivée exige l'API Admin d'Auth (auth.admin.createUser), qui requiert la
//   clé SERVICE_ROLE. Cette clé est SECRÈTE et ne doit JAMAIS vivre côté
//   navigateur → elle reste ici, côté serveur (injectée par Supabase dans
//   l'environnement de la fonction, jamais committée).
//
// SÉCURITÉ (défense en profondeur)
//   1. verify_jwt (passerelle) : toute requête sans JWT valide du projet est
//      rejetée avant même d'exécuter la fonction.
//   2. Contrôle applicatif : on lit le rôle de l'APPELANT dans `profiles` via la
//      clé service_role ; SEUL un `admin` peut poursuivre. Un super_utilisateur,
//      un utilisateur ou un anonyme est refusé (403). Impossible à contourner
//      depuis le navigateur : la décision est prise côté serveur.
//   3. La fonction ne crée QUE l'identifiant `auth.users` (email confirmé).
//      L'insertion de la ligne `profiles` (avec le rôle choisi) reste côté front,
//      sous la session de l'admin, afin de conserver INTACT le chemin RLS +
//      trigger anti-escalade de rôle déjà en place.
//
// Empreinte sur le backend partagé : identique au flux signUp actuel (seule
// `auth.users` est touchée par la création). Aucune écriture sur les tables
// « repjour ».

import { createClient } from 'jsr:@supabase/supabase-js@2'

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

// Miroir serveur de src/lib/repjour/password.ts (mêmes 5 critères).
function isPasswordValid(pw: string): boolean {
  return (
    pw.length >= 12 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[^a-zA-Z0-9]/.test(pw)
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey)
    return json({ error: 'Configuration serveur manquante' }, 500)

  // Client service_role : sert à valider le JWT de l'appelant, lire son rôle
  // (sans RLS) puis créer le compte. Ne persiste aucune session.
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
  let body: {
    email?: string
    password?: string
    displayName?: string
    rollbackUserId?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corps de requête invalide' }, 400)
  }

  // 3bis. ROLLBACK d'un compte ORPHELIN : le front appelle ce mode quand la
  // création `auth.users` a réussi mais que l'insertion `profiles` a échoué,
  // pour ne pas laisser un identifiant fantôme qui bloquerait tout réessai
  // (409 « email existe »). Garde-fou : on ne supprime QUE si AUCUNE ligne
  // `profiles` n'existe pour cet id → impossible de détruire un compte établi.
  if (body.rollbackUserId) {
    const uid = body.rollbackUserId
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('id', uid)
      .maybeSingle()
    if (existing)
      return json(
        { error: 'Ce compte possède un profil : gérez-le via la gestion des comptes.' },
        409,
      )
    const { error: delErr } = await admin.auth.admin.deleteUser(uid)
    if (delErr) return json({ error: delErr.message || 'Annulation échouée' }, 400)
    return json({ rolledBack: uid }, 200)
  }

  // 4. Validation des entrées de création.
  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  const displayName = (body.displayName ?? '').trim() || email.split('@')[0]

  if (!email || !password)
    return json({ error: 'Email et mot de passe requis' }, 400)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json({ error: 'Email invalide' }, 400)
  if (!isPasswordValid(password))
    return json({ error: 'Le mot de passe ne respecte pas les critères' }, 400)

  // 5. Création du compte (email confirmé : aucun mail de vérification requis).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })
  if (createErr || !created.user) {
    const already =
      createErr?.code === 'email_exists' ||
      (createErr?.message ?? '').toLowerCase().includes('already')
    return json(
      {
        error: already
          ? 'Un compte existe déjà avec cet email'
          : createErr?.message || 'Création du compte échouée',
      },
      already ? 409 : 400,
    )
  }

  return json({ userId: created.user.id, email, displayName }, 200)
})
