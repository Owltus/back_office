# Étape 1 — Relevé de référence, une fois le préchauffage actif

## Objectif

Établir des chiffres d'avant qui veulent dire quelque chose. Aujourd'hui, deux
chargements consécutifs de la même page donnent 2 400 ms puis 8 018 ms : aucune
amélioration n'est démontrable sur un tel bruit.

## Contexte

Le préchauffage (commit `1f64e2c`) est **écrit et poussé, mais pas déployé**.
Sonde du 2026-09-23 : 1,398 s puis 0,874 s après 150 s d'inactivité — si le
Worker tournait, il aurait pingé entre-temps et on serait resté sous 0,4 s.

Pourquoi ça domine tout le reste (mesure du 2026-09-23, même requête triviale) :

| inactivité | 1re requête |
|---|---|
| continu (chaud) | 0,17 s |
| 30 s | 0,34 s |
| 60 s | 0,59 s |
| 2 min | 0,62 s |
| 5 min | 0,76 s |
| pause longue | **1,37 s** |

La pénalité apparaît dès **trente secondes**. Un utilisateur qui ouvre l'app le
matin la paie sur chaque page. Tant qu'elle est là, elle masque complètement le
gain d'un aller-retour économisé.

⚠ **Cette étape dépend d'une action utilisateur**, pas d'une ligne de code.

## Fichier(s) impacté(s)

- `plan/rpc-analytiques-2026-09-23/releve-avant.md` (nouveau)
- Aucun fichier de code.

## Travail à réaliser

### 1. Déploiement du Worker (utilisateur)

```
1. Dashboard Cloudflare → variable SUPABASE_PUBLISHABLE_KEY = sb_publishable_...
2. cd cloudflare && npx wrangler@4 deploy
3. npx wrangler@4 triggers deploy
4. npx wrangler@4 tail   → CONSTATER un déclenchement réel
```

⚠ L'étape 4 n'est pas du zèle. La nuit du 13/09, `deploy` annonçait le bon
calendrier alors que le planificateur ne déclenchait rien. La sortie de `deploy`
annonce le calendrier **envoyé**, pas celui qui est **actif**.

### 2. Vérification que le préchauffage mord

Sonde extérieure au navigateur (le Resource Timing ne tranche pas, cf. règle du
2026-09-22) : mesurer après 150 s sans activité de notre côté. Si le Worker
tourne, il aura pingé entre-temps et la valeur doit rester **sous 0,4 s**.

### 3. Protocole du relevé

Pour chacune des cinq pages ci-dessous, **trois chargements espacés d'au moins
60 s**, en notant la médiane — jamais un tir isolé :

- `/repjour/analytique`
- `/repjour/analytique/<année>/<mois>`
- `/pdj/analytique`
- `/pdj/analytique/<année>/<mois>`
- `/caisse/analytique` (témoin : page marginale, doit peu bouger)

Pour chaque chargement, relever :

- nombre de requêtes Supabase et **pic de concurrence réel** (calculé par
  balayage des intervalles début/fin, pas estimé) ;
- instant où la **dernière donnée utile** est arrivée (hors différés
  volontaires : easter eggs à 3 s, purge RGPD) ;
- durée de chaque requête, triée ;
- présence éventuelle d'une **cascade** (une requête qui démarre après la fin
  d'une autre).

### 4. Relevé côté base

Pour les requêtes les plus chères identifiées, un `explain (analyze, buffers)`
**à froid**, et le relevé `pg_stat_statements` (`calls`, `mean_exec_time`,
`max_exec_time`) avant remise à zéro.

## Ordre d'exécution

1. L'utilisateur déploie le Worker et constate un déclenchement réel.
2. Vérifier que le préchauffage mord (point 2).
3. Relevé navigateur des cinq pages (point 3).
4. Relevé base (point 4).
5. Écrire `releve-avant.md`.

## Critère de validation

- Une sonde après 150 s d'inactivité reste **sous 0,4 s** (preuve que le
  préchauffage est actif).
- `releve-avant.md` contient, pour les cinq pages, trois chargements chacune et
  leur médiane.
- L'écart entre le meilleur et le pire chargement d'une même page est **inférieur
  à un facteur 2**. Au-delà, le bruit domine encore et les étapes suivantes ne
  seront pas démontrables : ne pas continuer, chercher la cause.
