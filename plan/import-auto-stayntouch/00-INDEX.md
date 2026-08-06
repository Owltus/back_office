# Plan — Import automatique des rapports StayNTouch par e-mail

## Contexte

Aujourd'hui, les rapports du PMS **StayNTouch** sont importés **à la main** (dépôt
de CSV dans RepJour et PDJ). Objectif : **tout automatiser**. Le PMS enverra ses
rapports par e-mail à `backoffice@naostack.com` ; un pipeline les importe seul,
sans intervention humaine.

Chaîne cible :

```
PMS StayNTouch ─email(CSV)─▶ Cloudflare (Email Routing)
                                   │  règle → Worker
                                   ▼
                      Worker « stayntouch_in_to_supabase »  (le facteur)
                                   │  vérifie l'expéditeur + relaie l'email brut
                                   ▼
                      Edge Function Supabase « import-report »  (le robot)
                                   │  extrait le CSV, détecte le type,
                                   │  valide, écrit en base
                                   ▼
              daily_reports / pms_daily_metrics / forecast_days / pdj_breakfasts
                                   │
                                   ▼
                         l'app affiche (déjà en temps réel)
```

Principe directeur : **ne rien casser de l'existant**. L'import manuel reste
**strictement inchangé** ; le pipeline automatique s'ajoute **à côté**.

## Décisions tranchées (validées par l'utilisateur)

- **Import manuel intact** : on n'y touche pas, l'auto est purement additif.
- **Identité** : les imports auto sont estampillés **« importé par StayNTouch »**
  (compte/identité système dédié, UUID fixe pour `imported_by`).
- **Code** : on **COPIE le cœur** (parsing + validation) dans l'Edge Function
  (déploiement Deno séparé). Pas de refonte partagée avec l'app (zéro risque sur
  l'existant ; petite duplication à garder en phase si les règles changent).
- **Format d'envoi** : **3 e-mails séparés, 1 CSV chacun** (Comparison, Forecast,
  In-House Guests). D'**autres rapports viendront ensuite** → détection des types
  **extensible**.
- **Sécurité en 2 couches** : le Worker n'accepte que l'expéditeur dont le domaine
  contient `stayntouch` ; l'Edge Function n'accepte que les appels portant le
  **secret partagé** (`X-Import-Secret`).
- **Idempotence** : on réutilise les clés d'upsert existantes (ré-import = écrase,
  jamais de doublon) — `daily_reports(date)`, `pms_daily_metrics(report_date,
  line_no)` + purge, `forecast_days(date)`, `pdj_breakfasts(service_date, room)`.

## Les 3 rapports et leurs cibles

| Rapport StayNTouch | Feature | Table(s) | Clé d'upsert | Particularités |
|---|---|---|---|---|
| **Comparison By Date** (réalisé) | RepJour | `daily_reports` + `pms_daily_metrics` | `date` / `(report_date,line_no)` | date du **nom de fichier − 1 jour** (J-1) ; ligne VAT ; purge lignes excédentaires |
| **Forecast By Date Range** (projeté) | RepJour | `forecast_days` | `date` | dates lues dans le CSV ; REV = TTC ; détection « forecast en HT » via référence TTC (réalisé) |
| **In-House Guests** (présents) | PDJ | `pdj_breakfasts` | `(service_date, room)` | date = nom de fichier ; règle « départ anticipé » ; **RGPD** : nom gardé J-0/J-1 seulement |

## Angles à clarifier (à trancher pendant l'exécution)

- **`imported_by` = FK** (vers `profiles`/`auth.users`) : un UUID inexistant
  violerait la contrainte. Il faut donc **créer une vraie ligne système** (profil
  « StayNTouch ») pour porter cet UUID — voir Étape 1. Pour `pms_daily_metrics`,
  `imported_by` est posé par un **trigger `auth.uid()`** : en service_role
  `auth.uid()` est NULL → il faudra soit adapter (colonne nullable / valeur
  explicite), soit écrire cette table en contournant le trigger. À trancher Étape 3.
- **1 e-mail = 1 CSV** aujourd'hui, mais la fonction sera écrite pour gérer **1..N
  pièces jointes** (robustesse + rapports futurs).
- **Fuseau horaire** : les règles J-1 (Comparison) et fenêtre RGPD (PDJ) dépendent
  du jour Europe/Paris. L'Edge Function tourne en UTC → figer le fuseau explicitement.
- **Sous-domaine** : l'adresse sera `backoffice@naostack.com` (racine), Cloudflare
  Email Routing ne gère pas les sous-domaines. Déjà acté côté utilisateur.

## Phases

| # | Fichier | Phase | Qui | Dépend de | Effort | Livrable | Critique |
|---|---------|-------|-----|-----------|--------|----------|----------|
| 1 | [1-sql-identite-stayntouch.md](./1-sql-identite-stayntouch.md) | Identité système « StayNTouch » | TOI (SQL fourni par MOI) | — | 20 min | UUID système pour `imported_by` | ⚠ |
| 2 | [2-edge-squelette-securite-mime.md](./2-edge-squelette-securite-mime.md) | Edge Function : squelette, secret, extraction du CSV, détection du type | MOI | — | 2 h | `import-report` reçoit un email, en sort le bon CSV | |
| 3 | [3-edge-repjour-comparison-forecast.md](./3-edge-repjour-comparison-forecast.md) | Cœur RepJour porté (Comparison + Forecast) | MOI | 1,2 | 4 h | Import auto de `daily_reports`/`pms_daily_metrics`/`forecast_days` | ⚠ |
| 4 | [4-edge-pdj-inhouse.md](./4-edge-pdj-inhouse.md) | Cœur PDJ porté (In-House Guests) | MOI | 1,2 | 3 h | Import auto de `pdj_breakfasts` (RGPD, départ anticipé) | ⚠ |
| 5 | [5-worker-cloudflare.md](./5-worker-cloudflare.md) | Worker Cloudflare finalisé | MOI (code) | 2 | 30 min | `stayntouch_in_to_supabase` prêt à déployer | |
| 6 | [6-deploiement-cloudflare-secrets.md](./6-deploiement-cloudflare-secrets.md) | Secrets + déploiement + branchement Cloudflare | TOI (guidé) | 1-5 | 30 min | Pipeline en ligne | ⚠ |
| 7 | [7-test-bout-en-bout.md](./7-test-bout-en-bout.md) | Test réel + garde-fous | TOI + MOI | 6 | 1 h | Un vrai rapport importé, idempotence + sécurité vérifiées | ⚠ |

## Ordre d'exécution

Séquentiel côté MOI : Étape 1 (l'UUID système débloque 3 et 4) → Étape 2
(fondation de la fonction) → Étapes 3 et 4 (les deux cœurs, indépendants l'un de
l'autre) → Étape 5 (Worker). Puis TOI : Étape 6 (déploiement) → Étape 7 (test).
Les Étapes 1 et 6 sont à exécuter par toi (SQL + config), je te guide.

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| SQL | — | `supabase/stayntouch_system_identity.sql` |
| Edge Function | — | `supabase/functions/import-report/index.ts` (+ modules portés) |
| Worker Cloudflare | `cloudflare/stayntouch_in_to_supabase.js` (finalisation) | — |
| Import manuel (app) | **AUCUN — intouché** | — |

| **Total** | **1 modifié (worker)** | **2+ nouveaux** |
