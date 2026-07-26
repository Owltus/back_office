# Plan — Remédiation sécurité (audit du 2026-07-27)

## Contexte

Un audit statique en point de vue attaquant a été mené le 2026-07-27 (rapport
`doc/rapport securité/audit-2026-07-27.md`). Verdict rassurant sur les fondamentaux :
aucune table sans RLS (pas d'exposition anonyme), aucun secret dans le bundle, Edge
Functions et RPC correctement gardées, aucun XSS stocké exploitable. Le risque réel
se concentre sur **le compte connecté à bas privilège** (qui parle directement à
PostgREST avec la clé anon publique, hors de l'UI) et sur des **objets de sécurité
non versionnés** : le dépôt encode l'intention, pas l'état réel de la base.

Ce plan corrige chaque point du rapport, groupé en livrables testables. Deux
contraintes structurent tout : (1) le SQL est **exécuté par l'utilisateur** dans
Supabase → SQL Editor — l'assistant produit les scripts, ne joue rien contre la
prod ; (2) plusieurs failles ne sont **vérifiables que dans la base live** (leur
gravité réelle dépend de l'état prod, que l'audit statique n'a pas inspecté), d'où
l'Étape 1 en prérequis strict.

## Angles à clarifier

- **CHEVAUCHEMENT MAJEUR avec `plan/securite-pentest-externe/` (2026-07-20), non
  exécuté — À TRANCHER.** L'essentiel de ce plan recoupe le précédent : fermeture des
  lectures par page (là-bas Étape 4, ici Étape 2), CHECK format email (là-bas Étape 2,
  ici Étape 4), CSP/OCR + CORS (là-bas Étapes 3/6, ici Étapes 6/7), diagnostic
  `pg_policies` + vérif C1/G1-G2 (là-bas Étape 1, ici Étape 1). L'audit du 27/07
  **prouve surtout que le plan du 20/07 n'a pas été appliqué** (lectures toujours
  ouvertes, CHECK toujours commenté, service_role toujours dans `.env`). Décision : ce
  plan-ci se veut le **consolidé qui supersède** le précédent (il est plus frais et
  ajoute H2/M3/B5/versionnement). **Alternative** : reprendre `securite-pentest-externe/`
  tel quel et n'ajouter que les 4 nouveautés. À toi de choisir — il ne faut pas faire
  tourner deux plans en parallèle.
- **Vérifier AVANT de corriger (C1, H1, M2).** L'Étape 1 peut révéler qu'il n'y a
  rien à corriger (garde `admin_update_password` intacte, lectures déjà fermées, anti-
  escalade `profiles` en place au dump du 20/07). Le plan **gate** sur ce diagnostic :
  on ne réécrit pas une fonction ni ne `drop policy` sur un nom deviné. C'est le mode
  d'échec n°1 d'un durcissement (déjà signalé par le plan du 20/07).
- **Rotation de la `service_role` = geste opérationnel sensible (Étape 5).** La faire
  tourner **casse** tout consommateur tant qu'il n'est pas mis à jour (secrets des Edge
  Functions, outillage local). Fenêtre coordonnée nécessaire. Mais la clé est désormais
  en clair sur le poste et citée dans le rapport d'audit → rotation **fortement
  conseillée** quoi qu'il arrive.
- **Versionnement : rapatrier maintenant, migrations plus tard.** L'Étape 3 rapatrie
  dans `supabase/` les seuls objets **critiques** hors dépôt (`profiles`,
  `get_user_role`, `admin_update_password`). L'adoption complète de
  `supabase/migrations/` est un chantier distinct, hors périmètre ici.
- **Réflexion socratique (tenue en interne, faute de `/rodin` garanti disponible) :**
  le vrai risque de ce chantier n'est pas technique mais organisationnel — refaire un
  3e plan sécurité qui, lui non plus, ne serait pas exécuté. Le livrable qui compte
  n'est pas le SQL (déjà écrit à 80 %) mais **l'exécution effective + un re-test daté**
  (Étape 8). Le plan est donc volontairement court et orienté exécution.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-diagnostic-base.md](./1-diagnostic-base.md) | Diagnostic RLS/fonctions en base (lecture seule) + verdicts C1/H1/G1-G2 | — | P0 | 1h | `etat-policies-prod.md` rafraîchi ; on sait quoi corriger vraiment | ⚠ |
| 2 | [2-lectures-par-page.md](./2-lectures-par-page.md) | Fermeture des SELECT par page (H1) + `facturation_ref_imputations` (H2) | 1 | P0 | 2h | Un compte sans permission page lit 0 ligne des tables de cette page | ⚠ |
| 3 | [3-objets-critiques-versionnement.md](./3-objets-critiques-versionnement.md) | Vérif/réécriture `admin_update_password` (C1), anti-escalade `profiles` (G1/G2, M2) + rapatriement | 1 | P0 | 2h30 | Objets critiques confirmés gardés ET versionnés dans `supabase/` | ⚠ |
| 4 | [4-contrainte-format-email.md](./4-contrainte-format-email.md) | Contrainte de format `email_recipients` (M4) | 1 | P1 | 30min | Une adresse ne peut plus détourner le `mailto:` | ⚠ |
| 5 | [5-secret-service-role.md](./5-secret-service-role.md) | `service_role` hors du `.env` Vite + commentaire + rotation (M3) | — | P1 | 1h | Clé hors du fichier chargé par Vite, commentaire corrigé, clé tournée | |
| 6 | [6-durcissement-edge-functions.md](./6-durcissement-edge-functions.md) | delete-user ≥1 admin (B1), send-report plafonds (B2), CORS allowlist (B4) | — | P2 | 2h | Un admin ne peut plus supprimer le dernier admin ; CORS restreint | |
| 7 | [7-durcissement-client-config.md](./7-durcissement-client-config.md) | CSP hash (B3), iframe sandbox (B7), Poster clamp (B6), easter_eggs → is_admin (B5) | — | P2 | 2h | `unsafe-inline` retiré, hardening client appliqué | |
| 8 | [8-validation-globale.md](./8-validation-globale.md) | Re-test complet sur compte jetable + clôture point par point | 1-7 | P0 | 1h30 | `retest-2026-07-XX.md` : chaque finding clos ou accepté | ⚠ |

## Ordre d'exécution

- **Étape 1 d'abord, seule.** Lecture pure, ne change rien, mais 2/3/4 en dépendent.
  Écrire un `drop policy` sur un nom deviné = croire avoir durci une table qui reste
  ouverte.
- **Sprint DB (séquentiel, SQL exécuté par l'utilisateur)** : 1 → 2 → 3 → 4. Chaque
  script est idempotent et sauvegarde l'état avant remplacement.
- **Sprint front/ops (parallélisable avec le DB)** : 5, 6, 7. L'Étape 5 (rotation)
  se coordonne avec l'Étape 6 (les Edge Functions consomment la `service_role`). Les
  Étapes 6/7 se terminent par un déploiement (Edge Functions + `git push` front).
- **Étape 8 en dernier**, tout déployé. Matrice de re-test sur un **compte jetable**,
  jamais sur des données de prod.

## Architecture cible

```
supabase/
├── page_permissions_rls_lectures.sql   ← +bloc facturation_ref_imputations   [modifié]
├── facturation_ref_imputations.sql     ← SELECT par page (fin du using(true)) [modifié]
├── profiles.sql                        ← table + policies + trigger anti-escalade [nouveau]
├── security_core.sql                   ← get_user_role + admin_update_password  [nouveau]
├── easter_eggs.sql                     ← écritures via is_admin()               [modifié]
├── email_recipients_email_format.sql   ← le CHECK, extrait pour exécution seule [nouveau]
└── functions/
    ├── _shared/cors.ts                 ← origine allowlistée                    [nouveau]
    ├── delete-user/index.ts            ← refuse de supprimer un admin / le dernier [modifié]
    ├── send-report/index.ts            ← plafonds taille + validation pdfName    [modifié]
    └── create-user/index.ts            ← consomme _shared/cors                   [modifié]

src/
├── components/artefact/ArtefactBoard.tsx  ← iframe sandbox                       [modifié]
└── components/affiche/Poster.tsx          ← clamp fontSizeIcon                   [modifié]

vercel.json                             ← CSP : hash du script de thème          [modifié]
.env (non commité)                      ← service_role déplacée + commentaire     [modifié]
doc/rapport securité/
├── etat-policies-prod.md               ← dump pg_policies rafraîchi              [modifié]
└── retest-2026-07-XX.md                ← clôture finding par finding             [nouveau]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB / Supabase (exécuté par l'utilisateur) | `page_permissions_rls_lectures.sql`, `facturation_ref_imputations.sql`, `easter_eggs.sql` | `profiles.sql`, `security_core.sql`, `email_recipients_email_format.sql` |
| Edge Functions (déployées par l'utilisateur) | `delete-user/index.ts`, `send-report/index.ts`, `create-user/index.ts` | `functions/_shared/cors.ts` |
| Client / config | `components/artefact/ArtefactBoard.tsx`, `components/affiche/Poster.tsx`, `vercel.json`, `.env` | — |
| Documentation | `doc/rapport securité/etat-policies-prod.md`, `CLAUDE.md` (faits DB) | `doc/rapport securité/retest-2026-07-XX.md` |
| **Total** | **~11 modifiés** | **~5 nouveaux** |
