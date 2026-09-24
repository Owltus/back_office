# Panne Supabase du 2026-09-24 — post-mortem

## Résumé en cinq lignes

Le matin du 2026-09-24, toute la couche de service du projet Supabase est
tombée : PostgREST en boucle de redémarrage, Auth à 100 % d'échecs, Storage et
pooler muets. **Postgres lui-même tournait**, mais n'exécutait plus les
requêtes. Un redémarrage du projet, déclenché par l'utilisateur à **09:04:39
UTC**, a tout rétabli en trois minutes.

Les logs du Worker Cloudflare, consultés APRÈS la première version de ce
document, ont livré la chronologie à la seconde (section 1bis) : la base a
basculé **en trente secondes**, et elle avait déjà vacillé **la veille au
soir**, avant de se rétablir seule. Cette découverte **affaiblit l'hypothèse
du préchauffage** que ce document tenait pour la plus vraisemblable — voir la
révision en section 4.

La cause première n'est **pas établie**, et ce post-mortem explique aussi
pourquoi elle ne le sera peut-être jamais.

Toutes les heures de ce document sont en **UTC**. L'heure locale (Paris) est
UTC+2.

---

## 1. Chronologie mesurée

| Heure (UTC) | Fait | Source |
|---|---|---|
| 23/09 12:16 | `1f64e2c` — préchauffage Cloudflare déployé, **3 requêtes** par déclenchement | git |
| 23/09 18:25 | `a7fe87f` — préchauffage **en rafale : 7 requêtes** par déclenchement (×2,33) | git |
| 24/09 ~08:16 | PostgREST redémarre, cache de schéma interrogé en **6 394 ms** | logs PostgREST |
| 24/09 08:18:10 | `Warp server error: Thread killed by timeout manager` | logs PostgREST |
| 24/09 08:18:27-37 | Trois redémarrages en dix secondes, cinq `NOTIFY pgrst` la même seconde | logs PostgREST |
| 24/09 après 08:18 | **PostgREST ne journalise plus rien** | logs PostgREST |
| 24/09 ~08:50 | Sondes externes : REST sur table **sans réponse à 25 s**, Auth **504 en 5,09 s**, Storage sans réponse, CLI `connection timeout` | curl |
| 24/09 ~08:50 | REST **racine** : `401` en **98 ms** ; Edge Function `405` en 1,08 s ; app Vercel `200` | curl |
| 24/09 ~08:55 | Dashboard : **0 requête, 0 % de succès** sur 60 minutes ; `Database not usable — connection established in 24ms but the diagnostic query failed: Query read timeout` | dashboard |
| **24/09 09:04:39** | **Redémarrage du projet** (action utilisateur) | `pg_postmaster_start_time()` |
| 24/09 09:08:18 | Première vraie lecture via Auth : **7,32 s** (démarrage à froid) | curl |
| 24/09 09:11:25 | Mêmes lectures : **0,19 / 0,12 / 0,09 s** | curl |
| 24/09 09:14-09:18 | Stable : 0,25 s puis 0,48 s | curl |

Rampe de chauffe relevée juste après le redémarrage, conforme à celle déjà
documentée dans `CLAUDE.md` : **2,18 → 1,64 → 1,02 → 0,55 → 0,22 → 0,13 →
0,17 → 0,16 s**.

---

## 1bis. La chronologie à la seconde, par les logs du Worker

Le Worker Cloudflare journalise l'issue de chacun de ses tirs
(`[observability] enabled = true`). C'est un **relevé minute par minute de la
santé de la base, vu de l'extérieur**, et il survit au redémarrage. Filtre sur
`ECHEC` : **47 événements sur 24 h, en DEUX épisodes seulement.**

Heures locales (UTC+2), telles que le dashboard Cloudflare les rend.

### Épisode 1 — le 23/09 au soir, la base vacille puis se rattrape SEULE

```
22:53:28  rafale1=[302, 291, 312 ms]          rafale2=[11326 ms, 6230 ms, ECHEC]
22:54:50  rafale1=[13892 ms, ECHEC, ECHEC]    rafale2=[5697, 3189, 1519 ms]
22:56:41  rafale1=[ECHEC, 12060, 11276 ms]    rafale2=[2371, 2087, 1833 ms]
23:16:05  rafale1=[5850, 4749, 13802 ms]      rafale2=[ECHEC, ECHEC, 9894 ms]
23:16:38  rafale1=[ECHEC, ECHEC, 7977 ms]     rafale2=[440, 331, 322 ms]   <- rétablie
```

**Vingt-trois minutes de dégradation sévère, puis retour à la normale sans
aucune intervention.** Personne n'a rien vu : le Worker avale ses erreurs.

### Épisode 2 — le 24/09 au matin, la base ne se rattrape pas

```
10:24:41  rafale1=[317, 281, 284 ms]  gotrue=200 en 330 ms
          rafale2=[ECHEC, ECHEC, ECHEC]                    <- BASCULEMENT
10:26:30  tout en ECHEC              gotrue=504 en 5236 ms
   ...    identique chaque minute
11:04:39  REDÉMARRAGE DU PROJET (action utilisateur)
11:05:11  rafale1=[ECHEC, 521 en 264 ms, 521 en 252 ms]    <- reprise
11:08:18  première vraie lecture Auth : 7,32 s
11:11:25  0,19 / 0,12 / 0,09 s                             <- normal
```

**Le basculement tient en trente secondes** : entre la première et la seconde
rafale du MÊME passage, la base passe de 280 ms à l'expiration complète.

### Ce que cette chronologie établit

| Fait | Conséquence |
|---|---|
| Aucun `ECHEC` entre le déploiement de 18:25 et 22:53 | **4 h 28 de fonctionnement parfait** sous la charge nouvelle |
| Aucun `ECHEC` entre 06:00 et 10:24 le 24/09 | **4 h 24 de fonctionnement parfait** sous la MÊME charge |
| Deux épisodes abrupts, séparés de ~11 h | ce n'est pas une dérive progressive |
| Le premier se résout seul en 23 min | le système sait se rétablir… quand on le laisse |
| `gotrue=504 en 5,2 s`, systématiquement | la passerelle coupe à ~5,2 s — d'où les 504 mesurés |
| `ECHEC apres 15000 ms (TimeoutError)` | PostgREST n'a jamais répondu, même partiellement |

---

## 2. Le symptôme, correctement énoncé

Le dashboard le formule mieux que je ne l'avais fait : **« The database is
reachable but not serving queries »** — connexion établie en 24 ms, requête de
diagnostic expirée.

Autrement dit : Postgres acceptait les connexions, écrivait ses checkpoints,
et **répondait même à certaines requêtes** — mais pas à celles qui lisent des
données.

### Le piège qui m'a fait conclure trop vite, deux fois

J'ai d'abord écrit « la base va bien », sur la foi de deux signaux qui ne
prouvaient rien :

1. **Les `permission denied` revenaient vite.** Un refus de permission est
   tranché à l'analyse de la requête, **avant tout accès aux données**. Une
   base incapable de lire peut refuser instantanément.
2. **`/auth/v1/health` répondait `200` en 100 ms.** Cet endpoint ne touche pas
   la base.

**RÈGLE À RETENIR : seule une requête qui LIT DES DONNÉES prouve qu'une base
sert.** La sonde valable, sans identifiants, est un `POST
/auth/v1/token?grant_type=password` avec une adresse volontairement
inexistante : GoTrue doit chercher dans `auth.users` et répondre
`400 invalid_credentials`. C'est cette sonde, et elle seule, qui a montré
7,32 s puis 0,09 s.

C'est la même famille d'erreur que le `pg_stat_statements` aveugle du
2026-09-23 : **l'instrument répondait, mais il ne mesurait pas ce qu'on
croyait.**

---

## 3. Ce qui est ÉLIMINÉ (vérifié en base après rétablissement)

| Piste | Verdict | Preuve |
|---|---|---|
| Disque plein / base trop grosse | **Non** | base = **27 Mo** |
| Gonflement de tables | **Non** | `auth.refresh_tokens` : 401 vivantes, 13 mortes, autovacuum à 05:06 |
| Verrous / transactions bloquées | **Non** | 0 `idle in transaction`, 0 deadlock, 1 requête active |
| Slot de réplication bloqué | **Non** | 616 **octets** de retard, `wal_status = reserved`, 528 Mo de marge |
| WAL accumulé | **Non** | 128 Mo, 9 fichiers |
| Index manquant/invalide | **Non** | les 4 index de `pdj_breakfasts` présents et valides |
| CTE récursive du 22/09 qui boucle | **Non** | terminaison prouvée (garde `is not null`, `>` strict, `date not null`) |
| Job `pg_cron` de purge | **Non** | `cron.job` **n'existe pas** — pg_cron n'est pas installé |
| Planificateur caché | **Non** | balayage exhaustif du dépôt : aucune source hors Worker Cloudflare |
| Incident de plateforme Supabase | **Non** | seul incident ouvert : Storage de projets restaurés, mineur |
| Fichiers temporaires / tri sur disque | **Non** | `temp_files = 0` |

---

## 4. Ce qui RESTE, en hypothèse

### H1 — Le préchauffage empêche la base de se rétablir

**Ce n'est probablement pas l'allumette, mais c'est le courant d'air.**

`cloudflare/wrangler.toml:60` :

```toml
crons = ["*/2 0-4 * * *", "* 4-22 * * *"]
```

| Plage UTC | Sollicitation |
|---|---|
| 00:00 – 04:59 | veille du rapport, toutes les 2 min |
| 04:00 – 22:59 | **préchauffage, toutes les minutes** |
| **23:00 – 23:59** | **rien** |

**Une heure de repos par 24 heures.** Or `CLAUDE.md` établit, mesure à
l'appui : *« le budget d'entrées-sorties se consomme sous charge soutenue et
ne se recharge qu'au repos… retour à 0,16 s après moins de deux minutes sans
aucune sollicitation »*. Chaque invocation du préchauffage vit **au moins
30 s** (pause entre ses deux rafales) et la suivante part 60 s après : la
fenêtre de deux minutes est **structurellement impossible**.

Aggravant, le dispositif n'a **aucun disjoncteur** : 15 s de délai par tir,
tirs séquentiels, soit jusqu'à `3×15 + 15 + 30 + 3×15 = 135 s` par invocation
sur une base malade — pour une minuterie à 60 s. **Les invocations se
chevauchent, et la pression augmente à mesure que la base souffre.** C'est une
contre-réaction positive. Elle explique aussi pourquoi un redémarrage du
projet ne suffisait pas : la minuterie est extérieure à Supabase et repart
dans la minute.

**Chronologie :** le volume a été multiplié par 2,33 le 23/09 à 18:25, soit
environ **quatorze heures** avant les premiers symptômes.

**Statut : hypothèse AFFAIBLIE — révision du 2026-09-24, après lecture des
logs du Worker.**

Les logs (section 1bis) contredisent frontalement la version « le préchauffage
ne laisse pas la base se reposer, donc elle s'épuise » :

- **4 h 28 de fonctionnement parfait** entre le déploiement de 18:25 et le
  premier incident de 22:53, sous la charge nouvelle ;
- **4 h 24 de fonctionnement parfait** le lendemain entre 06:00 et 10:24, sous
  exactement la même charge ;
- deux basculements **abrupts** (30 secondes), séparés de onze heures, sans
  aucune dérive progressive entre les deux.

Une privation de repos produirait une dégradation **graduelle**, pas des
basculements nets encadrés d'heures parfaites. **Le préchauffage n'est donc
pas la cause.**

Ce qu'il reste de l'hypothèse, et qui tient toujours :

1. **Il empêche la guérison.** L'épisode du 23/09 au soir s'est résolu seul en
   23 minutes ; celui du 24/09 au matin ne s'est jamais résolu en 40 minutes.
   La différence de comportement reste inexpliquée, mais une sollicitation qui
   repart toutes les 60 s, avec des invocations qui se chevauchent dès que la
   base ralentit, est un candidat sérieux pour expliquer pourquoi le second
   n'a pas guéri.
2. **Il aggrave sous stress.** 135 s d'exécution possible pour une minuterie à
   60 s, sans disjoncteur ni backoff : la pression AUGMENTE quand la base
   souffre. C'est un défaut de conception indépendamment de cette panne.

**Correction de méthode à retenir** : j'ai proposé de couper le préchauffage
en présentant la corrélation temporelle (« ×2,33 six heures avant ») comme
accablante. Les logs, que je n'avais pas encore lus, montrent que la charge
nouvelle a tourné plus de quatre heures sans le moindre incident. **La
corrélation était réelle, l'inférence était trop rapide.**

### H2 — La tempête `NOTIFY pgrst` côté Supabase

Cinq messages `Received a schema cache reload message on the "pgrst" channel`
à la même seconde, suivis de rechargements de catalogue à 1,2 s, 2,0 s puis
6,4 s. Le mécanisme est déjà documenté dans ce dépôt
(`plan/perf-chargement-2026-09-20/15-controle-adverse-2026-09-21.md`) :
l'event trigger `extensions.pgrst_ddl_watch`, fourni par Supabase, se
déclenche sur tout DDL, y compris les `ALTER TABLE … OWNER TO` que le
mainteneur de partitions de `realtime.messages` rejoue périodiquement.

**Hors de notre portée** : `must be owner of event trigger pgrst_ddl_watch`.
Aucun objet de notre dépôt n'émet de `NOTIFY`, et il n'y a **aucun event
trigger de notre fait**.

---

## 5. L'erreur de méthode — et c'est la leçon la plus chère

**Nous avons redémarré avant de capturer quoi que ce soit.**

`pg_postmaster_start_time()` le confirme : le redémarrage a relancé Postgres
lui-même à 09:04:39, ce qui a **remis à zéro tous les compteurs**
(`pg_stat_database`, `pg_stat_statements`, `pg_stat_activity`). L'état que
j'ai pu inspecter ensuite est celui d'une base fraîche : 100 % de cache, 4 645
blocs lus, zéro verrou. **Rigoureusement inexploitable pour comprendre la
panne.**

Ce qu'il aurait fallu capturer AVANT de redémarrer, et qui tient en quatre
requêtes :

```sql
-- 1. qui occupe la base, et depuis quand
select pid, usename, application_name, state,
       round(extract(epoch from (now()-xact_start)))::int as tx_s,
       round(extract(epoch from (now()-query_start)))::int as req_s,
       wait_event_type, wait_event, left(query,200)
from pg_stat_activity where pid <> pg_backend_pid() order by xact_start nulls last;

-- 2. qui bloque qui
select pid, pg_blocking_pids(pid) as bloque_par, left(query,120)
from pg_stat_activity where cardinality(pg_blocking_pids(pid)) > 0;

-- 3. ce qui coûte le plus depuis le dernier reset
select calls, round(total_exec_time)::int as total_ms, round(mean_exec_time)::int as moy_ms,
       round(stddev_exec_time)::int as ecart_ms, left(query,150)
from pg_stat_statements order by total_exec_time desc limit 15;

-- 4. lecture disque vs cache
select blks_read, blks_hit, round(100.0*blks_hit/nullif(blks_hit+blks_read,0),2) as pct_cache,
       temp_files, pg_size_pretty(temp_bytes) as temp, deadlocks, stats_reset
from pg_stat_database where datname = current_database();
```

⚠ Si la base ne répond plus du tout, ces requêtes n'aboutiront pas non plus —
mais il faut **essayer d'abord**, parce qu'une base « qui ne sert pas les
requêtes » a justement de bonnes chances de répondre à une lecture de
`pg_stat_activity`, qui est purement en mémoire. C'est exactement ce qui s'est
vérifié ici : le CLI a échoué pendant la panne, mais sur la création du rôle de
connexion, pas sur la requête — un chemin qu'on aurait pu contourner.

---

## 6. Le vrai danger : personne ne l'aurait vu un samedi

C'est le point que l'utilisateur a soulevé, et c'est le plus important du
document.

**La panne a été détectée parce qu'un humain a ouvert l'application.** Il
n'existe aujourd'hui :

- **aucune alerte** — ni e-mail, ni notification, rien ;
- **aucune sonde qui lise vraiment des données** (le préchauffage ne fait que
  des refus de permission, il aurait continué à « réussir » sans rien voir) ;
- **aucun rétablissement automatique.**

Un vendredi soir, l'hôtel serait resté sans application **jusqu'au lundi**, et
la veille nocturne du rapport journalier (02h-06h) aurait échoué deux nuits de
suite en silence.

**Et le préchauffage, tel qu'il est écrit, avale ses erreurs par conception**
(`stayntouch_in_to_supabase.js:192-196`, commentaire : « sans conséquence pour
l'application »). Il a probablement observé la panne minute par minute sans
en dire un mot à personne. Ses logs sont retenus (`[observability] enabled =
true`) : **ils contiennent l'heure exacte du basculement**, consultables sur
le dashboard Cloudflare.

---

## 7. Ce qu'il faut faire, par ordre de valeur

### P0 — Détecter (c'est le manque le plus grave)

Le Worker Cloudflare tourne déjà toutes les minutes et parle déjà à Supabase.
Il lui manque trois choses :

1. **Une sonde qui lit vraiment.** Remplacer (ou compléter) le ping en refus
   de permission par un appel qui force une lecture — par exemple le
   `POST /auth/v1/token` à identifiants inexistants, dont un `400
   invalid_credentials` prouve que la base sert, et dont un `504` ou un délai
   dépassé prouve le contraire.
2. **Un compteur d'échecs consécutifs**, et une alerte au-delà d'un seuil
   (3 échecs de suite = 3 minutes). L'infrastructure d'envoi existe déjà :
   Resend, via l'Edge Function `send-report`.
3. **Ne plus avaler les erreurs en silence.**

### P1 — Rendre le repos possible

Ramener le préchauffage à une cadence qui laisse respirer la base : **un tir
toutes les 10 minutes** au lieu de sept par minute. Le gain de démarrage à
froid mesuré (1 398 → 394 ms) se conserve pour l'essentiel, et la fenêtre de
deux minutes redevient possible. Retour arrière en une ligne.

⚠ Rappel du 13/09 : `wrangler deploy` seul n'actualise pas toujours le
planificateur — faire **aussi** `wrangler triggers deploy`, et **constater** un
déclenchement réel.

### P2 — Capturer avant de redémarrer

Faire du bloc SQL de la section 5 un fichier prêt à l'emploi
(`supabase/diagnostic_panne.sql`), à jouer en premier réflexe. Le redémarrage
efface les preuves : il doit venir **après**.

### P3 — Ce qu'on ne fera pas

**Pas de redémarrage automatique.** Une boucle qui redémarre une base de
production sans humain dans la boucle est plus dangereuse que la panne
qu'elle prétend corriger.

---

## 8. Ce que ce document n'établit pas

- ~~L'heure exacte du basculement~~ → **ÉTABLIE** par les logs du Worker :
  24/09 **10:24:41 local** (08:24:41 UTC), entre deux rafales du même passage.
  Et un précurseur la veille, 22:53 → 23:16, résolu seul.
- **La cause première.** Toujours pas établie, et les logs ont éliminé
  l'explication « privation de repos » qui paraissait la meilleure.
- **Pourquoi le premier épisode a guéri seul et pas le second.** C'est
  désormais LA question ouverte la plus intéressante.
- **Ce qui déclenche un basculement en trente secondes** sur une base de 27 Mo
  au repos, avec 100 % de cache. Un évènement côté plateforme (rechargement de
  catalogue PostgREST, migration, relocalisation d'instance) reste le candidat
  le plus cohérent avec cette soudaineté — mais rien ne le prouve.

Ce sont des inconnues assumées, pas des trous comblés par une hypothèse
commode.
