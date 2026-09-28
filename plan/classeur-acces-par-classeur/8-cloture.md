# Étape 8 — Clôture : contrôle par profils, documentation

## Objectif

Valider le chantier de bout en bout avec de vrais profils, documenter.

## Fichier(s) impacté(s)

- `CLAUDE.md` (section Classeur : « Droits PAR CLASSEUR » réécrite)
- `plan/classeur-acces-par-classeur/00-INDEX.md` (état des étapes)
- `supabase/verif_advisor.sql`, `supabase/verif_complet.sql`

## Travail à réaliser

1. **Contrôle navigateur avec un compte de test** (à créer par l'utilisateur
   via `/comptes`, supprimé ensuite et vérifié absent) : page en lecture puis
   en écriture ; classeur privé invisible (liste, lien direct, image par URL
   de l'API) ; exception « aucun » ; plafond page lecture.
2. **Poste partagé** : lire un classeur réservé avec l'admin, se déconnecter,
   se connecter avec le compte de test → rien du classeur ne s'affiche.
3. `verif_advisor.sql`, `verif_complet.sql`, `verif_classeur_acces.sql` verts.
4. `pnpm build`, `npx tsc --noEmit`, `pnpm lint`, suite vitest complète.
5. CLAUDE.md : la règle du niveau effectif, le tableau « ce que l'écriture ne
   permet pas », le trou du cache refermé, la restauration bloquée en
   interface seulement.

## Critère de validation

- Les trois contrôles SQL verts, suite de tests verte, build OK.
- Compte de test supprimé, vérifié absent (`profiles`,
  `user_page_permissions`, `classeur_acces`).

## Contrôle /borg

- Revue adverse de la RLS : un compte `lecture` tente chaque écriture par
  l'API (clé publique, jamais `service_role`) → refus.
- Lecture d'un instantané (`classeur_merge_history.snapshot`) et d'une
  version d'un classeur interdit → 0 ligne.
