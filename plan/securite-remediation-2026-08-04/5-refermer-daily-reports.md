# Étape 5 — M2 : refermer `daily_reports` en lecture

## Objectif

Un compte ayant la seule permission `rapro` (lecture) peut lire TOUTE la table
`daily_reports` (CA, PM, RevPAR, historique complet) via la policy SELECT
`page:repjour OR page:rapro`. Or /rapro n'a besoin que de l'occupation officielle
(`rj_nuitees`) pour une date. On expose l'occupation via une fonction minimale
`SECURITY DEFINER` et on referme le SELECT de `daily_reports` sur `page:repjour`.

## Contexte

Over-read horizontal : la commodité du `OR page:rapro` (l.52-58 de
`page_permissions_rls_lectures.sql`) fuit tout le reporting financier à un rôle qui
n'y a pas droit. Le patron existe déjà : `rapro_occupancy` (rapro_occupancy_fn.sql)
expose l'occupation In-House sans PII de la même façon.

## Fichier(s) impacté(s)

- `supabase/daily_reports_occ_fn.sql` (nouveau)
- `supabase/page_permissions_rls_lectures.sql`
- `src/lib/rapro/service.ts` (fonction `fetchOfficialOcc` -> appel RPC)

## Travail à réaliser

### 1. Fonction d'occupation minimale (calquée sur `rapro_occupancy`)

```sql
create or replace function public.daily_reports_occ(p_date date)
returns integer
language sql security definer stable set search_path = public
as $$
  select rj_nuitees
  from public.daily_reports
  where date = p_date
    and (select public.page_level_rank(public.get_page_level('rapro'))) >= 1
  limit 1;
$$;

revoke all on function public.daily_reports_occ(date) from public, anon;
grant execute on function public.daily_reports_occ(date) to authenticated;
```

### 2. Refermer le SELECT de `daily_reports` sur `repjour` seul

```sql
drop policy if exists "daily_reports read (page:repjour ou rapro)" on public.daily_reports;
create policy "daily_reports read (page:repjour)"
  on public.daily_reports for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('repjour'))) >= 1);
```

### 3. Adapter le client rapro

Dans `src/lib/rapro/service.ts`, `fetchOfficialOcc` doit appeler la RPC plutôt que
lire la table directement :

```ts
export async function fetchOfficialOcc(date: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('daily_reports_occ', { p_date: date })
  if (error) throw error
  return typeof data === 'number' ? data : null
}
```

## Ordre d'exécution

1. Jouer la fonction `daily_reports_occ` en base.
2. Déployer le client adapté (`fetchOfficialOcc`) AVANT de refermer la policy (sinon
   un compte repjour continue de marcher, mais un compte rapro perdrait l'OCC de
   contrôle le temps du déploiement).
3. Une fois le client en prod, jouer le `drop/create policy` de `daily_reports`.
4. Committer les fichiers.

## Critère de validation

- Compte **rapro-only** (jetable) : `GET /rest/v1/daily_reports?select=*` renvoie 0
  ligne ; l'appel RPC `daily_reports_occ` renvoie bien l'occupation du jour.
- Compte **repjour** : lecture de `daily_reports` intacte ; la page RepJour fonctionne.
- La ligne de contrôle OCC de /rapro s'affiche toujours.

## Contrôle /borg

Auditer : (1) la fonction n'expose QUE `rj_nuitees` (aucune colonne financière) ;
(2) la garde `page:rapro` interne empêche un compte sans droit rapro d'appeler la
RPC utilement ; (3) `search_path` figé ; (4) aucune autre lecture de `daily_reports`
côté rapro/analytique n'a été oubliée (grep `from('daily_reports')`).
