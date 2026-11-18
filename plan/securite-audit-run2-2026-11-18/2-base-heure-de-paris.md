# Étape 2 — Fenêtres d'écriture à la date de Paris (hors caisse)

## Objectif

Les policies comparent `current_date`, qui suit le fuseau de la base (UTC). L'écran, lui, calcule la date de Paris. Pendant une à deux heures après minuit à Paris, la base laisse donc écrire un jour de plus. On aligne la base sur l'écran.

## Fichier(s) impacté(s)

- `supabase/migrations/20261118150000_fenetres_date_paris.sql` (nouveau)
- `supabase/tests/00_socle.test.sql` (si une nouvelle aide `private` est créée)

## Travail à réaliser

### 1. Aide de date

Réutiliser `private.planning_aujourdhui()` (planning_schema:79), ou créer `private.aujourdhui_paris()` sur le même modèle et l'ajouter à la liste de `00_socle`. L'appeler sous la forme `(select private.aujourdhui_paris())` dans les policies.

### 2. Policies recréées sous le même nom

Tables concernées (lignes de la baseline) :

- `rapro_rooms` : 5497, 5505, 5509 ;
- `rapro_sheets` : 5516, 5524, 5528 ;
- `literie_sheets` : 5363, 5367 ;
- `baby_cot_assignments` : 5000, 5008, 5012 ;
- `parking_reservations` : 5385, 5393, 5397 ;
- `pdj_breakfasts` : 5427, 5451, 5455 ;
- `pdj_externals` : 5439, 5443 ;
- `pdj_addon_production` : 5419, 5423.

Triggers à recréer : `baby_cot_assignments_no_past_rewrite` (regles_ecriture:102) et `parking_no_past_rewrite` (baseline:2229).

**Exclus par décision utilisateur :** `caisse_sheets` (5074, 5078) et `caisse_cautions` (5050, 5058).

## Ordre d'exécution

1. Relever le texte exact de chaque policy dans le catalogue local (`pg_policies`), pour ne changer que l'expression de date.
2. Écrire la migration : drop et create sous le même nom, ce que le détecteur de livraison ne compte pas comme un retrait.
3. `migration up --local`, puis `pnpm test:db` (la matrice 01 attrape une faute de frappe).

## Critère de validation

- Toutes les policies gardent leur nom, leurs rôles et leur commande. Seule la date change (diff du catalogue avant et après).
- Les tests 01, 03 et 91 sont verts.

## Contrôle /borg

- Aucune policy de la caisse ni des cautions n'a changé.
- Aucune fenêtre ne s'élargit. Elles ne font que se resserrer pendant la nuit.
