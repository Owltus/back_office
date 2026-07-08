# Étape 5 — Validation globale

## Objectif

Valider l'ensemble du chantier (types, build) et le parcours fonctionnel complet : commenter → clôturer → imprimer → réouvrir.

## Contexte

Dernière étape, critique au sens « validation de fin de chantier ». Rappel : la persistance ne fonctionne réellement qu'une fois `supabase/rapro_sheets.sql` **exécuté par l'utilisateur** dans Supabase.

## Fichier(s) impacté(s)

- Aucun nouveau — vérification transverse des fichiers des étapes 1 à 4.

## Travail à réaliser

### 1. Validation automatique

- `npx tsc --noEmit` (aucune erreur de type).
- `pnpm build` (build vert ; vérifier qu'un chunk `rapro` reste raisonnable et que `jspdf` est bien en chunk séparé chargé à la demande).

### 2. Test manuel (par l'utilisateur, après exécution du SQL)

1. Ouvrir `/rapro` sur un jour avec occupation PDJ, en rôle super/admin.
2. Saisir un commentaire → cliquer ailleurs (blur) → recharger / naviguer : le commentaire est persisté.
3. **Clôturer** : grille + commentaire figés, bouton devient **Réouvrir**, bouton **Imprimer** apparaît.
4. **Imprimer** : la fenêtre d'impression du navigateur s'ouvre avec le PDF (date, compteurs, anomalies par étage, commentaire).
5. **Réouvrir** (à tout moment) : tout redevient éditable.
6. En rôle `utilisateur` : lecture seule, aucun bouton d'action.

## Critère de validation

- `npx tsc --noEmit` et `pnpm build` verts.
- Le cycle clôture → impression → réouverture fonctionne sans erreur.
- Aucune régression sur le suivi ménage existant (cases chambre, boutons d'étage, cards, navigation) hors état clôturé.
- Aucune écriture directe sur une table Supabase partagée n'a été introduite ; toute persistance passe par `rapro_sheets` / `rapro_rooms` (RLS super/admin).

## Contrôle /borg

Étape critique (validation globale). Auditer :

- Build et types verts ; aucun import cassé (alias `#/` + extension explicite partout) ; `jspdf` uniquement en `import()` dynamique.
- Le verrou de clôture est cohérent UI ↔ RLS : quand `isValidated`, la grille et le commentaire sont bien non éditables côté UI, et la RLS `rapro_sheets`/`rapro_rooms` reste l'autorité (un `utilisateur` ne peut rien écrire).
- La réouverture est bien permise à tout moment pour super/admin (pas de verrou temporel résiduel côté client ni RLS).
- `id` d'iframe PDF distinct (`rapro-print-frame`) ; pas de collision avec la caisse.
