# Étape 11 — Audit final et validation

## Objectif

Vérifier de bout en bout que le port est complet, cohérent, et surtout qu'il respecte la contrainte absolue : deux applications partageant un seul Supabase, aucune migration, aucune modification de schéma, aucune régression de l'app standalone.

## Fichier(s) impacté(s)

- Aucun (lecture seule ; corrections mineures si un point de contrôle échoue)
- Transversal : routes, `routeTree.gen.ts`, services, composants

## Travail à réaliser

### 1. Vérifications automatisées

```bash
npx tsc --noEmit
pnpm lint
pnpm build
```

### 2. Cohérence du portage

- **Re-préfixage des paths** : vérifier qu'aucun path absolu source (`/`, `/login`, `/rapport`, `/admin/*`, `/analytique/...`) ne subsiste ; tout est sous `/repjour/*` et utilise la navigation typée TanStack Router.
- **`ROLE_HOME` unique** : une seule définition (`lib/repjour/roles.ts`), aucune redéfinition.
- **Namespace `/admin/*`** : effondré (D5), gating par rôle dans les composants.
- **`ssr: false`** effectif sur l'îlot (ou gardes client-only si D1=B) ; recharts/html2canvas ne cassent pas.
- **Navigation** : la `Navigation` source n'a pas été portée ; la coquille Back Office + `RepjourNav` la remplacent (D4).

### 3. Contrôle de la contrainte Supabase (le point le plus important)

- Relire le diff complet : **aucun** `CREATE`, `ALTER`, `DROP`, `INSERT` de seed, aucune exécution de fichier `supabase/migrations/*`, aucune modification de policy/trigger.
- Les seules écritures applicatives sont celles de la source : upserts `daily_reports`/`forecast_days`, upload `csv-archive`, CRUD `budget`/`email_recipients`/`profiles`, suppressions gardées. Toutes soumises aux RLS existantes.
- La table `postes` n'a été ni créée ni modifiée (portée seulement si confirmée en lecture — D7).

### 4. Non-régression de l'app standalone

- Confirmer (lecture) que les données restent cohérentes pour l'app standalone qui partage le même Supabase : le port n'a fait qu'appliquer les mêmes opérations qu'elle, jamais de schéma.

### 5. Parcours manuel par rôle

- `utilisateur` : lecture rapport + analytique, aucun accès import/gestion/comptes.
- `super_utilisateur` : + import.
- `admin` : + gestion, budget, email, comptes.

## Ordre d'exécution

1. Vérifications automatisées.
2. Cohérence du portage et re-préfixage.
3. Contrôle de la contrainte Supabase (diff complet).
4. Non-régression standalone.
5. Parcours par rôle.

## Critère de validation

- Les trois commandes passent sans erreur ni warning nouveau.
- Aucun path source résiduel, un seul `ROLE_HOME`, îlot client-only effectif.
- Aucune opération de schéma dans tout le diff ; seules des écritures applicatives soumises RLS.
- Parcours par rôle conforme à la matrice d'accès de la source.

## Contrôle /borg

Étape critique (validation globale de fin de chantier). Audit :

- Contrainte absolue respectée : « deux applications, un seul Supabase, aucune migration » — vérifiée sur le diff entier et par relecture des services.
- Aucune donnée corrompue ou incohérente introduite dans la base partagée.
- L'îlot `/repjour` est correctement isolé (auth, SSR, storageKey) sans effet de bord sur les autres onglets.
- Aucun secret (clé `service_role`) introduit ; seule la clé anon est utilisée, `.env` non commité.
