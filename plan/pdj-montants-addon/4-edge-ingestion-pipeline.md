# Étape 4 — Edge : ingestion automatique de l'Addon Production

## Objectif

Faire entrer le CSV Addon Production par le pipeline email existant : détecter le nouveau type
dans `import-report`, le parser (miroir Deno du métier), et l'upserter dans `pdj_addon_production`.
Sans jamais déclencher l'auto-envoi RepJour.

## Contexte

Point d'entrée `supabase/functions/import-report/index.ts` : `detectType(filename, content)`
(L62-90) route vers `importComparison` / `importForecast` / `importInhouse`. Le Worker
Cloudflare relaie **tout** email StayNTouch au même endpoint ; **aucun changement Worker ni
`config.toml` requis** (on ajoute du code dans la fonction existante). Le modèle d'importeur
« standalone sans envoi » est `import-report/pdj.ts` (`importInhouse`, upsert `onConflict`,
erreurs Postgres loggées + message neutre, respect de `dryRun`).

Le code Edge est un contexte Deno séparé : il **ne peut pas importer** `src/lib/pdj/addon.ts`.
On écrit donc un parseur Deno jumeau dans `addon.ts` (même logique que l'Étape 2, sans partage
de code — c'est le pattern existant `pdj.ts`↔`csv.ts`).

## Fichier(s) impacté(s)

- `supabase/functions/import-report/addon.ts` (nouveau)
- `supabase/functions/import-report/index.ts` (modifié)

## Travail à réaliser

### 1. `addon.ts` (Deno) — `importAddon`

```ts
export async function importAddon(
  admin: SupabaseClient,
  csv: string,
  filename: string,
  dryRun = false,
): Promise<number>
```
- parser : miroir de l'Étape 2 (`parseAddonProduction`) — détection de la ligne d'en-tête sur
  `Total Count` + `Total Revenue`, date métier **lue du contenu** puis alignée `+1 jour`
  (`service_date = breakfastServiceDate(businessDate)`, Point de correction n°1), filtre
  `isBreakfastCode` (`startsWith('PDJ')`), normalisation `code` upper/trim.
- réutiliser `parseCsvLine` du fichier `pdj.ts` (ou dupliquer la petite fonction) et
  `floatOrNull`/BOM déjà présents côté Edge.
- si la date métier est introuvable → jeter une erreur claire (« date métier introuvable dans le
  CSV Addon Production »).
- mapper en lignes DB `{ service_date, code, total_count, revenue_ttc, source_file: filename }`,
  dédup par `service_date|code` (le dernier gagne), upsert `onConflict: 'service_date,code'`
  par chunks de 1000.
- si `dryRun` : parser/valider **sans** écrire, retourner le nombre de lignes.
- erreurs Postgres **loggées**, message renvoyé **neutre** (comme `pdj.ts:391-395`).
- retour = nombre de lignes upsertées.

### 2. `index.ts` — greffe (3 points)

- **Import** (près de L26) : `import { importAddon } from './addon.ts'`.
- **Type** (L58) : `type ReportType = 'comparison' | 'forecast' | 'inhouse' | 'addon'`.
- **`detectType`** :
  - Étage nom (avant le bloc in-house) : `if (f.includes('addon')) return 'addon'`
    (le nom In-House `_in_house_guests_` ne contient pas « addon » → pas de collision).
  - Étage contenu (avant le test in-house L86) : `if (head.includes('ADDON PRODUCTION')) return 'addon'`.
- **Routage** (ternaire L182-187) : brancher `type === 'addon' ? await importAddon(admin, content, filename, dryRun) : …`.

### 3. Ne PAS toucher à l'auto-envoi

Le bloc `maybeAutoSendRepjour` (L212-237) ne se déclenche que si `touchedRepjour`
(`type === 'comparison' || 'forecast'`). **Ne pas** ajouter `'addon'` à cette condition :
un import Addon ne doit jamais e-mailer de rapport (comme l'In-House aujourd'hui).

## Ordre d'exécution

1. Écrire `addon.ts` (Deno).
2. Greffer les 3 points dans `index.ts`.
3. `deno check` local si dispo (sinon revue manuelle) ; les tests réels se font à l'Étape 6.
4. **Déploiement (par l'utilisateur)** : `supabase functions deploy import-report --no-verify-jwt`
   (piège connu : sans ce flag / `config.toml` figé, le Worker prend un 401 → pipeline mort).

## Critère de validation

- Un CSV nommé `..._addon_production_report_DAILY_...` est détecté `'addon'` et routé vers
  `importAddon` (test à l'Étape 6, en réel ou dry-run).
- Un CSV In-House reste détecté `'inhouse'` (pas de régression sur `detectType`).
- L'auto-envoi RepJour n'est PAS déclenché par un import Addon.
- `dryRun` respecté (aucune écriture quand `IMPORT_DRY_RUN=true`).
