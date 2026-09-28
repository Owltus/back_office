# Étape 3 — Matrice des droits testée en base, PUIS application

## Objectif

Prouver la matrice de `00-INDEX.md` **avant** de jouer le SQL en production,
puis le jouer et re-prouver.

## Fichier(s) impacté(s)

- `supabase/verif_classeur_acces.sql` (nouveau, lecture seule / transactions
  annulées)

## Travail à réaliser

### 1. Répétition générale (rien ne reste)

Un bloc `do $$ … raise exception 'RESULTAT …' $$` (technique déjà utilisée
pour l'historique des versions : l'exception annule TOUT, le résumé sort dans
le message) qui :

1. applique le SQL des étapes 1-2 dans la transaction ;
2. crée des profils de test fictifs **dans la transaction** (ou réutilise des
   comptes existants en leur posant des droits de page le temps du test) ;
3. pour chaque profil (`set_config('request.jwt.claims', …)`, rôle
   `authenticated`) et chaque cas, compte ce qui est visible / modifiable.

Cas à couvrir (chacun = une ligne de résultat attendu) :

| Profil | Classeur | Attendu |
|---|---|---|
| sans droit de page | lecture pour tous | ne voit rien (0 ligne partout, stockage compris) |
| page lecture | lecture pour tous | voit, ne modifie pas |
| page lecture | exception ecriture | voit, ne modifie pas (plafond) |
| page lecture | aucun pour tous | ne voit rien |
| page ecriture | lecture pour tous | voit, ne modifie pas |
| page ecriture | exception ecriture | modifie |
| page ecriture | créateur | modifie |
| page ecriture | créateur + exception « aucun » | ne voit rien (retrait au créateur) |
| page ecriture | aucun pour tous + exception lecture | voit |
| page ecriture | tente `acces_tous`, `deleted_at`, `sort_order`, `classeur_acces` | 42501 |
| page ecriture | crée un classeur « Privé » | forcé à lecture pour tous |
| page gestion | tout classeur | tout, y compris accès |
| admin | tout classeur | tout |

Et pour chaque « ne voit rien » : 0 ligne dans chapitres, 4 familles
d'éléments, médiathèque, points de restauration, versions, `storage.objects`.

### 2. Application

Si et seulement si la répétition est verte :

```bash
supabase db query --linked -f supabase/classeur_acces_2026-09-28.sql
supabase db query --linked -f supabase/verif_classeur_acces.sql
supabase db query --linked -f supabase/verif_advisor.sql
```

## Critère de validation

- Répétition : toutes les lignes attendues, base inchangée après
  (comptage avant / après).
- Après application : même matrice verte, `verif_advisor.sql` vert, les 3
  classeurs en `acces_tous = 'lecture'`.

## Contrôle /borg

- Oracle = codes et comptages exacts, jamais « ça a l'air de marcher ».
- Chaque refus attendu vérifié par son code (`42501`) ou par 0 ligne.
- Base remise à l'identique après la répétition (preuve par comptage).
