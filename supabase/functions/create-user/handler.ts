// Gestionnaire HTTP de `create-user`, sorti de `index.ts` pour être testé sans
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

  // Client service_role : sert à valider le JWT de l'appelant, lire son rôle
  // (sans RLS) puis créer le compte. Ne persiste aucune session.
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
  // Un JSON valide n'est pas forcément un objet (`null`, `42`, `[]`, `"x"`) :
  // sans ce refus, `null.rollbackUserId` lèverait et Deno.serve rendrait un 500.
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return json({ error: 'Corps de requête invalide' }, 400)
  // Champs texte : absents (ou null) acceptés, sinon CHAÎNES seulement.
  // Sans ce refus, `(5).trim` lèverait (500 opaque).
  const champs = body as Record<string, unknown>
  for (const champ of ['email', 'password', 'displayName', 'rollbackUserId'])
    if (champs[champ] != null && typeof champs[champ] !== 'string')
      return json({ error: 'Corps de requête invalide' }, 400)

  // 3bis. ROLLBACK d'un compte ORPHELIN : le front appelle ce mode quand la
  // création `auth.users` a réussi mais que l'insertion `profiles` a échoué,
  // pour ne pas laisser un identifiant fantôme qui bloquerait tout réessai
  // (409 « email existe »). Garde-fou : on ne supprime QUE si AUCUNE ligne
  // `profiles` n'existe pour cet id → impossible de détruire un compte établi.
  if (body.rollbackUserId) {
    const uid = body.rollbackUserId
    const { data: existing, error: existingErr } = await admin
      .from('profiles')
      .select('id')
      .eq('id', uid)
      .maybeSingle()
    // supabase-js ne lève jamais : une lecture en ÉCHEC ne prouve pas
    // l'absence de profil. On ne supprime que sur une lecture RÉUSSIE et vide.
    if (existingErr) {
      // Détail côté serveur uniquement ; message générique au client.
      console.error('create-user: lecture profil (rollback)', existingErr)
      return json({ error: 'Vérification du compte échouée' }, 400)
    }
    if (existing)
      return json(
        { error: 'Ce compte possède un profil : gérez-le via la gestion des comptes.' },
        409,
      )
    // Durcissement (F6) : ne supprimer que si l'identité vient d'être créée
    // (fenêtre de quelques minutes). Sans cette borne, un rollbackUserId
    // arbitraire permettrait de supprimer n'importe quel `auth.users` orphelin
    // (ex. compte sans profil hérité), contournant les gardes de delete-user.
    const { data: target } = await admin.auth.admin.getUserById(uid)
    const createdAt = target?.user?.created_at
      ? Date.parse(target.user.created_at)
      : NaN
    const ROLLBACK_WINDOW_MS = 10 * 60 * 1000
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > ROLLBACK_WINDOW_MS)
      return json(
        { error: 'Annulation refusée : ce compte n’a pas été créé à l’instant.' },
        409,
      )
    const { error: delErr } = await admin.auth.admin.deleteUser(uid)
    if (delErr) {
      console.error('deleteUser (rollback) a échoué', delErr)
      return json({ error: 'Annulation échouée' }, 400)
    }
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
    // Détail côté serveur uniquement (Mineur-1) ; message générique au client.
    if (createErr && !already) console.error('createUser a échoué', createErr)
    return json(
      {
        error: already
          ? 'Un compte existe déjà avec cet email'
          : 'Création du compte échouée',
      },
      already ? 409 : 400,
    )
  }

  return json({ userId: created.user.id, email, displayName }, 200)
}
