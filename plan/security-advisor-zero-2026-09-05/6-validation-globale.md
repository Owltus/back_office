# Étape 6 — Validation globale

## Objectif

Prouver que le Security Advisor est vide côté SQL, que les droits n'ont
pas bougé d'un iota pour chaque rôle, que l'application fonctionne sur
toutes les pages, et clore par commit et mémoire.

## Travail à réaliser

### 1. Contrôles automatiques

```bash
npx tsc --noEmit && npx vitest run && pnpm build
supabase db query --linked -f supabase/verif_advisor.sql
supabase db query --linked -f supabase/verif_complet.sql
supabase db query --linked -f supabase/verif_perf.sql
supabase db query --linked -f supabase/verif_securite_2026-08-05.sql
```

### 2. Preuves par rôle (transactions annulées)

Pour un compte `lecture`, un compte `ecriture`, un compte `gestion` et
l'admin : lecture d'une table par page (lignes visibles ou 0), écriture
dans et hors fenêtre, appel des RPC relais (accepté/refusé), tentative
d'auto-attribution de droit (`insert user_page_permissions` → refus),
tentative d'auto-promotion (`update profiles set role='admin'` → refus).
Résultats identiques à la matrice du 2026-09-05.

### 3. Parcours navigateur

/repjour (bande, ignorer un rappel d'envoi), /parking (créer et supprimer
une réservation de test), /pdj (cocher, décocher), /rapro (occupation et
contrôle OCF), /caisse, /facturation (imputer puis oublier un document de
test), /comptes (changer un droit puis le remettre), /literie.

### 4. Security Advisor

Rafraîchir dans le dashboard : 0 ligne de type SQL. Faire une capture pour
le message de fin.

### 5. Clôture

Commit par étape déjà fait ; commit final CLAUDE.md ; mémoire projet ;
push sur demande de l'utilisateur.

## Critère de validation

- Tous les contrôles OK, Advisor vide (hors réglage Pro), parcours sans
  erreur console, preuves par rôle identiques à avant.

## Contrôle qualité (revue)

Étape critique (validation finale). `/borg` n'étant pas installé, revue
manuelle : (1) aucun objet de test résiduel (`select … where client like
'%test%'`, hash de document de test) ; (2) `git status` propre ; (3) aucun
fichier SQL joué qui ne soit commité.
