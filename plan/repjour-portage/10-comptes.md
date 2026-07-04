# Étape 10 — Comptes utilisateurs (optionnelle selon périmètre)

## Objectif

Porter la gestion des comptes (page admin) : création d'utilisateurs via un second client Supabase sans session, édition des profils, et changement de mot de passe via la fonction RPC existante. Gating admin strict.

## Contexte

Étape conditionnelle (dépend du périmètre D6). La création de compte utilise un **second client** `supabase-signup.ts` (`persistSession:false`, `autoRefreshToken:false`, même clé anon) pour appeler `auth.signUp()` sans écraser la session de l'admin courant. Le changement de mot de passe passe par la RPC serveur `admin_update_password` (déjà définie dans la base — consommée, jamais recréée). Attention à la **collision de `storageKey`** : les deux clients partagent la clé anon et doivent utiliser des `storageKey` distincts.

## Fichier(s) impacté(s)

- `src/lib/repjour/supabase-signup.ts` (nouveau — 2ᵉ client, `storageKey` distinct)
- `src/routes/repjour/comptes.tsx` (nouveau)
- `src/components/repjour/boards/ComptesBoard.tsx` (nouveau — CRUD comptes)
- `src/components/repjour/PasswordInput.tsx` (nouveau — champ + checklist de validation)
- `src/routes/repjour/profil.tsx`, `src/components/repjour/boards/ProfilBoard.tsx` (nouveaux — profil perso, tous rôles)
- `src/routeTree.gen.ts` (régénéré)
- Sources fork : `src/pages/{AccountsPage,ProfilePage}.tsx`, `src/lib/supabase-signup.ts`, `src/components/PasswordInput.tsx`

## Travail à réaliser

### 1. Second client Supabase

Créer `supabase-signup.ts` : `createClient` avec la même URL/clé anon, `auth: { persistSession: false, autoRefreshToken: false, storageKey: 'repjour-signup' }` (clé de storage distincte du client principal pour éviter toute collision — D11).

### 2. PasswordInput

Porter le champ mot de passe avec checklist de validation (`lib/repjour/password.ts`).

### 3. Comptes (admin)

Porter `AccountsPage` : création via `supabaseSignup.auth.signUp()` + insert `profiles`, édition profil, changement de mot de passe via `supabase.rpc('admin_update_password', ...)`. Restyler en dark. Gating admin strict.

### 4. Profil (tous rôles)

Porter `ProfilePage` : édition prénom/nom (update `profiles`) + changement de mot de passe (`supabase.auth.updateUser`). Atteinte depuis le menu utilisateur.

## Ordre d'exécution

1. `supabase-signup.ts` (storageKey distinct).
2. `PasswordInput`.
3. `ComptesBoard` + route (admin).
4. `ProfilBoard` + route (tous rôles).
5. Régénération, typecheck, tests prudents.

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `pnpm build` passe.
- Création d'un compte de test : le compte est créé sans déconnecter l'admin (deux clients, storageKey distincts, pas de collision).
- Changement de mot de passe (RPC) fonctionne et respecte la politique (12 caractères + classes).
- Un rôle non-admin n'accède pas à la page comptes.

## Contrôle /borg

Étape critique (gestion des comptes/auth + écriture via RPC). Audit post-exécution :

- Les deux clients Supabase utilisent des `storageKey` distincts ; la session admin survit à une création de compte.
- La RPC `admin_update_password` est seulement consommée (jamais redéfinie) ; le trigger anti-escalade de rôle reste intact.
- La création passe par la clé anon (aucun `service_role` exposé) et reste soumise aux RLS.
- Aucune migration, aucun DDL.
