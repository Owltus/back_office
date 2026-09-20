# Relevé après travaux

Mesures du **2026-09-20**, après exécution du chantier.

⚠ **Ce relevé est PARTIEL, et c'est normal.** Deux familles de chiffres ne
peuvent pas être prises le jour même :

- la **répartition du processeur de la base** demande 24 h d'observation après
  la remise à zéro de `pg_stat_statements` (faite à **10h28:58**, heure de
  Paris) ;
- les **temps ressentis dans le navigateur** demandent une session ouverte sur
  le domaine de production, et plusieurs passages à des heures différentes.

Les sections correspondantes sont laissées vides plutôt que remplies
d'estimations.

---

## 1. Ce qui est mesuré et acquis

### `pdj_daily_agg` — la seule vue réécrite

Trois passes alternées avant application, puis deux après, sur une fenêtre d'un
mois :

| | Avant | Après |
|---|---|---|
| Temps d'exécution | 203 / 99 / 98 ms | 67 / 10 / 10 ms, puis **10,9 / 10,8 ms** en production |
| `Rows Removed by Filter` | **802** pour 65 lignes utiles | **4** |
| Lignes rendues | 867 | 867, identiques |

Équivalence prouvée en lecture seule avant toute modification : double
différence d'ensembles (`except all` dans les deux sens) sur la totalité des
867 lignes, **0 en trop, 0 manquante**.

Contrôle immédiat après application : `security_invoker=true` préservé, `anon`
toujours sans aucun droit, `SELECT` conservé à `authenticated`.

### Publication temps réel

| Avant | Après |
|---|---|
| `baby_cot_assignments`, `parking_reservations`, `pdj_breakfasts` | **`parking_reservations` seule** |

### Poids du JavaScript

| | Avant | Après |
|---|---:|---:|
| Chunk `galaxie-*.js` | 504 582 o | **6 420 o** |
| Fermeture statique de `/facturation/galaxie` | 428 677 gzip | **266 936 gzip** (−38 %) |
| Coquille `KpiLineChart-*.js` | — | 1 962 o, **sans aucune référence** au chunk recharts |
| Coût plancher du shell | 977 595 / 277 638 | 979 349 / 278 910 |

Le coût plancher ne bouge pas, et c'est attendu : recharts et echarts n'y
étaient pas. Le gain porte sur les **routes**, pas sur l'entrée. Les 1 272 octets
compressés en plus sont les coquilles de chargement différé et les déclarations
`@font-face` des polices auto-hébergées.

### Fichiers statiques en production

Mesuré avant travaux sur `backoffice.naostack.com` :
`Cache-Control: public, max-age=0, must-revalidate` sur `/assets/*.js`, alors
que ces noms portent déjà une empreinte de contenu. La règle `immutable` est
posée dans `vercel.json` ; **à revérifier après déploiement** :

```bash
curl -sI https://backoffice.naostack.com/assets/<un-chunk>.js | grep -i cache-control
```

### Contrôles de non-régression

| Contrôle | État |
|---|---|
| `npx tsc --noEmit` | aucune erreur |
| `pnpm test` | **827 tests, 81 fichiers, tous verts** |
| `pnpm build` | passe |
| `pnpm lint` | **218 problèmes contre 220 avant** — aucun ajouté, deux retirés (imports devenus inutiles) |

---

## 2. À relever le 2026-09-21 et après

### Répartition du processeur de la base

À rejouer 24 h après la remise à zéro :

```bash
supabase db query --linked -f supabase/verif_perf_2026-09-20.sql
```

| Sous-système | Avant (14 j) | Après (24 h) |
|---|---:|---|
| Realtime — poller WAL | **71,1 %** | |
| Applicatif et autre | 17,1 % | |
| PostgREST — cache de schéma | 6,6 % | |
| Realtime — divers | 4,0 % | |
| PostgREST — préambule | 1,3 % | |

Et la signature de famine, qui est le vrai juge :

| | Avant | Après |
|---|---|---|
| `set_config()` min / moyenne / max | 0,019 / **5,13** / **1 211** ms | |

⚠ **Ne pas attendre une division par trois.** Le poller lit le journal de
réplication, pas les tables une par une : il continuera de tourner pour
`parking_reservations`. Retirer deux tables sur trois réduit le volume à
décoder, pas la cadence. Si la part de Realtime reste élevée, la question de la
taille de l'instance (angle D2, écarté pour l'instant) se reposera — avec, cette
fois, des chiffres d'après travaux.

### Temps ressentis dans le navigateur

Protocole de l'étape 1, aux mêmes heures, trois passes chacun :

| Scénario | Avant | Après |
|---|---|---|
| Ouverture à froid après plus d'une heure d'inactivité | non mesuré | |
| Durée de `/auth/v1/token` et moment du premier contenu | non mesuré | |
| Clic sur un onglet sans survol → premier changement visible | non mesuré | |
| Deuxième visite : fichiers servis depuis le cache | non mesuré | |
| `fonts.googleapis.com` bloqué dans les DevTools → l'app s'affiche | échec attendu | |

Ce dernier test est le plus parlant des cinq : avant, l'application restait
blanche. Après, elle ne doit plus rien attendre de Google.

---

## 3. Ce que le chantier n'a PAS fait

- **La taille de l'instance n'a pas changé** (décision de l'utilisateur). La
  famine ne sera donc levée qu'à hauteur de ce que la réduction du temps réel
  aura rendu.
- **Les casts `::text`** des vues `rapro_daily_agg`, `parking_arrivals_agg` et
  `parking_daily_occupation` restent en place : les corriger demande un
  `drop view` (on ne change pas le type d'une colonne par
  `create or replace`), donc une confirmation explicite qui n'a pas été
  demandée. Gain estimé : quelques dizaines de millisecondes sur ~13 appels par
  jour, soit 0,6 % de la charge.
- **Les 35 rechargements quotidiens du cache de schéma PostgREST** (6,6 % du
  processeur, 1,1 s chacun pendant lesquels les requêtes attendent) n'ont pas
  été expliqués. C'est l'angle mort le plus rentable qui reste, et il demande
  les journaux de la plateforme.
- **Trois étapes prévues ont été annulées par la mesure** : la simulation de la
  galaxie (22 nœuds actifs et non 200), les colonnes du planning parking (déjà
  virtualisées), la mémoïsation de `RaproBoard` (une centaine d'opérations par
  rendu). Voir les fichiers 7, 8 et 9.
