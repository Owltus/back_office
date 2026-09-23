# Relevé d'après — et pourquoi le chantier s'arrête là

Établi le 2026-09-23, après les étapes 1 à 5. Même protocole que
`releve-avant.md`.

**Conclusion en une phrase : le chantier a donné ce qu'il pouvait donner, et les
étapes 5b à 8 ne rapporteraient rien de mesurable.** Ce document le démontre
plutôt que de l'affirmer.

---

## 1. Ce qui a réellement gagné

| | avant | après | |
|---|---|---|---|
| 1re requête après inactivité | 1 398 ms | **394 ms** | **×3,5** |
| tableau de bord `/repjour` | 5 906 ms | **1 112 ms** | ×5,3 |
| board `/pdj` | 6 022 ms | **1 293 ms** | ×4,7 |
| `/repjour/analytique` | 1 719 ms | **1 010 ms** | −41 % |

Les deux premières lignes sont les vraies victoires, et aucune ne vient d'une
consolidation de requêtes :

- le **préchauffage** (Worker Cloudflare) supprime le démarrage à froid sur
  **toutes** les pages ;
- le **plafond de six requêtes simultanées** et la **scission de la salve**
  (2026-09-22) ont réglé le tableau de bord et le board PDJ, qui lançaient
  vingt lectures d'un coup.

## 2. Ce qui n'a PAS gagné, et c'est la moitié du relevé

| page | avant | après |
|---|---|---|
| `/repjour/analytique/2026/9` | 1 582 ms | 1 540 / 1 744 ms |
| `/pdj/analytique` | 1 507 ms | 1 850 ms |
| `/pdj/analytique/2026/9` | 2 212 ms | 1 608 ms |

Bruit, dans les deux sens. Les requêtes ont pourtant été divisées par deux sur
les pages RepJour. **Diviser le nombre de requêtes n'a pas divisé le temps.**

La raison est dans les chronogrammes.

---

## 3. Pourquoi consolider ne gagne plus rien

`/pdj/analytique`, après travaux :

```
  196 ->  676  ( 480 ms)  get_my_access
 1287 -> 1647  ( 360 ms)  pdj_service_dates
 1287 -> 1850  ( 563 ms)  pdj_daily_agg
 1287 -> 1730  ( 444 ms)  pdj_addon_production
 1287 -> 1638  ( 351 ms)  pdj_externals
```

Les quatre lectures sont **parallèles** et tiennent sous le plafond de six.
Le temps de la page est donc `max(durées)`, pas leur somme. Fusionner trois
d'entre elles en une RPC laisserait la plus lente inchangée — `pdj_daily_agg`,
qui doit de toute façon rester séparée (clé partagée avec le board PDJ et la
bande RepJour). Gain théorique : de l'ordre de 5 %.

**C'est la limite de la méthode.** Consolider est décisif quand les requêtes se
font concurrence — vingt lectures sur une instance qui s'effondre à quatorze,
comme le tableau de bord le 2026-09-22. Ça ne sert à rien quand elles sont
quatre et qu'elles tiennent dans la même vague.

## 4. Le « creux de chargement du code » n'existe pas comme coût structurel

Le `releve-avant.md` signalait 331 à 1 056 ms entre les droits connus et la
première requête de données, et je l'avais annoncé comme le plus gros poste
restant. **C'était faux, et c'est une erreur de méthode de ma part** : les
quatre mesures avaient toutes été prises juste après un déploiement.

Mesures répétées le même jour, sur les mêmes pages :

| page | creux |
|---|---|
| `/pdj/analytique/2026/9` | 802 ms puis **7 ms** |
| `/repjour/analytique/2026/9` | 961 ms puis **278 ms** |

Tout le JavaScript est chargé en **250 ms** (deux vagues, 771 ko, entièrement
en cache navigateur) — le creux n'est donc ni du réseau ni du téléchargement.
C'est la **compilation** des 771 ko, que V8 met en cache après la première
exécution. Un utilisateur la paie **une fois après chaque déploiement**, pas à
chaque ouverture.

Précharger le code analytique depuis les boards n'y changerait rien : le coût
n'est pas d'aller le chercher, c'est de le compiler.

## 5. Borner `pdj_daily_agg` ne gagnerait rien non plus

| lecture | coût |
|---|---|
| tout l'historique | **120 ms** |
| bornée à l'année | **120 ms** |

Identiques, pour une raison simple : **toutes les données sont sur 2026**.
« Tout l'historique » et « l'année » désignent aujourd'hui le même ensemble.

Les 563 ms vues dans le navigateur pour 120 ms de SQL sont du transport et de
la sérialisation, pas du calcul. ⚠ Ce constat a une date de péremption : il
redeviendra faux dès que la base couvrira plusieurs années.

---

## 6. Ce que valent vraiment les étapes restantes

| étape | gain attendu | verdict |
|---|---|---|
| 5b — RPC PDJ | ~5 % sur une page | **SANS OBJET** — la lecture la plus lente reste hors RPC (§3) |
| 6 — RPC caisse | ~0 | **SANS OBJET** — 2 lectures par page, déjà sous le plafond |
| 7 — RPC parking | ~0 | **SANS OBJET** pour la RPC. ⚠ Le **bornage** de `parking_arrivals_agg` reste valable : c'est la seule lecture « tout l'historique » non bornée qui subsiste, et elle grossit de 365 lignes par an |
| 8 — RPC rapro | ~0 | **SANS OBJET** — 2 lectures, déjà partagées entre annuel et mensuel |

L'utilisateur avait demandé ces quatre étapes pour l'uniformité, après que j'aie
argumenté qu'elles ne rapporteraient rien. La mesure lui donne tort sur le
gain — et me donne tort sur l'ampleur de ce que la consolidation pouvait
apporter, y compris là où je l'ai faite.

## 7. Ce qui reste légitimement à faire

1. **Borner `parking_arrivals_agg`** (extrait de l'étape 7). Petit, sans
   décision, et il protège l'avenir.
2. **Décider du sort de `pms_daily_metrics`** : 1,5 Mo, la table qui grossit le
   plus vite (74,9 lignes/jour) et que l'application ne lit **jamais**.
   Rétention ou accumulation — décision utilisateur.
3. **Re-mesurer quand la base couvrira deux ans.** Trois constats de ce document
   (§5 surtout) sont vrais parce que l'historique tient sur une année.

---

## Méthode — les erreurs de ce chantier, consignées

Elles valent plus que ses gains, parce qu'elles se répéteront sinon.

1. **Mesurer une base chaude et annoncer un gain.** En rechargeant en boucle, on
   ne mesure jamais le cas de l'utilisateur, qui ouvre l'app une fois le matin.
   Le préchauffage — le plus gros gain du chantier — était invisible dans toutes
   mes mesures précédentes pour cette raison exacte.
2. **Conclure sur un instrument non validé.** J'ai affirmé « les pings
   n'arrivent pas » parce qu'un compteur `pg_stat_statements` ne bougeait pas.
   Test témoin : cinq pings réels, dont je voyais les réponses, ne l'ont pas
   bougé d'une unité — il n'enregistre pas les requêtes refusées en permission.
3. **Extrapoler au lieu de mesurer.** J'ai annoncé un plafond à 0,7 s pour le
   préchauffage à partir de la courbe de décroissance. La rafale a donné
   0,394 s.
4. **Généraliser quatre mesures prises dans le même état.** Le « creux de
   chargement » (§4).
5. **Supposer qu'un gain sur une page se transpose.** Consolider a divisé par
   cinq le tableau de bord (vingt requêtes concurrentes) et n'a rien donné sur
   l'analytique PDJ (quatre requêtes parallèles). Le nombre de requêtes ne dit
   rien ; ce qui compte est de savoir si elles **se font concurrence**.
