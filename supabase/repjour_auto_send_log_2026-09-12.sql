-- =============================================================================
-- repjour_auto_send_log — la trace des tentatives d'envoi automatique
--
-- Application : `supabase db query --linked -f supabase/repjour_auto_send_log_2026-09-12.sql`
-- Idempotent (`create table if not exists`, policies recréées). Aucune donnée
-- existante touchée, aucune table modifiée : purement additif.
--
-- POURQUOI
--
-- La nuit du 2026-09-12, le rapport journalier n'est pas parti. Le Comparison
-- est arrivé à 00:31:05, le Forecast à 00:31:59, tous deux correctement
-- importés — et rien n'a été envoyé. Il a fallu déduire l'endroit exact de
-- l'arrêt d'un indice indirect : le projeté du mois, que la réservation
-- recalcule juste avant d'envoyer, était resté à sa valeur de la veille
-- (1 492 nuitées au lieu de 1 519). C'est peu pour un diagnostic, et c'est tout
-- ce qu'il y avait : la fonction n'écrivait RIEN quand elle s'abstenait.
--
-- Cette table corrige ce manque. Chaque tentative y laisse sa raison : le cycle
-- concerné, le rapport qui l'a déclenchée, le rang de la tentative, le temps
-- déjà attendu, et le motif exact de l'abstention. Le lendemain matin, la
-- question « pourquoi ça n'est pas parti » a une réponse en base, sans dépendre
-- des journaux Edge, qui s'effacent.
--
-- ÉCRITURE : par la fonction d'import seule (clé service_role, qui contourne la
-- RLS). Aucune policy d'insertion n'est donc accordée à `authenticated` — un
-- compte de l'application ne peut pas fabriquer de fausse trace.
--
-- LECTURE : réservée à la GESTION de la page repjour. C'est un journal
-- d'exploitation, pas une donnée métier ; il n'apporte rien à un lecteur simple
-- et nomme des motifs techniques.
--
-- PURGE : aucune. Quelques lignes par nuit, quelques milliers par an ; la valeur
-- d'un journal est précisément de remonter loin. À revoir si le volume change.
-- =============================================================================

create table if not exists public.repjour_auto_send_log (
  id            bigserial primary key,
  -- Jour hôtelier (bascule 02h) du cycle concerné. Permet de regrouper les
  -- tentatives d'une même nuit, quelle que soit l'invocation qui les a émises.
  cycle_date    date        not null,
  -- Rapport dont l'import a ouvert cette attente : 'comparison' ou 'forecast'.
  -- On saura ainsi laquelle des deux invocations a fini par envoyer — ou si
  -- l'une d'elles n'a jamais rien tenté.
  trigger_report text       not null,
  -- Rang de la tentative dans cette attente (1 = immédiate).
  attempt       integer     not null,
  -- Secondes écoulées depuis le début de l'attente. C'est ce chiffre qui dira
  -- si la patience est bien dimensionnée face aux écarts réels d'arrivée.
  waited_seconds integer    not null default 0,
  -- L'envoi a-t-il eu lieu à cette tentative ?
  sent          boolean     not null default false,
  -- L'abstention était-elle transitoire (attendre avait un sens) ?
  retryable     boolean     not null default false,
  -- Motif exact, en clair.
  note          text        not null,
  created_at    timestamptz not null default now()
);

comment on table public.repjour_auto_send_log is
  'Journal des tentatives d''envoi automatique du rapport journalier. Écrit par la fonction import-report (service_role) ; lu en gestion repjour. Créé après la nuit du 2026-09-12, où aucune trace n''existait.';

-- Lecture par cycle, du plus récent au plus ancien : la question posée est
-- toujours « que s'est-il passé cette nuit ».
create index if not exists repjour_auto_send_log_cycle_idx
  on public.repjour_auto_send_log (cycle_date desc, created_at desc);

alter table public.repjour_auto_send_log enable row level security;

-- Aucun privilège à anon (règle du projet). `authenticated` ne reçoit que le
-- SELECT : ni insert, ni update, ni delete — le journal est inaltérable depuis
-- l'application, comme audit_log.
revoke all on public.repjour_auto_send_log from anon;
revoke all on public.repjour_auto_send_log from authenticated;
grant select on public.repjour_auto_send_log to authenticated;
-- La séquence n'est utilisée que par service_role ; ne pas l'exposer.
revoke all on sequence public.repjour_auto_send_log_id_seq from anon;
revoke all on sequence public.repjour_auto_send_log_id_seq from authenticated;

drop policy if exists "repjour_auto_send_log read (repjour:gestion)"
  on public.repjour_auto_send_log;
create policy "repjour_auto_send_log read (repjour:gestion)"
  on public.repjour_auto_send_log
  for select to authenticated
  using ((select private.page_level_rank(private.get_page_level('repjour'))) >= 3);

-- =============================================================================
-- VÉRIFICATION (lecture seule)
-- =============================================================================
select 'table creee' as controle,
       count(*)::text as valeur
from information_schema.tables
where table_schema = 'public' and table_name = 'repjour_auto_send_log'
union all
select 'RLS activee (attendu true)',
       coalesce((select relrowsecurity::text from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'repjour_auto_send_log'), 'NON')
union all
select 'policies (attendu 1, en SELECT seul)',
       count(*)::text
from pg_policy p join pg_class c on c.oid = p.polrelid
where c.relname = 'repjour_auto_send_log'
union all
select 'droits anon (attendu 0)',
       count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'repjour_auto_send_log'
  and grantee = 'anon'
union all
select 'droits authenticated hors SELECT (attendu 0)',
       count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'repjour_auto_send_log'
  and grantee = 'authenticated' and privilege_type <> 'SELECT'
union all
select 'index de lecture par cycle (attendu 1)',
       count(*)::text
from pg_indexes
where schemaname = 'public' and indexname = 'repjour_auto_send_log_cycle_idx';
