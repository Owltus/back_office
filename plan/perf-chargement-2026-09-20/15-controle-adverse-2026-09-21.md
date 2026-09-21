# Étape 15 — Contrôle adverse du chantier, et ce qu'il a changé

> Ajoutée le 2026-09-21, après que l'utilisateur a constaté que le chantier de la
> veille n'avait rien changé au ressenti. Six agents lancés en parallèle, dont
> **un dont la seule mission était de démonter le travail livré**.

## Ce que le contrôle a établi

Le chantier du 2026-09-20 n'était pas cosmétique, mais **son axe principal — le
démarrage — l'était**. Un seul commit sur quatorze pouvait se ressentir (le
retrait du temps réel), et il a été appliqué deux minutes avant la clôture.

La cause de fond est de méthode, et elle est écrite noir sur blanc dans le
dossier : **aucune mesure navigateur n'a été prise, ni avant, ni après.** Le
symptôme rapporté était un ressenti navigateur. Quatorze commits ont été livrés
sans jamais chronométrer la chose qui se plaignait.

La leçon posée dans le fichier 7 — « ne jamais optimiser sur une estimation » — a
été appliquée aux **trois étapes annulées** et à aucune des **neuf livrées**.

## Trois régressions introduites la veille, corrigées

**`BabyCotBoard` — le message de commit était faux.** Il annonçait « le même
garde-fou » que le PDJ ; les trois écouteurs étaient nus. Un retour d'onglet émet
`visibilitychange` puis `focus`, soit deux rechargements complets consécutifs,
chacun remplaçant tout l'état local. Tant que le canal temps réel existait, ce
chemin était un filet rarement pris ; depuis son retrait, c'est le chemin unique.

**`BreakfastBoard` — trou de fraîcheur de 30 s.** L'écart minimal sortait sans
rien replanifier : revenir sur l'onglet dans les 30 s suivant l'ouverture ne
déclenchait aucune relecture, ni immédiate ni différée.

**`AuthContext` — faux écran connecté.** La lecture de session persistée ne
vérifiait pas l'expiration : sur un jeton révoqué, l'application s'affichait
« connectée » et garnie d'erreurs pendant près de 40 s avant l'éjection.

## Le filet de 3 s : retiré, et pourquoi

Le mécanisme était **correct** — le contrôle l'a vérifié dans le code d'`auth-js`
et a confirmé les trois affirmations du commit : la marge de 90 s,
`getSession()` qui part sur le réseau, le plafond de ~40 s. L'hypothèse
alternative (« `INITIAL_SESSION` arrive avant et lève `loading` tout seul ») est
**fausse** : les deux chemins attendent la même `initializePromise`.

Il est retiré quand même, pour deux raisons qui se renforcent :

1. **Il ne se déclenchait jamais dans le cas courant.** Un renouvellement sain
   prend 150 à 400 ms ; le minuteur de 3 s était annulé avant d'avoir servi.
   C'était un non-événement sur 99 % des démarrages.
2. **Quand il se déclenchait, il n'avançait aucune donnée.** Toute requête
   PostgREST passe par `_getAccessToken`, qui attend la **même**
   `initializePromise`. Il remplaçait un squelette par un autre squelette.

⚠ Le plan de la veille (`2-demarrage-non-bloquant.md`, section « Effet
d'entraînement ») **décrivait ce mécanisme à la ligne près** avant de livrer un
correctif qui ne le traite pas.

**Le vrai verrou est cette barrière.** Le traiter demande de découpler PostgREST
de GoTrue — l'option `accessToken` de `createClient` — pas de poser un minuteur
par-dessus. C'est le premier chantier de la suite.

## Le chemin d'entrée, ouvert pour la première fois

Il était resté intact la veille. Ventilation de `index-*.js` par sourcemap
(99,97 % attribué) :

| Bloc | Brut | Part |
|---|---:|---:|
| react-dom + react + scheduler | 178 555 | 40,3 % |
| TanStack Router | 80 713 | 18,2 % |
| **effets d'easter egg** | **44 150** | **10,0 %** |
| TanStack Query | 34 717 | 7,8 % |
| Radix + floating-ui | 34 103 | 7,7 % |
| chrome applicatif | 21 838 | 4,9 % |
| seroval (déshydratation SSR, dans une SPA) | 20 877 | 4,7 % |
| arbre de routes | 11 802 | 2,7 % |

Deux poids morts retirés :

**Zod, 53 002 octets bruts.** Les `validateSearch` vivent dans la partie non
code-splittée des routes : zod était donc payé par **chaque page**, dont 8 712
octets de conversion vers JSON Schema jamais appelée, pour une expression
régulière, un contrôle de calendrier et deux bornes entières. Remplacé par une
trentaine de lignes.

**Les quatorze animations d'easter egg, 44 150 octets bruts.** `AppAuthGate`
monte `<EasterEggs>` sur toute l'application, qui importait le registre complet —
et un `EffectDefinition` porte sa fonction `create()`, donc importer le registre
importait les animations. Registre paresseux, chunk téléchargé à la frappe.

| | Avant | Après |
|---|---:|---:|
| Coût plancher, brut | 979 349 | **880 810** |
| Coût plancher, compressé | 279 332 | **247 117** |
| Fichiers | 23 | 22 |
| `index-*.js` | 442 716 | 397 227 |

**−32 215 octets compressés, soit −11,5 %**, payés par chaque page à chaque
première visite.

## Deux propositions d'agent réfutées par la mesure

**`advancedChunks` — non-événement complet.** Un agent estimait −6 488 octets
compressés et −19 requêtes en fusionnant les miettes de chunks. Build lancé avec
et sans : **chiffres identiques à l'octet près** (173 chunks, 22 fichiers
d'entrée, 247 053 compressés). Le greffon TanStack Start écrase les options de
sortie de rolldown. La configuration n'a pas été conservée.

**Le découpage des portes de chargement — écarté.** Un agent classait ★★★★☆ le
découpage du shell analytique en trois portes. Mais **une porte qui agrège des
requêtes PARALLÈLES coûte le MAXIMUM, pas la somme** : en retirer une requête
rapide ne gagne rien, et fait sauter des valeurs à l'écran. Sur le parking, la
lecture lente (`parking_arrivals_agg`, tout l'historique) est justement celle qui
reste dans la porte.

Seules les vraies **cascades** — où un aller-retour attend le précédent —
valaient d'être traitées. Deux l'ont été.

## Les deux cascades traitées

**L'accueil : ma propre demi-mesure défaite.** La veille, `DayCrossSummary` avait
été monté hors de sa branche conditionnelle pour que ses douze requêtes partent
tôt. Elles partaient bien tôt — mais la condition d'affichage attendait
**exactement les mêmes données qu'avant**. Les douze réponses arrivaient souvent
avant le rapport du jour et restaient invisibles jusqu'à lui. Gain sur le réseau,
perte totale à l'écran.

**La caisse.** La lecture de la feuille précédente était conditionnée à la
feuille courante, alors qu'elle n'a besoin d'aucune de ses données. On attendait
un aller-retour complet pour décider s'il fallait en faire un second. Les deux
partent désormais ensemble.

## Les mesures réseau qui manquaient

Prises en production, trois passes, médiane :

| | |
|---|---:|
| Aller-retour réseau vers la base | **8,5 ms** |
| Premier octet d'un appel applicatif, connexion chaude | **96 ms** |
| Premier octet, connexion froide | 380 ms (queue à 745) |
| Vercel sert depuis | `cdg1`, Paris, 5 passes sur 5 |

⚠ **Piège vérifié** : le `401` obtenu en tapant l'URL Supabase vient de la
périphérie Cloudflare à Paris en 13,7 ms. Ce n'est pas la base. L'écart
périphérie ↔ origine est de 82 ms, soit un facteur 7.

Ce que cela impose : **le nombre de requêtes n'est pas le sujet, leur
sérialisation l'est.** Vingt requêtes parallèles coûtent à peu près le prix
d'une ; vingt requêtes en cascade coûtent près de deux secondes.

**Et la compression n'a rien à donner** : Vercel sert du brotli de qualité
moyenne, **plus gros que son propre gzip** (290 058 contre 283 234 octets sur le
lot d'entrée). Les chiffres gzip du dossier n'étaient pas pessimistes, ils
étaient optimistes de 2,4 %.

## Le déploiement de la veille : vérifié en production

| Marqueur | État |
|---|---|
| `fonts.googleapis.com` dans le HTML servi | **0 occurrence** |
| CSP renvoyée en en-tête | aucune mention de Google |
| `cache-control` sur `/assets/*` | `max-age=31536000, immutable` ✔ |
| `_shell.html` | `max-age=0, must-revalidate` ✔ (voulu) |

Tout le chantier de la veille est bien en ligne depuis dimanche 10h54.

## La mesure d'après travaux, promise et due

Fenêtre : 26,96 h après la remise à zéro de `pg_stat_statements`.

| | Avant (14 j) | Après (27 h) | |
|---|---:|---:|---|
| **Charge totale de la base** | **645 s/jour** | **311 s/jour** | **−52 %** |
| Poller Realtime | 458 s/jour | 211 s/jour | −54 % |
| Applicatif | 110 s/jour | 67 s/jour | −39 % |
| Cache de schéma PostgREST | 43 s/jour | 25 s/jour | −41 % |
| `set_config()` pire cas | **1 211 ms** | **127 ms** | **−90 %** |

**La charge est divisée par deux et les pics de gel par dix.** Mais la famine
n'est pas levée, elle est atténuée : `stddev` (12,05 ms) dépasse toujours `mean`
(4,35 ms), et le témoin met encore 170 fois son propre minimum.

Lire ces lignes en pourcentages serait une erreur : la part du temps réel reste à
68 %, parce que **tout** a baissé.

---

## Ce qui reste, et qui ne dépend plus de nous

### Les 23 gels quotidiens — cause identifiée, correctif hors de portée

La chaîne complète, établie sans trou :

1. L'event trigger `extensions.pgrst_ddl_watch` se déclenche sur **tout** DDL, en
   n'excluant que `pg_temp`.
2. Le mainteneur de partitions de `realtime.messages` rejoue toutes les ~2 h une
   rafale de `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … OWNER TO`. Le
   `CREATE … IF NOT EXISTS` sur une partition présente est un no-op silencieux,
   **mais `ALTER TABLE … OWNER TO` s'exécute et déclenche l'event trigger même
   quand le propriétaire est déjà le bon**.
3. Chaque rafale devient un `NOTIFY pgrst, 'reload schema'`.
4. PostgREST recharge tout son catalogue — **1,085 s pendant lesquelles il met
   les requêtes en attente**.

L'arithmétique boucle exactement : 13 passages × 2 rechargements = **26**, le
compteur observé. Hors `realtime.messages`, il n'y a **que deux DDL** dans toute
la fenêtre, et aucun ne déclenche l'event trigger.

Les deux explications concurrentes sont mortes : PostgREST n'a **pas redémarré**
en 14,9 jours (connexion `LISTEN "pgrst"` ouverte depuis le 2026-09-06), la base
non plus.

**Le correctif tient en une clause** — ajouter
`AND cmd.schema_name is distinct from 'realtime'` — et **nous n'avons pas le
droit de l'appliquer** :

```
ERROR: 42501: must be owner of function pgrst_ddl_watch
ERROR: 42501: must be owner of event trigger pgrst_ddl_watch
```

`current_user` = `postgres`, `rolsuper` = false, non membre de `supabase_admin`.
Le tableau de bord SQL utilise le même rôle : même refus. **C'est à Supabase de
le corriger** — c'est leur Realtime qui déclenche leur PostgREST.

### Le découplage PostgREST / GoTrue — le vrai verrou du démarrage

`_getAccessToken` fait `await this.auth.getSession()` avant **chaque** requête, et
`getSession()` attend `initializePromise`, donc le renouvellement du jeton. Toutes
les données du démarrage sont derrière une barrière unique et strictement
sérielle.

Piste : l'option `accessToken` de `createClient`, qui court-circuite GoTrue pour
PostgREST. Chantier de refonte du démarrage, à mener avec des mesures navigateur
cette fois.

### Supabase hors du chemin critique — ~50 000 octets compressés

`@supabase/*` pèse **196 238 octets bruts** dans la fermeture d'entrée, dont
**84 385 objectivement morts au démarrage** : `realtime-js` + `phoenix` (54 755,
jamais au boot), `storage-js` + `iceberg-js` (26 889, **aucun appel
`supabase.storage` dans tout `src/`**), `functions-js` (2 741, une seule page).

Le client est construit à l'évaluation du module (`export const supabase =
createClient(...)`) et consommé immédiatement par `AuthProvider`. Le différer
demande de lire la présence du jeton en `localStorage` pour décider
« connecté / pas connecté » avant que le client n'existe. ⚠ Il faudrait d'abord
extraire `lib/supabase.ts` du chunk `AuthContext`, que **31 chunks de route**
référencent déjà.

### Plus petit, et sans risque

- **`seroval` + `start-client-core`**, ~26 300 octets de machinerie de
  déshydratation SSR dans une SPA sans un seul `createServerFn`.
- **`styles.css`**, 144 350 octets bruts en **une feuille bloquant le rendu**,
  contenant toutes les pages (affiche A3 et styles d'impression compris).
- **`/favicon.svg`** hors de `/assets/`, donc revalidé à chaque navigation.
- **Le `modulepreload` de la route d'atterrissage** : la table chemin → chunk
  existe au build (`__vite__mapDeps`), mais n'est lisible qu'après avoir
  téléchargé et analysé les 397 Ko de l'entrée. Un script inline dans le shell
  supprimerait un des trois étages sériels — **aucun octet gagné, mais c'est
  probablement ce qui se ressentirait le plus**.

---

## La règle à retenir

Une seule, et elle vaut plus que tout le reste du dossier :

> **Mesurer dans un navigateur avant de toucher au code, et mesurer après.**

Deux jours de travail sur une application dont on n'a jamais chronométré une
seule ouverture. Les trois seules conclusions certaines du chantier sont les
trois étapes **annulées** — les seules où une mesure avait précédé la décision.
