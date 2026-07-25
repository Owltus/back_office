-- ============================================================================
-- facturation_ref_imputations — SEED du référentiel couple (plan analytique OKKO).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS
-- facturation_ref_imputations.sql. Ré-exécutable (on conflict do nothing : additif,
-- n'écrase jamais une édition faite via le CRUD/réimport).
--
-- GÉNÉRÉ automatiquement depuis le fichier du comptable (99 lignes,
-- 97 couples distincts). Ne pas éditer à la main : régénérer depuis la source.
--
-- Incohérences repérées dans la source, à faire trancher par le comptable
-- (elles ne bloquent pas le seed) :
--   * 2 couple(s) en double : FMMATTECHo|60630000, REMATERIEL|60650000
--     -> la ligne en double est ignorée (on conflict do nothing).
--   * codes RAFBOUT (7 car.) et RAFBOUTooo (10 car.) sur le compte 60760000
--     -> traités comme 2 codes distincts (probable faute de saisie a confirmer).
--   * 'o' en fin de code conservés tels quels (a confirmer : des zéros ?).
-- ============================================================================

insert into public.facturation_ref_imputations
  (code_analytique, compte, section, libelle, description, sort_order)
values
  ('FAABONoooo', '62810000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Abonnements Administratifs', 'umih, club hotelier', 0),
  ('HEFORMoooo', '62230000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Formation du personnel + Frais RH', 'formation du personnel', 1),
  ('FACOMPTooo', '62260000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Frais de Comptabilité et Audit, RH', 'Mazars compta, GT paie', 2),
  ('FACOMPTooo', '62261000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Frais de Comptabilité et Audit, RH', 'KPMG', 3),
  ('FACOMPTooo', '65190000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Frais de Comptabilité et Audit, RH', 'yooz, cleemy', 4),
  ('FAFRAISRHo', '62230000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Frais de Comptabilité et Audit, RH', 'formation du personnel', 5),
  ('FAFRAISRHo', '62270000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Frais de Comptabilité et Audit, RH', 'frais d''actes', 6),
  ('FAFRAISRHo', '62600000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Frais de Comptabilité et Audit, RH', 'affranchissement', 7),
  ('FAFRAISRHo', '64720000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Frais de Comptabilité et Audit, RH', 'CSE, partenariats école', 8),
  ('FAFRAISRHo', '64750000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Frais de Comptabilité et Audit, RH', 'médecine du Travail', 9),
  ('FAFRAISRHo', '65190000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Frais de Comptabilité et Audit, RH', 'skello, lamster, poplee, flatchr', 10),
  ('FADIVooooo', '62600000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Divers charges et produits de gestions courantes', 'affranchissement', 11),
  ('FADIVooooo', '65800000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Divers charges et produits de gestions courantes', 'autres charges de gestion courante', 12),
  ('RECACALLoo', '60980000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Divers charges et produits de gestions courantes', 'cooperation commerciale avec laurent perrier, proachat', 13),
  ('FAFOURNDIV', '60633000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Fournitures diverses (Admin / petit outillage / equipe)', 'Petits matériels / fourniture, petit matériel informatique, fournitures administratives', 14),
  ('FAFOURNDIV', '60640000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Fournitures diverses (Admin / petit outillage / equipe)', 'fournitures administratives', 15),
  ('FAFOURNDIV', '62270000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Fournitures diverses (Admin / petit outillage / equipe)', 'frais d''actes', 16),
  ('FAFOURNDIV', '62600000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Fournitures diverses (Admin / petit outillage / equipe)', 'la poste', 17),
  ('FASERVBQoo', '62780000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Services bancaires', 'frais bancaires', 18),
  ('HESEMINToo', '60710000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Séminaires internes', 'nourriture et soft séminaire interne', 19),
  ('HESEMINToo', '62510000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Séminaires internes', 'avion, train, transports en commun, ...', 20),
  ('HESEMINToo', '62570000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Séminaires internes', 'restaurants, séminaires internes', 21),
  ('FEDEPLACET', '62510000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Voyages et déplacements', 'avion, train, transports en commun, ...', 22),
  ('FEDEPLACET', '62570000', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'Voyages et déplacements', 'restaurants', 23),
  ('FCOUTILooo', '60630000', 'FRAIS COMMERCIAUX ET MARKETING', 'Outils de communication', 'Nouveaux imprimés d''exploitation, gifting, accessoires d''animation', 24),
  ('FCOUTILooo', '62310000', 'FRAIS COMMERCIAUX ET MARKETING', 'Outils de communication', 'sponso/pub Facebook', 25),
  ('FCOUTILooo', '62340000', 'FRAIS COMMERCIAUX ET MARKETING', 'Outils de communication', 'Gratification CM', 26),
  ('FCOUTILooo', '65160000', 'FRAIS COMMERCIAUX ET MARKETING', 'Outils de communication', 'Droits photos J.Galland', 27),
  ('HECOMMOTAo', '62223000', 'FRAIS COMMERCIAUX ET MARKETING', 'Commissions distribution OTA & GDS', 'OTA: booking, expedia, hrs, dayuse, bnetwork, hotels et préférences...', 28),
  ('FCINVITooo', '62510000', 'FRAIS COMMERCIAUX ET MARKETING', 'Invitation commerciale (clients/Fournisseurs)', 'Invitations à déjeuner institutionnels', 29),
  ('FCOFFERToo', '62340000', 'FRAIS COMMERCIAUX ET MARKETING', 'Remise clientèle - offerts', 'Remise clientèle - offerts', 30),
  ('FAFREEXTRA', '62110000', 'Frais de Perso', 'Salaires renforts (CDD d''usage)', 'personnel intérimaire', 31),
  ('FAFREEXTRA', '62140000', 'Frais de Perso', 'Salaires renforts (CDD d''usage)', 'Mise à disposition de personnel', 32),
  ('HERENFORTo', '62110000', 'Frais de Perso', 'Salaires renforts (CDD d''usage)', 'personnel intérimaire', 33),
  ('FMCHAUFFUo', '60612200', 'FRAIS EXPLOITATION / OPERATION', 'Chauffage Urbain', 'chauffage urbain', 34),
  ('FMEAUooooo', '60611000', 'FRAIS EXPLOITATION / OPERATION', 'Eau', 'eau', 35),
  ('FMELECoooo', '60612000', 'FRAIS EXPLOITATION / OPERATION', 'Electricité', 'electricité', 36),
  ('FMGAZooooo', '60612100', 'FRAIS EXPLOITATION / OPERATION', 'Gaz', 'gaz', 37),
  ('FMPONCTUEL', '61550000', 'FRAIS EXPLOITATION / OPERATION', 'Entretien Ponctuel', 'entretien ponctuel: pièce ou réparation, AVEC ou sans Contrat, hors périmètre du contrat (ex: réparation du chauffage, achat d''une pièce, passer en FM ponctuel et non en FMOBLI; bien qu''on ait un contrat)', 38),
  ('FMNONOBLIo', '61561000', 'FRAIS EXPLOITATION / OPERATION', 'Maintenance non obligatoire', 'TPE ADYEN', 39),
  ('FMNONOBLIo', '61564000', 'FRAIS EXPLOITATION / OPERATION', 'Maintenance non obligatoire', 'Machine à café, équipement cuisine, autres maintenances non obligatoires, ...', 40),
  ('FMNONOBLIo', '61567500', 'FRAIS EXPLOITATION / OPERATION', 'Maintenance non obligatoire', 'audit HACCP, dératisation désourisation, traitements des déchets', 41),
  ('FMOBLIoooo', '61564000', 'FRAIS EXPLOITATION / OPERATION', 'Maintenance obligatoire', 'ascenseurs, portes automatique, extincteur, désenfumage, SSI, contrôle périodique de Bureau véritas, CVC, ECS, CDO, étanchéité, pompe à chaleur', 42),
  ('FMOBLIoooo', '61567500', 'FRAIS EXPLOITATION / OPERATION', 'Maintenance obligatoire', 'analyse légionnelle, maintenance liée à l''hygiène', 43),
  ('FMSINISTRE', '61550000', 'FRAIS EXPLOITATION / OPERATION', 'Réparation sur Sinistre', 'entretien et frais liés à un sinistre', 44),
  ('FEABONNEoo', '60670000', 'FRAIS EXPLOITATION / OPERATION', 'Abonnements metier (Music/Journaux/plantes)', 'fleurs et déco de Noel, diverses décorations animations', 45),
  ('FEABONNEoo', '61810000', 'FRAIS EXPLOITATION / OPERATION', 'Abonnements metier (Music/Journaux/plantes)', 'journaux', 46),
  ('FEABONNEoo', '62810000', 'FRAIS EXPLOITATION / OPERATION', 'Abonnements metier (Music/Journaux/plantes)', 'abonnements', 47),
  ('FEABONNEoo', '65160000', 'FRAIS EXPLOITATION / OPERATION', 'Abonnements metier (Music/Journaux/plantes)', 'sacem et spré', 48),
  ('FACOMMENCo', '62780000', 'FRAIS EXPLOITATION / OPERATION', 'Commissions sur les encaissements', 'commissions sur encaissement - banque', 49),
  ('FACOMMENCo', '62782000', 'FRAIS EXPLOITATION / OPERATION', 'Commissions sur les encaissements', 'commission AMEX et autre', 50),
  ('FACOMMENCo', '62783000', 'FRAIS EXPLOITATION / OPERATION', 'Commissions sur les encaissements', 'commission sur encaissement - ADYEN', 51),
  ('FACOMMENCo', '62784000', 'FRAIS EXPLOITATION / OPERATION', 'Commissions sur les encaissements', 'commissions sur encaissement - ANCV', 52),
  ('FEMATERIEL', '60623000', 'FRAIS EXPLOITATION / OPERATION', 'Consommable d''exploitation', 'uniformes', 53),
  ('HEMATERIEL', '60621000', 'FRAIS EXPLOITATION / OPERATION', 'Consommable d''exploitation', 'literie (oreiller, drap, ...)', 54),
  ('FMMATTECHo', '60630000', 'FRAIS EXPLOITATION / OPERATION', 'Consommable d''exploitation', 'petit matériel du RT', 55),
  ('FEMATERIEL', '60632000', 'FRAIS EXPLOITATION / OPERATION', 'Consommable d''exploitation', 'produit d''entretien', 56),
  ('FEMATERIEL', '60633000', 'FRAIS EXPLOITATION / OPERATION', 'Consommable d''exploitation', 'clef de #, parapluie, sac pressing, sac kraft, gaz enomatic/castalie, mug, allumettes..', 57),
  ('FEMATERIEL', '60640000', 'FRAIS EXPLOITATION / OPERATION', 'Consommable d''exploitation', 'Papeterie, fournitures bureau', 58),
  ('REMATERIEL', '60650000', 'FRAIS EXPLOITATION / OPERATION', 'Consommable d''exploitation', 'vaisselle', 59),
  ('FEMATERIEL', '60660000', 'FRAIS EXPLOITATION / OPERATION', 'Consommable d''exploitation', 'décoration, fleurs, plantes', 60),
  ('RAFBOUT', '60760000', 'FRAIS EXPLOITATION / OPERATION', 'Consommable d''exploitation', 'article de boutique', 61),
  ('FMMATTECHo', '60630000', 'FRAIS EXPLOITATION / OPERATION', 'Consommable d''exploitation', 'petit matériel technique', 62),
  ('FENTICoooo', '65190000', 'FRAIS EXPLOITATION / OPERATION', 'Frais de Licences & logiciels', 'connexion H&P (pms, 3ds, gds care), olakala, otainsight, channel manager, META, RMS, module pascoworking, backyou, etis, stay in touch, loungeup, lightspeed, skello, social express, ad notam, mon courtier energie', 63),
  ('FELOCMOBoo', '61350000', 'FRAIS EXPLOITATION / OPERATION', 'Locations mobilières', 'locations matériels, spectre, copieur, diffuseur parfum, castalie, tragfood/locam, yoghurt kitchen', 64),
  ('FESSTDIVoo', '61100000', 'FRAIS EXPLOITATION / OPERATION', 'Sous-traitances diverses / Prestataires externes', 'gardiennage, loomis, classification 4*, déclaration tertiaire', 65),
  ('FESSTDIVoo', '61150000', 'FRAIS EXPLOITATION / OPERATION', 'Sous-traitances diverses / Prestataires externes', 'sous traitance ponctuelle diverse', 66),
  ('FMINFORMoo', '61561000', 'FRAIS EXPLOITATION / OPERATION', 'Maintenance Informatique', 'uth, hoist', 67),
  ('FMINFORMoo', '65190000', 'FRAIS EXPLOITATION / OPERATION', 'Maintenance Informatique', 'logiciel informatique', 68),
  ('FMTELWEBoo', '62610000', 'FRAIS EXPLOITATION / OPERATION', 'Telephone / Internet / VOD', 'coriolis, free', 69),
  ('HEDELOoooo', '61110000', 'Hebergement', 'Délogements', 'délogement', 70),
  ('HELINGEooo', '61120000', 'Hebergement', 'Location / Blanchissage du linge', 'location linge', 71),
  ('HEMATERIEL', '60630000', 'Hebergement', 'Petit matériel hébergement', 'Consommables d''exploitations hébergement (non-inventoriés)', 72),
  ('HEPDACCooo', '60770000', 'Hebergement', 'Produits d''accueil', 'produits d''accueil', 73),
  ('HEAPERITIo', '60710000', 'Hebergement', 'Aperitivo', 'nourriture et soft apéritivo', 74),
  ('HESNACKooo', '60710000', 'Hebergement', 'Snacking', 'nourriture et soft snacking', 75),
  ('FAPERTECoo', '65400000', 'Hebergement', 'Pertes sur créances irrécouvrables / Dépréciation Client', 'chargeback-impayés', 76),
  ('HESSTCHBoo', '61120000', 'Hebergement', 'Sous-traitance Nettoyage Chambres + Blanchisserie', 'sous traitance nettoyage chambre / lavage couettes, oreillers etc', 77),
  ('HESSTVIToo', '61100000', 'Hebergement', 'Sous-traitance Nettoyage Vitres', 'sous traitance nettoyage vitre', 78),
  ('LOMATERIEL', '60377000', 'LOCATION D''ESPACES', 'Fournitures et petits matériels', 'stock', 79),
  ('LOMATERIEL', '60630000', 'LOCATION D''ESPACES', 'Fournitures et petits matériels', 'achat petit matériel pour la location d''espace', 80),
  ('LOMATERIEL', '60650000', 'LOCATION D''ESPACES', 'Fournitures et petits matériels', 'vaisselle pour la location salle', 81),
  ('LOMATERIEL', '60660000', 'LOCATION D''ESPACES', 'Fournitures et petits matériels', 'décoration pour la location de salle', 82),
  ('LOMATERIEL', '60770000', 'LOCATION D''ESPACES', 'Fournitures et petits matériels', 'produits d''accueil pour la location d''espace', 83),
  ('LOSSTDIVoo', '61150000', 'LOCATION D''ESPACES', 'Sous-traitance diverse', 'sous traitance pour la location d''espace', 84),
  ('RDEVMARKoo', '65110000', 'Redevances', 'Redevance Marketing et Publicité', 'redevances marque', 85),
  ('RDEVRBOooo', '62281000', 'Redevances', 'Redevances de gestion (sur RBO)', 'redevances RBO', 86),
  ('REMATERIEL', '60630000', 'RESTAURATION', 'Petits matériels, décorations, vaisselle', 'petit matériel restauration', 87),
  ('REMATERIEL', '60650000', 'RESTAURATION', 'Petits matériels, décorations, vaisselle', 'vaisselle pour la restauration', 88),
  ('REMATERIEL', '60660000', 'RESTAURATION', 'Petits matériels, décorations, vaisselle', 'décoration pour la restauration', 89),
  ('RESSTDIVoo', '61150000', 'RESTAURATION', 'Sous-traitance diverses', 'sous traitance (autre que traiteur)', 90),
  ('RESSTFBooo', '61150000', 'RESTAURATION', 'Sous-traitance F&B', 'traiteur', 91),
  ('RESSTFBooo', '62400000', 'RESTAURATION', 'Sous-traitance F&B', 'frais de livraison', 92),
  ('REBEALCOOL', '60750000', 'RESTAURATION', 'Alcool', 'achat alcool', 93),
  ('REFOODoooo', '60710000', 'RESTAURATION', 'Food ALC', 'nourriture et soft à la carte', 94),
  ('REPDJFBooo', '60710000', 'RESTAURATION', 'Achats PDJ', 'nourriture et soft petit dejeuner', 95),
  ('RAFBOUTooo', '60760000', 'REVENUS ANNEXES', 'Articles de Boutique', 'achats boutiques', 96),
  ('RAFCONGooo', '60400000', 'REVENUS ANNEXES', 'Frais de Conciergerie & Pressing', 'prestations qu''on refactures aux clients', 97),
  ('RAFCONGooo', '60760000', 'REVENUS ANNEXES', 'Frais de Conciergerie & Pressing', 'achats qu''on refacture aux clients', 98)
on conflict (code_analytique, compte) do nothing;

-- Contrôle : select count(*) from public.facturation_ref_imputations;  -- attendu : 97
