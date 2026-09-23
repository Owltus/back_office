# Relevé de référence — avant travaux

Établi le 2026-09-23, **après** activation du préchauffage et **avant** toute
consolidation. C'est la ligne de départ contre laquelle le relevé d'après sera
comparé.

---

## 1. Le préchauffage est actif — preuve en trois temps

Ce n'est pas une déduction, ce sont trois constats indépendants.

**Déclenchement réel** (`wrangler tail --format json`) :

```json
{ "event": { "cron": "* 4-22 * * *" }, "outcome": "ok",
  "wallTime": 31902, "exceptions": [],
  "scriptVersion": { "id": "691529f6-..." } }
```

**Les pings arrivent** (journal du Worker lui-même, version `35517148`) :

```
[prechauffage] rafale1=[401 en 683 ms, 401 en 1155 ms, 401 en 334 ms]
               gotrue=200 en 344 ms
               rafale2=[401 en 737 ms, 401 en 371 ms, 401 en 337 ms]
```

Le `401` est le **succès attendu** : `anon` n'a aucun privilège sur `public`, et
le code PostgreSQL `42501` prouve que la requête est allée jusqu'à la base.

**Effet mesuré**, depuis la position réseau de l'utilisateur, après 160 s sans
aucune activité de notre côté :

| état | 1re requête |
|---|---|
| avant tout déploiement | **1,398 s** |
| ping unique toutes les 30 s | 0,740 s / 0,627 s |
| **rafale de 3 (déployé)** | **0,394 / 0,384 / 0,598 s** |

**Facteur 3,5 sur la première requête de chaque page.** C'était la première
cause de lenteur vécue, et elle était invisible dans toutes les mesures
précédentes — en rechargeant en boucle, on ne mesure jamais qu'une base chaude.

⚠ Deux corrections de mes propres erreurs, consignées parce qu'elles valent plus
que le résultat :

1. J'ai conclu « les pings n'arrivent pas » sur un compteur
   `pg_stat_statements` qui ne bougeait pas. **Test témoin** : cinq pings réels,
   dont je voyais les réponses, n'ont pas bougé ce compteur d'une unité —
   `pg_stat_statements` n'enregistre pas les requêtes refusées en permission.
   **L'instrument était aveugle, la conclusion était fausse.**
2. J'ai annoncé un plafond à 0,7 s en extrapolant la courbe de décroissance.
   La rafale a donné 0,394 s. **L'extrapolation était fausse, la mesure a
   tranché.**

---

## 2. Les quatre pages du chantier

Protocole : chargement complet, relevé du Resource Timing. « Données prêtes » =
instant de la dernière réponse utile, **hors différés volontaires** (easter eggs
à 3 s). « Pic » = concurrence maximale réellement observée, calculée par
balayage des intervalles.

| page | requêtes | dont utiles | pic | données prêtes |
|---|---|---|---|---|
| `/repjour/analytique` | 6 | 5 | 4 | **2 051** puis **1 719 ms** |
| `/repjour/analytique/2026/9` | 6 | 5 | 4 | **1 582 ms** |
| `/pdj/analytique` | 6 | 5 | 4 | **1 507 ms** |
| `/pdj/analytique/2026/9` | 6 | 5 | 4 | **2 212 ms** |

⚠ **Limite de ce relevé** : 1 à 2 chargements par page, pas 3 comme le protocole
de l'étape 1 le prévoyait. L'écart max/min observé sur `/repjour/analytique`
(2 051 / 1 719) reste sous le facteur 2 exigé, mais l'échantillon est mince. À
renforcer si un gain mesuré au relevé d'après tombait sous les 20 %.

Pour mémoire, la même page `/repjour/analytique` mesurée **avant** le
préchauffage : **4 579 ms**. Le préchauffage seul l'a donc ramenée à ~1 900 ms,
**sans une ligne de code changée sur cette page**.

---

## 3. Découverte non anticipée — la moitié du temps précède la première requête

Chronogramme de `/pdj/analytique/2026/9` :

```
  278 ->  479  rpc/get_my_access        (201 ms)
                                        <-- 1 056 ms de silence
 1535 -> 2212  pdj_daily_agg
 1535 -> 2207  pdj_daily_agg
 1535 -> 1826  pdj_addon_production
 1535 -> 1754  pdj_externals
```

Les droits sont connus à **479 ms**. La première requête de données ne part
qu'à **1 535 ms**. Plus d'une seconde s'écoule sans aucun réseau — c'est le
**téléchargement et le montage du code de la route** (recharts, composants
analytiques).

Le même creux existe sur les trois autres pages :

| page | droits connus | vague de données | creux |
|---|---|---|---|
| `/repjour/analytique` | 1 120 ms | 1 546 ms | 426 ms |
| `/repjour/analytique/2026/9` | 451 ms | 1 139 ms | 688 ms |
| `/pdj/analytique` | 440 ms | 771 ms | 331 ms |
| `/pdj/analytique/2026/9` | 479 ms | 1 535 ms | **1 056 ms** |

**Conséquence pour ce chantier** : consolider 4 requêtes en 1 sur une page dont
la vague dure déjà moins de 700 ms ne peut pas gagner plus de 700 ms. Sur
`/pdj/analytique/2026/9`, le creux de code (1 056 ms) est **plus coûteux que
toute la vague de données** (677 ms).

⚠ **Ce n'est pas une raison d'abandonner la consolidation** — elle reste le
seul levier sur la partie réseau, et elle protège l'avenir quand les tables
grossiront. Mais elle borne le gain attendu, et il faut le dire **avant** de
mesurer l'après, pas après.

Piste à ouvrir séparément, hors de ce chantier : `defaultPreload: 'intent'`
précharge déjà le code au survol d'un lien. Il ne joue pas ici parce que
l'arrivée se fait par URL directe. Un préchargement du chunk analytique depuis
le board correspondant supprimerait ce creux — à mesurer, pas à supposer.

---

## 4. Ce qui reste à établir

- Relevé `pg_stat_statements` avant remise à zéro, pour compter les requêtes
  supprimées au relevé d'après. ⚠ **Attention** : ce compteur est **aveugle aux
  requêtes refusées en permission** (démontré en section 1). Il ne mesurera que
  les lectures authentifiées.
- `explain (analyze, buffers)` **à froid** des requêtes les plus chères
  (`pdj_daily_agg` sur tout l'historique, `fetchAllAddonProduction`).
- Les six pages hors périmètre initial (caisse, parking, rapro), entrées dans le
  chantier sur décision de l'utilisateur.
