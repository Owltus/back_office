# Audit des requêtes — 2026-09-23

Question posée : « la base a peut-être grossi, est-ce que mes requêtes sont
saines et regardent vers le futur ? »

Réponse courte : **la base n'a pas grossi**, aucune requête ne charge un gros
volume, et sur 57 lectures auditées **quatre** seulement ne passeront pas
l'épreuve du temps. Elles sont nommées plus bas, avec leur projection.

---

## 1. La base n'est pas le problème

| | |
|---|---|
| Taille totale | **11,6 Mo** |
| Plus grosse table | `pdj_breakfasts`, 13 666 lignes, 5,5 Mo |
| Plus grosse réponse d'une requête | **78 ko** (`pdj_addon_production`) |

L'hypothèse « c'est devenu lent parce que la base a grossi » est **fausse**, et
c'est une bonne nouvelle : la lenteur venait de la concurrence (vingt requêtes
simultanées) et d'un plan d'exécution raté, tous deux corrigés le 2026-09-22.

Croissance réelle :

| table | lignes | depuis | par jour | dans 5 ans |
|---|---|---|---|---|
| `pdj_breakfasts` | 13 666 | 2026-01-01 | 51,6 | ~108 000 |
| `pms_daily_metrics` | 5 619 | 2026-07-09 | **74,9** | ~142 000 |
| `rapro_rooms` | 4 045 | 2026-07-01 | 48,7 | ~93 000 |
| `parking_reservations` | 647 | 2026-07-01 | 3,5 | ~7 000 |
| `pdj_addon_production` | 626 | 2026-01-01 | 2,4 | ~5 000 |
| `caisse_sheets` | 199 | 2026-07-01 | 2,4 | ~4 600 |
| `daily_reports` | 187 | 2026-01-31 | 0,8 | ~1 600 |

---

## 2. Ce qui est sain

57 lectures auditées (extraction automatique des chaînes `.from(...)`, avec
résolution des constantes de nom de table).

La grande majorité est **bornée** : par une date, une plage de dates, une année
et un mois, ou une clé unique. Les tables qui grossissent le plus vite sont
justement les mieux tenues :

- `rapro_rooms` — trois lectures, **toutes** bornées par date, colonnes
  explicites ;
- `pdj_breakfasts` — lectures bornées au jour affiché ;
- `parking_reservations` — `fetchReservations(from, to)` est appelée AVEC ses
  bornes depuis `ParkingBoard` (fenêtre glissante). La signature autorise
  l'absence de bornes, mais aucun appelant du chemin critique n'en profite.

---

## 3. Les quatre requêtes qui ne regardent pas vers le futur

### A. `pdj_daily_agg` sur tout l'historique — le seul cas vraiment sérieux

`BreakfastBoard.tsx:490` et `PdjAnalytiqueMoisBoard.tsx:95` appellent
`fetchDailyAgg('2000-01-01', '2100-12-31')`. Ces bornes ne bornent rien : la
vue réagrège **l'intégralité** de `pdj_breakfasts` à chaque fois.

Loi d'échelle mesurée :

| lignes sources | coût |
|---|---|
| 1 632 | 71 ms |
| 4 360 | 94 ms |
| 9 345 | 144 ms |
| 13 666 (aujourd'hui) | ~130 ms |
| **108 000 (dans 5 ans)** | **~1 000 ms** |

Soit ~50 ms fixes + ~9 ms par millier de lignes. Strictement **linéaire** :
le coût est proportionnel à l'âge de l'hôtel.

À quoi ça sert : les repères « moyenne par jour » (CA PDJ, captage, occupation)
et les prix de la carte. Des moyennes historiques, qui ne bougent pas d'un jour
sur l'autre.

### B. `fetchAllAddonProduction` — boucle de pagination SÉQUENTIELLE

`lib/pdj/service.ts:378`. Lit la table `pdj_addon_production` **entière**, par
pages de 1 000, `select('*')`, **chaque page attendant la précédente**.

Aujourd'hui 626 lignes = une seule page, donc invisible. À 5 000 lignes ce sera
**cinq allers-retours en série**, soit ~1 s de latence pure empilée, pour 620 ko.

Elle est sur le **chemin critique de `/pdj`** (`BreakfastBoard.tsx:465`), plus
les deux pages analytiques.

### C. `fetchSheets` — même motif, sur `caisse_sheets`

`lib/caisse/service.ts:92`. Table entière, `select('*')`, pagination séquentielle.
199 lignes aujourd'hui, ~4 600 dans 5 ans (cinq allers-retours, ~1 Mo).

Atténuation : appelée seulement par les pages **analytiques** caisse, pas par le
board `/caisse` lui-même. Moins urgent que B.

### D. `pms_daily_metrics` — 1,5 Mo qui grossit pour personne

C'est la table qui grossit le **plus vite** (74,9 lignes/jour) et l'application
ne la **lit jamais** : `lib/repjour/services/metrics.ts` ne fait qu'y écrire
(`upsert` puis `delete` ciblé). C'est une archive du CSV Comparison.

Ce n'est pas un problème de vitesse — rien ne la scanne — mais c'est de
l'accumulation sans lecteur : sauvegardes, autovacuum, pression mémoire sur une
petite instance partagée.

---

## 4. Points d'hygiène, sans urgence

- **`select('*')` sur `pdj_breakfasts`** (`lib/pdj/service.ts:116`) : 31 colonnes
  dont `guest_name`, `company`, `channel`, `rate_plan`. `CLAUDE.md` interdit
  explicitement le `select *` sur une table à PII. Volume modeste (16 ko pour un
  jour), mais la règle existe pour une raison.
- **`select('*')` sur `caisse_sheets`** : 38 colonnes, toutes probablement
  utilisées — à vérifier avant de toucher.
- `fetchReservations` accepte des bornes optionnelles : aucun appelant critique
  n'omet les bornes aujourd'hui, mais rien ne l'empêche demain.

---

## 5. Décisions qui appartiennent à l'utilisateur

Les correctifs de A, B et C **changent la base de calcul** de chiffres affichés
(moyennes historiques, prix de carte). Ce n'est pas une décision technique.

Pour A, deux voies :

1. **Pré-agréger** — une vue matérialisée rafraîchie une fois par jour. Les
   moyennes restent calculées sur tout l'historique et deviennent quasi
   gratuites, mais avec jusqu'à 24 h de retard. *Recommandé* : des moyennes sur
   plusieurs centaines de jours ne bougent pas de façon perceptible en 24 h.
2. **Borner** à 12 ou 24 mois — gain immédiat, mais les moyennes ne portent plus
   sur tout l'historique.

Pour B et C, une voie décision-libre existe : garder la lecture complète mais
apprendre d'abord le total puis tirer les pages **en parallèle** (le plafond
global de six requêtes les protège désormais). Même résultat, mais un
aller-retour au lieu de cinq.

Pour D : décider d'une rétention (garder 24 mois ?) ou assumer l'accumulation.

---

## Méthode

- Inventaire : `pg_class` / `pg_total_relation_size`, comptages réels (les
  `n_live_tup` de `pg_stat_user_tables` étaient périmés et trompeurs).
- Poids des réponses : `sum(pg_column_size(t.*))` par requête.
- Loi d'échelle : `explain analyze` sur cinq fenêtres de dates croissantes.
- Audit du code : extraction automatique des 57 chaînes `.from(...)` avec
  résolution des constantes, puis classement bornée / non bornée / `select *`.
