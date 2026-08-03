# Étape 7 — Nettoyage de la dette (ancien modèle par rôle)

## Objectif

Réduire à un seul modèle de garde. Retirer le rôle legacy `super_utilisateur`,
supprimer le risque de régression RLS du fichier `affiche_templates.sql`, et
trancher le sort de `/gestion` budgétaire (aujourd'hui hors modèle par page).

## Contexte

Coexistent aujourd'hui : le modèle par page (`PageGuard` / `can()`) sur les 8
pages navbar, et l'ancien modèle par rôle (`ProtectedRoute` / `role === 'admin'`)
sur `/gestion`, `/comptes`, `/profil`, `/easter-eggs`. Par ailleurs :

- `UserRole` garde `super_utilisateur` (`types.ts:1`, `roles.ts`), traité comme
  `utilisateur` via `gradeOf` — non attribuable, source de confusion.
- `supabase/affiche_templates.sql` (l.64-79) contient encore des policies
  d'écriture legacy `get_user_role() in ('super_utilisateur','admin')` : si ce
  fichier est ré-exécuté après `page_permissions_rls.sql`, il **réintroduit**
  l'ancien modèle (déjà vu sur les lectures lors du pentest).

## Fichier(s) impacté(s)

- `src/lib/repjour/types.ts` (modifié — retrait `super_utilisateur` de `UserRole`)
- `src/lib/repjour/roles.ts` (modifié — `ROLE_HOME`, `ROLE_LABELS`)
- `src/lib/permissions/levels.ts` (modifié — `gradeOf` simplifié)
- `src/routes/gestion.tsx` (modifié — `PageGuard page="repjour" min="gestion"`)
- `src/components/repjour/boards/GestionBoard.tsx` (modifié — `can('repjour','gestion')`)
- `supabase/affiche_templates.sql` (modifié — retrait des policies legacy)
- `supabase/page_permissions_rls_repjour.sql` (modifié — `budget` bornée par `repjour:gestion`)

## Travail à réaliser

### 1. Pré-requis SÛR — vérifier la prod

Avant tout retrait de `super_utilisateur`, l'**utilisateur** exécute :

```sql
select id, email, role from public.profiles where role = 'super_utilisateur';
```

- Si des comptes le portent → d'abord les basculer (`set_user_grade` vers
  `utilisateur` ou `admin`) puis continuer.
- Si 0 ligne → retrait du type sans risque.

### 2. Retrait `super_utilisateur` (code)

- `types.ts` : `UserRole = 'utilisateur' | 'admin'`.
- `roles.ts` : retirer les entrées correspondantes (`ROLE_HOME`, `ROLE_LABELS`).
- `levels.ts` `gradeOf` : `role === 'admin' ? 'admin' : 'utilisateur'` (déjà le
  comportement ; simplifier le commentaire, plus de 3e cas).
- Ajuster les `allowedRoles={['utilisateur','super_utilisateur','admin']}` restants
  (`gestion.tsx`, `profil.tsx`) → sans `super_utilisateur`.

### 3. `affiche_templates.sql` — retrait des policies legacy

Supprimer du fichier les `create policy … using (get_user_role() in
('super_utilisateur','admin'))` (l.64-79) et laisser les policies par page
(`page_permissions_rls.sql`) faire foi. Ajouter en tête un commentaire :
« Écritures gouvernées par page_permissions_rls.sql — ne pas réintroduire de
policy par rôle ici. » L'utilisateur exécute le `drop policy if exists …`
correspondant en prod.

### 4. `/gestion` budgétaire — rattachement à `repjour:gestion` (tranché)

Décision utilisateur : **option (b)**. Le budget est de la donnée repjour ; on
rattache `/gestion` à `repjour:gestion` (pas de 9e `PageKey`).

- `GestionBoard.tsx` : remplacer `readOnly = grade !== 'admin'` par
  `readOnly = !can('repjour', 'gestion')`.
- `src/routes/gestion.tsx` : remplacer `ProtectedRoute` par `PageGuard
  page="repjour" min="gestion"` (première utilisation d'un `min` supérieur à
  `lecture` — vérifier que `PageGuard` redirige/affiche `NoAccessNotice`
  correctement dans ce cas ; ajuster si besoin car aujourd'hui aucune route ne
  passe `min`).
- RLS : la table `budget` est aujourd'hui bornée par `get_user_role() = 'admin'`
  (`page_permissions_rls_repjour.sql`). La migrer vers
  `page_level_rank(get_page_level('repjour')) = 3` (gestion). SQL exécuté par
  l'utilisateur. Comme l'admin a `gestion` partout, aucun admin ne perd l'accès.

`/comptes`, `/easter-eggs`, `/profil` : **laissés tels quels** (admin / self-service,
hors registre par page — légitime).

## Ordre d'exécution

1. Vérif prod `super_utilisateur` (utilisateur).
2. Retrait du rôle (code) une fois la prod saine.
3. Nettoyage `affiche_templates.sql` (code + exécution SQL utilisateur).
4. Décision `/gestion` (a/b) puis application.

## Contrôle /borg

Étape critique (touche RLS + type de rôle global). Auditer :
- Aucun `super_utilisateur` résiduel en base ni en code après coup.
- `affiche_templates` n'a plus qu'un seul jeu de policies (par page), pas de
  doublon permissif.
- Le budget reste inaccessible en écriture à un non-admin (RLS + UI) après
  migration éventuelle vers `repjour:gestion`.
