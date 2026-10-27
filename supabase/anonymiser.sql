-- =====================================================================
-- ANONYMISATION d'une copie de la prod — BASE LOCALE SEULEMENT
-- =====================================================================
-- Joué par `copier-prod` (plan environnement-dev-docker-2026-10-12, étape 14,
-- D22), juste après le chargement des données de la prod dans la base
-- locale. JAMAIS en prod : il réécrit des données réelles. `copier-prod` ne
-- le joue qu'avec `--local`, et le hook garde-prod refuse toute commande qui
-- viserait la prod.
--
-- Colonnes : inventaire du catalogue (releve-prod.md, rubrique 8).
--   - Noms de clients → « Client n », le MÊME n pour le même nom (casse et
--     espaces ignorés) dans toutes les tables : un client qui revient garde
--     son numéro, les regroupements restent justes. Ordre des numéros tiré
--     d'une empreinte, pas de l'ordre alphabétique (qui trahirait les
--     initiales).
--   - Commentaires libres → '' (colonnes NOT NULL).
--   - baby_cot_assignments.label : texte libre ; gardé s'il n'est qu'un
--     numéro de chambre, sinon traité comme un nom.
--   - audit_log.old_data : ces clés (et `company`) sont retirées des copies
--     de lignes, à la racine et dans les copies `old` / `new` d'un UPDATE.
-- Conservé : personnel (profiles, auteurs), sociétés (pdj.company, sauf
-- égale au nom), adresses des destinataires du rapport (e-mails locaux →
-- Mailpit, D12), contenu des classeurs (documents internes, PAS des données
-- de client), textes d'affichage, apprentissage de facturation hors mots.
-- Planning du staff (tables `planning_*`) : copié TEL QUEL, vrais noms et
-- prénoms, contrats, absences, shifts (décision utilisateur du 2026-10-27 :
-- « garde les vrais noms, sinon c'est confusant »). Ce fichier ne doit
-- jamais toucher une table `planning_*` (`copier-prod-plan.test.ts`).
--
-- `copier-prod` retire les lignes `begin;` et `commit;` de ce fichier pour le
-- jouer DANS la transaction du chargement : un échec ici annule aussi le
-- chargement, jamais de vrais noms laissés en local.
-- =====================================================================

begin;

-- Les triggers d'estampillage et les gardes de fenêtre de dates ne doivent
-- rien réécrire ni refuser : ce n'est pas une saisie.
set local session_replication_role = replica;

-- Société = nom du client (réservation d'un particulier) : vidée AVANT que
-- le nom ne soit remplacé (revue adverse du 2026-10-13).
update public.pdj_breakfasts
set company = null
where company is not null and lower(btrim(company)) = lower(btrim(guest_name));

-- Mots extraits des factures PDF (`lib/facturation/wordpool.ts` : « nom du
-- fournisseur, du client… ») : vidés, le jeu de mots se réapprend.
delete from public.facturation_wordpool;

-- Comptes copiés (D23) : les jetons à usage unique de la prod ne viennent
-- pas avec (récupération, confirmation, changement d'adresse).
update auth.users
set confirmation_token = '', recovery_token = '', email_change_token_new = '',
    email_change_token_current = '', phone_change_token = '',
    reauthentication_token = '', email_change = '';

-- Numérotation : ordre tiré d'une empreinte SALÉE à chaque copie, pour qu'on
-- ne puisse pas retrouver un client à partir d'une liste de noms.
create temp table sel on commit drop as select gen_random_uuid()::text as s;

create temp table noms_clients on commit drop as
select cle, row_number() over (order by md5(cle || (select s from sel))) as n
from (
  select lower(btrim(guest_name)) as cle from public.pdj_breakfasts
  union
  select lower(btrim(client)) from public.parking_reservations
  union
  select lower(btrim(label)) from public.baby_cot_assignments
  where btrim(label) !~ '^[0-9]{1,4}$'
) s
where cle is not null and cle <> '';

update public.pdj_breakfasts b
set guest_name = 'Client ' || n.n
from noms_clients n
where lower(btrim(b.guest_name)) = n.cle;

update public.parking_reservations p
set client = 'Client ' || n.n, comment = ''
from noms_clients n
where lower(btrim(p.client)) = n.cle;
update public.parking_reservations set comment = '' where comment <> '';

update public.baby_cot_assignments a
set label = 'Client ' || n.n
from noms_clients n
where lower(btrim(a.label)) = n.cle;
update public.baby_cot_assignments set comment = '' where comment <> '';

update public.caisse_cautions set comment = '' where comment <> '';
update public.caisse_sheets set comment = '' where comment <> '';
update public.literie_sheets set comment = '' where comment <> '';
update public.rapro_sheets set comment = '' where comment <> '';

-- Copies de lignes du journal : les clés nominatives sont retirées à la
-- racine (INSERT, DELETE) ET dans les copies `old` / `new` d'un UPDATE
-- (`private.log_row_change` écrit {old, new}). `company` aussi (audit du
-- 2026-10-17) : la société d'un particulier est son nom, et la copie du
-- journal n'a pas été vidée comme pdj_breakfasts.company plus haut.
update public.audit_log
set old_data = (old_data - array['guest_name', 'client', 'comment', 'label', 'company'])
  || case when jsonb_typeof(old_data -> 'old') = 'object'
       then jsonb_build_object('old', (old_data -> 'old') - array['guest_name', 'client', 'comment', 'label', 'company'])
       else '{}'::jsonb end
  || case when jsonb_typeof(old_data -> 'new') = 'object'
       then jsonb_build_object('new', (old_data -> 'new') - array['guest_name', 'client', 'comment', 'label', 'company'])
       else '{}'::jsonb end
where jsonb_typeof(old_data) = 'object'
  and (old_data ?| array['guest_name', 'client', 'comment', 'label', 'company']
    or (old_data -> 'old') ?| array['guest_name', 'client', 'comment', 'label', 'company']
    or (old_data -> 'new') ?| array['guest_name', 'client', 'comment', 'label', 'company']);

-- Contrôle : plus aucun nom hors « Client n », ni aucune clé nominative dans
-- le journal (sinon tout est annulé).
do $$
declare
  restes bigint;
begin
  select
    (select count(*) from public.pdj_breakfasts
      where guest_name is not null and btrim(guest_name) <> '' and guest_name !~ '^Client [0-9]+$')
  + (select count(*) from public.parking_reservations
      where btrim(client) <> '' and client !~ '^Client [0-9]+$')
  + (select count(*) from public.baby_cot_assignments
      where btrim(label) <> '' and label !~ '^Client [0-9]+$' and btrim(label) !~ '^[0-9]{1,4}$')
  + (select count(*) from public.audit_log
      where jsonb_typeof(old_data) = 'object'
        and (old_data ?| array['guest_name', 'client', 'comment', 'label', 'company']
          or (old_data -> 'old') ?| array['guest_name', 'client', 'comment', 'label', 'company']
          or (old_data -> 'new') ?| array['guest_name', 'client', 'comment', 'label', 'company']))
  into restes;
  if restes > 0 then
    raise exception 'Anonymisation incomplète : % nom(s) restant(s)', restes;
  end if;
end $$;

commit;
