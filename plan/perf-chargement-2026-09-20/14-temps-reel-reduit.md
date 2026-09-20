# Étape 14 — Réduire le temps réel au seul planning parking

## Objectif

Alléger le poller qui consomme 71 % du processeur de la base, en ne gardant la
mise à jour instantanée que là où deux personnes travaillent réellement en même
temps.

## Contexte

Décision de l'utilisateur du 2026-09-20 (angle D1, option B), qui révise celle du
2026-09-06.

Mesure : `realtime.list_changes()` totalise **5 865 s de CPU pour 1 004 463
appels** en 13 j 17 h, soit **71,2 %** du processeur, à raison de 0,85 appel par
seconde **en continu, même quand personne n'est connecté**. S'y ajoutent 326 s de
gestion de publication et de slots, et **128 recréations de slot** (≈ 9,3
redémarrages par jour, signature d'un manque de mémoire sur 1 Go).

Trois tables sont publiées :

| Table | Abonnement client | Décision |
|---|---|---|
| `parking_reservations` | `ParkingBoard.tsx:532` | **conservée** — deux postes éditent le même planning, avec glisser-déposer |
| `pdj_breakfasts` | `BreakfastBoard.tsx:323` | **retirée** — passage au rafraîchissement au retour d'onglet |
| `baby_cot_assignments` | `BabyCotBoard.tsx:384` | **retirée** — idem |

⚠ **Le poller de Realtime lit le journal de réplication, pas les tables une par
une.** Retirer deux tables sur trois de la publication réduit le volume de
changements à décoder, mais **ne divise pas le coût par trois** : le poller
continuera de tourner à la même cadence pour `parking_reservations`. Le gain réel
est inconnu tant qu'il n'est pas mesuré — c'est précisément l'objet de l'étape 13.
Ne pas annoncer un chiffre avant de l'avoir constaté.

L'implémentation client est irréprochable et ne doit pas servir de bouc émissaire :
les trois canaux patchent le cache par `setQueryData` ligne à ligne, aucun ne
déclenche d'invalidation large. Le coût est entièrement côté serveur.

## Fichier(s) impacté(s)

- `supabase/realtime_reduction_2026-09-20.sql` (nouveau)
- `src/components/pdj/BreakfastBoard.tsx` (modifié : canal retiré, rafraîchissement
  au retour d'onglet)
- `src/components/literie/BabyCotBoard.tsx` (modifié : idem)
- `CLAUDE.md` (modifié : la décision du 2026-09-06 « Realtime conservé partout » est
  révisée)

## Travail à réaliser

### 1. Remplacer les abonnements par un rafraîchissement, AVANT de toucher la base

L'ordre compte : si la publication est retirée d'abord, les deux écrans cessent de
se mettre à jour **sans rien à la place**. On pose d'abord le remplacement, on
retire la publication ensuite.

Le motif existe déjà dans le projet et il est éprouvé —
`DashboardBoard.tsx:258-287`, posé le 2026-09-06 quand l'abonnement mort de
`daily_reports` a été retiré : rafraîchissement au retour d'onglet, temporisation
de 500 ms, écart minimum de 30 s. Le reprendre tel quel plutôt qu'en inventer un
autre.

```ts
// Le temps réel a été retiré de cette table le 2026-09-20 : son poller coûtait
// 71 % du processeur de la base pour deux utilisateurs. On rafraîchit au retour
// d'onglet, avec le même garde-fou que le tableau de bord RepJour.
```

⚠ **Le mode automatique PDJ** (`automode`) coche des chambres en rafale. Vérifier
qu'il n'était pas suspendu par le canal temps réel, et que son garde-fou de
rejet silencieux tient toujours sans lui.

⚠ **`BreakfastBoard` s'abonne par jour** (`pdj-day-${selectedDate}`) : le canal est
recréé à chaque changement de date. C'est autant de souscriptions ouvertes et
fermées — donc autant de travail pour Realtime. Ce point disparaît avec le canal.

### 2. Retirer les deux tables de la publication

```sql
-- realtime_reduction_2026-09-20.sql
-- Symptôme : pages parfois très longues à charger, gels de ~7 s.
-- Cause : le poller WAL de Realtime consomme 71,2 % du CPU (5 865 s / 13,7 j),
--   en continu, même sans utilisateur connecté, pour trois tables publiées.
-- Correctif : ne garder la publication que sur le planning parking, seul écran
--   réellement édité à deux postes en même temps.
-- Innocuité : ALTER PUBLICATION ne touche AUCUNE donnée et se défait en une
--   commande symétrique. Aucune policy, aucune colonne, aucune ligne modifiée.
-- Retour arrière : alter publication supabase_realtime add table public.<table>;
-- Vérification : voir la requête de contrôle en fin de fichier.

alter publication supabase_realtime drop table public.pdj_breakfasts;
alter publication supabase_realtime drop table public.baby_cot_assignments;

-- Contrôle : il ne doit rester que parking_reservations.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;
```

### 3. Mettre à jour la doctrine

`CLAUDE.md` porte « Realtime conservé partout » parmi les décisions explicites de
l'utilisateur à ne pas re-proposer. Cette ligne devient fausse : la corriger, en
datant la révision et en disant pourquoi — sinon une séance future re-publiera les
deux tables en croyant bien faire.

## Ordre d'exécution

1. `BreakfastBoard.tsx` — remplacer le canal par le rafraîchissement.
2. `BabyCotBoard.tsx` — idem.
3. `npx tsc --noEmit`, `pnpm test`, `pnpm lint`, `pnpm build`.
4. Vérifier en navigateur que les deux écrans restent corrects **avant** de
   toucher la base.
5. Écrire et **commiter** `supabase/realtime_reduction_2026-09-20.sql`.
6. **Annoncer** l'application à l'utilisateur, puis
   `supabase db query --linked -f supabase/realtime_reduction_2026-09-20.sql`.
7. Lire la requête de contrôle.
8. Corriger `CLAUDE.md`.

## Critère de validation

- `pg_publication_tables` ne liste plus que `parking_reservations` pour
  `supabase_realtime`.
- Le planning parking se met **toujours** à jour instantanément entre deux
  onglets, glisser-déposer et annulation compris.
- Les coches PDJ et les lits bébé se mettent à jour **au retour sur l'onglet**,
  sans rechargement manuel, et sans rafale de requêtes.
- Le mode automatique PDJ fonctionne comme avant.
- `CLAUDE.md` ne dit plus « Realtime conservé partout ».
- À l'étape 13 : relever la nouvelle part de `realtime.list_changes()` dans le
  processeur, **après remise à zéro de `pg_stat_statements`** — sinon les
  statistiques cumulées d'avant fausseront la comparaison.

## Contrôle qualité (revue)

`/borg` n'étant pas installé, revue manuelle ciblée après exécution :

1. **Le canal parking est intact** : `ParkingBoard.tsx:532` n'a pas été touché, et
   les mises à jour optimistes en vol ne sont toujours pas dérivées du cache.
2. **Aucun `invalidateQueries` large n'a été introduit** en remplacement des
   canaux retirés : le rafraîchissement doit viser la clé du jour, pas tout un
   domaine.
3. **Le garde-fou d'écart minimum tient** : deux allers-retours d'onglet rapprochés
   ne doivent produire qu'une seule relecture.
4. **La commande de retour arrière est écrite dans le fichier SQL** et a été
   relue — c'est ce qui rend la décision réversible en une ligne si l'usage montre
   que le temps réel manquait vraiment sur le PDJ.
5. Vérifier qu'aucune **autre** publication n'a été touchée
   (`supabase_realtime_messages_publication` et ses 7 partitions restent intactes).
