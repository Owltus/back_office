-- ============================================================================
-- facturation_budget_lines — RÉFÉRENTIEL des imputations comptables (plan analytique OKKO).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- Ré-exécutable : idempotent et PUREMENT ADDITIF (ne détruit jamais de données, seed en
-- `on conflict do nothing` → n'écrase pas d'éventuelles éditions faites via le CRUD).
-- Dépend de : get_user_role() déjà déployée (utilisée par les RPC — voir
-- facturation_budget_lines_rpc.sql). RLS : lecture ouverte aux authentifiés, aucune écriture
-- directe (l'écriture passe uniquement par les RPC SECURITY DEFINER).
--
-- Origine des données : reproduit à l'identique BUDGET_LINES de
-- src/lib/facturation/constants.ts (55 lignes). sort_order = ordre du plan (index).
-- ============================================================================

-- 1) Table -------------------------------------------------------------------
create table if not exists public.facturation_budget_lines (
  code       text primary key,               -- ex. 'FMELECoooo' (casse / 'o' du scan conservés)
  label      text        not null,
  category   text        not null,
  hint       text        not null default '',
  tags       text[]      not null default '{}',
  sort_order int         not null default 0,  -- ordre d'affichage (ordre du plan analytique)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) RLS : lecture authentifiée, aucune policy d'écriture (write = RPC only) --
alter table public.facturation_budget_lines enable row level security;
drop policy if exists "budget_lines read (authenticated)" on public.facturation_budget_lines;
create policy "budget_lines read (authenticated)" on public.facturation_budget_lines
  for select to authenticated using (true);

-- 3) Trigger updated_at ------------------------------------------------------
create or replace function public.facturation_budget_lines_touch()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists facturation_budget_lines_touch on public.facturation_budget_lines;
create trigger facturation_budget_lines_touch
  before update on public.facturation_budget_lines
  for each row execute function public.facturation_budget_lines_touch();

-- 4) Seed idempotent des 55 lignes (reproduction exacte de BUDGET_LINES) ------
insert into public.facturation_budget_lines (code, label, category, hint, tags, sort_order)
values
  ('FAABONoooo', 'Abonnements Administratifs', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'umih, club hotelier', array['Administratif'], 0),
  ('HEFORMoooo', 'Formation du personnel + Frais RH', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'formation du personnel', array['RH'], 1),
  ('FACOMPTooo', 'Frais de Comptabilité et Audit, RH', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Mazars compta, GT paie; KPMG; yooz, cleemy', array['Administratif','Finance'], 2),
  ('FAFRAISRHo', 'Frais de Comptabilité et Audit, RH', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'formation du personnel; frais d''actes; affranchissement; CSE, partenariats école; médecine du Travail; skello, lamster, poplee, flatchr', array['RH','Administratif'], 3),
  ('FADIVooooo', 'Divers charges et produits de gestions courantes', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'affranchissement; autres charges de gestion courante', array['Administratif'], 4),
  ('RECACALLoo', 'Divers charges et produits de gestions courantes', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'cooperation commerciale avec laurent perrier, proachat', array['Commercial'], 5),
  ('FAFOURNDIV', 'Fournitures diverses (Admin / petit outillage / equipe)', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Petits matériels / fourniture, petit matériel informatique, fournitures administratives; fournitures administratives; frais d''actes; la poste', array['Administratif','IT & logiciels'], 6),
  ('FASERVBQoo', 'Services bancaires', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'frais bancaires', array['Finance'], 7),
  ('HESEMINToo', 'Séminaires internes', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'nourriture et soft séminaire interne; avion, train, transports en commun, ...; restaurants, séminaires internes', array['RH','Restauration','Déplacements'], 8),
  ('FEDEPLACET', 'Voyages et déplacements', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'avion, train, transports en commun, ...; restaurants', array['Déplacements'], 9),
  ('FCOUTILooo', 'Outils de communication', 'FRAIS COMMERCIAUX ET MARKETING', 'Nouveaux imprimés d''exploitation, gifting, accessoires d''animation; sponso/pub Facebook; Gratification CM; Droits photos J.Galland', array['Commercial'], 10),
  ('HECOMMOTAo', 'Commissions distribution OTA & GDS', 'FRAIS COMMERCIAUX ET MARKETING', 'OTA: booking, expedia, hrs, dayuse, bnetwork, hotels et préférences...', array['Commercial'], 11),
  ('FCINVITooo', 'Invitation commerciale (clients/Fournisseurs)', 'FRAIS COMMERCIAUX ET MARKETING', 'Invitations à déjeuner institutionnels', array['Commercial','Restauration'], 12),
  ('FCOFFERToo', 'Remise clientèle - offerts', 'FRAIS COMMERCIAUX ET MARKETING', 'Remise clientèle - offerts', array['Commercial'], 13),
  ('FAFREEXTRA', 'Salaires renforts (CDD d''usage)', 'Frais de Perso', 'personnel intérimaire; Mise à disposition de personnel', array['RH'], 14),
  ('HERENFORTo', 'Salaires renforts (CDD d''usage)', 'Frais de Perso', 'personnel intérimaire', array['RH'], 15),
  ('FMCHAUFFUo', 'Chauffage Urbain', 'FRAIS EXPLOITATION / OPERATION', 'chauffage urbain', array['Énergie & fluides'], 16),
  ('FMEAUooooo', 'Eau', 'FRAIS EXPLOITATION / OPERATION', 'eau', array['Énergie & fluides'], 17),
  ('FMELECoooo', 'Electricité', 'FRAIS EXPLOITATION / OPERATION', 'electricité', array['Énergie & fluides'], 18),
  ('FMGAZooooo', 'Gaz', 'FRAIS EXPLOITATION / OPERATION', 'gaz', array['Énergie & fluides'], 19),
  ('FMPONCTUEL', 'Entretien Ponctuel', 'FRAIS EXPLOITATION / OPERATION', 'entretien ponctuel: pièce ou réparation, AVEC ou sans Contrat, hors périmètre du contrat (ex: réparation du chauffage, achat d''une pièce, passer en FM ponctuel et non en FMOBLI; bien qu''on ait un contrat)', array['Technique'], 20),
  ('FMNONOBLIo', 'Maintenance non obligatoire', 'FRAIS EXPLOITATION / OPERATION', 'TPE ADYEN; Machine à café, équipement cuisine, autres maintenances non obligatoires, ...; audit HACCP, dératisation désourisation, traitements des déchets', array['Technique','Restauration'], 21),
  ('FMOBLIoooo', 'Maintenance obligatoire', 'FRAIS EXPLOITATION / OPERATION', 'ascenseurs, portes automatique, extincteur, désenfumage, SSI, contrôle périodique de Bureau véritas, CVC, ECS, CDO, étanchéité, pompe à chaleur; analyse légionnelle, maintenance liée à l''hygiène', array['Technique'], 22),
  ('FMSINISTRE', 'Réparation sur Sinistre', 'FRAIS EXPLOITATION / OPERATION', 'entretien et frais liés à un sinistre', array['Technique'], 23),
  ('FEABONNEoo', 'Abonnements metier (Music/Journaux/plantes)', 'FRAIS EXPLOITATION / OPERATION', 'fleurs et déco de Noel, diverses décorations animations; journaux; abonnements; sacem et spré', array['Administratif','Hébergement'], 24),
  ('FACOMMENCo', 'Commissions sur les encaissements', 'FRAIS EXPLOITATION / OPERATION', 'commissions sur encaissement - banque; commission AMEX et autre; commission sur encaissement - ADYEN; commissions sur encaissement - ANCV', array['Finance'], 25),
  ('FEMATERIEL', 'Consommable d''exploitation', 'FRAIS EXPLOITATION / OPERATION', 'uniformes; produit d''entretien; clef de #, parapluie, sac pressing, sac kraft, gaz enomatic/castalie, mug, allumettes..; Papeterie, fournitures bureau; décoration, fleurs, plantes', array['Technique','Administratif','Hébergement'], 26),
  ('HEMATERIEL', 'Consommable d''exploitation', 'FRAIS EXPLOITATION / OPERATION', 'literie (oreiller, drap, ...); Consommables d''exploitations hébergement (non-inventoriés)', array['Hébergement'], 27),
  ('FMMATTECHo', 'Consommable d''exploitation', 'FRAIS EXPLOITATION / OPERATION', 'petit matériel du RT; petit matériel technique', array['Technique'], 28),
  ('REMATERIEL', 'Consommable d''exploitation', 'FRAIS EXPLOITATION / OPERATION', 'vaisselle; petit matériel restauration; vaisselle pour la restauration; décoration pour la restauration', array['Restauration'], 29),
  ('RAFBOUT', 'Consommable d''exploitation', 'FRAIS EXPLOITATION / OPERATION', 'article de boutique', array['Revenus annexes'], 30),
  ('FENTICoooo', 'Frais de Licences & logiciels', 'FRAIS EXPLOITATION / OPERATION', 'connexion H&P (pms, 3ds, gds care), olakala, otainsight, channel manager, META, RMS, module pascoworking, backyou, etis, stay in touch, loungeup, lightspeed, skello, social express, ad notam, mon courtier energie', array['IT & logiciels','Commercial','RH'], 31),
  ('FELOCMOBoo', 'Locations mobilières', 'FRAIS EXPLOITATION / OPERATION', 'locations matériels, spectre, copieur, diffuseur parfum, castalie, tragfood/locam, yoghurt kitchen', array['Technique','Administratif'], 32),
  ('FESSTDIVoo', 'Sous-traitances diverses / Prestataires externes', 'FRAIS EXPLOITATION / OPERATION', 'gardiennage, loomis, classification 4*, déclaration tertiaire; sous traitance ponctuelle diverse', array['Prestataires'], 33),
  ('FMINFORMoo', 'Maintenance Informatique', 'FRAIS EXPLOITATION / OPERATION', 'uth, hoist; logiciel informatique', array['IT & logiciels','Technique'], 34),
  ('FMTELWEBoo', 'Telephone / Internet / VOD', 'FRAIS EXPLOITATION / OPERATION', 'coriolis, free', array['IT & logiciels'], 35),
  ('HEDELOoooo', 'Délogements', 'Hebergement', 'délogement', array['Hébergement'], 36),
  ('HELINGEooo', 'Location / Blanchissage du linge', 'Hebergement', 'location linge', array['Hébergement'], 37),
  ('HEPDACCooo', 'Produits d''accueil', 'Hebergement', 'produits d''accueil', array['Hébergement'], 38),
  ('HEAPERITIo', 'Aperitivo', 'Hebergement', 'nourriture et soft apéritivo', array['Hébergement','Restauration'], 39),
  ('HESNACKooo', 'Snacking', 'Hebergement', 'nourriture et soft snacking', array['Hébergement','Restauration'], 40),
  ('FAPERTECoo', 'Pertes sur créances irrécouvrables / Dépréciation Client', 'Hebergement', 'chargeback-impayés', array['Finance'], 41),
  ('HESSTCHBoo', 'Sous-traitance Nettoyage Chambres + Blanchisserie', 'Hebergement', 'sous traitance nettoyage chambre / lavage couettes, oreillers etc', array['Hébergement','Prestataires'], 42),
  ('HESSTVIToo', 'Sous-traitance Nettoyage Vitres', 'Hebergement', 'sous traitance nettoyage vitre', array['Prestataires'], 43),
  ('LOMATERIEL', 'Fournitures et petits matériels', 'LOCATION D''ESPACES', 'stock; achat petit matériel pour la location d''espace; vaisselle pour la location salle; décoration pour la location de salle; produits d''accueil pour la location d''espace', array['Location','Restauration'], 44),
  ('LOSSTDIVoo', 'Sous-traitance diverse', 'LOCATION D''ESPACES', 'sous traitance pour la location d''espace', array['Location','Prestataires'], 45),
  ('RDEVMARKoo', 'Redevance Marketing et Publicité', 'Redevances', 'redevances marque', array['Commercial','Finance'], 46),
  ('RDEVRBOooo', 'Redevances de gestion (sur RBO)', 'Redevances', 'redevances RBO', array['Finance'], 47),
  ('RESSTDIVoo', 'Sous-traitance diverses', 'RESTAURATION', 'sous traitance (autre que traiteur)', array['Restauration','Prestataires'], 48),
  ('RESSTFBooo', 'Sous-traitance F&B', 'RESTAURATION', 'traiteur; frais de livraison', array['Restauration'], 49),
  ('REBEALCOOL', 'Alcool', 'RESTAURATION', 'achat alcool', array['Restauration'], 50),
  ('REFOODoooo', 'Food ALC', 'RESTAURATION', 'nourriture et soft à la carte', array['Restauration'], 51),
  ('REPDJFBooo', 'Achats PDJ', 'RESTAURATION', 'nourriture et soft petit dejeuner', array['Restauration'], 52),
  ('RAFBOUTooo', 'Articles de Boutique', 'REVENUS ANNEXES', 'achats boutiques', array['Revenus annexes'], 53),
  ('RAFCONGooo', 'Frais de Conciergerie & Pressing', 'REVENUS ANNEXES', 'prestations qu''on refactures aux clients; achats qu''on refacture aux clients', array['Revenus annexes','Hébergement'], 54)
on conflict (code) do nothing;

-- Contrôle : select count(*) from public.facturation_budget_lines;  -- attendu : 55
