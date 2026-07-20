-- ============================================================================
-- facturation_budget_lines — MISE À JOUR des descriptions (hint) des 55 imputations.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS facturation_budget_lines.sql
-- (la table + le seed doivent exister). Ré-exécutable (UPDATE idempotent, ne touche que `hint`).
--
-- But : des descriptions plus claires et plus complètes pour AIDER l'utilisateur à comprendre
-- ce que couvre chaque imputation. Trame constante : « ce que couvre : exemples concrets.
-- précision de contexte ». Les noms de fournisseurs / mots-clés sont CONSERVÉS (le hint sert
-- aussi à la RECHERCHE dans le sélecteur), et les précisions de contexte importantes gardées.
-- ============================================================================

-- FRAIS ADMINISTRATIFS ET GENERAUX
update public.facturation_budget_lines set hint = 'Cotisations et abonnements administratifs de l''hôtel : adhésions à des organisations professionnelles comme l''UMIH ou un club hôtelier.' where code = 'FAABONoooo';
update public.facturation_budget_lines set hint = 'Dépenses de formation du personnel : sessions de formation et organismes formateurs.' where code = 'HEFORMoooo';
update public.facturation_budget_lines set hint = 'Prestations de comptabilité, d''audit et de paie : cabinets comptables (Mazars, KPMG), gestion de la paie (GT), et outils associés (Yooz, Cleemy).' where code = 'FACOMPTooo';
update public.facturation_budget_lines set hint = 'Frais RH divers : formation, frais d''actes, affranchissement, CSE, partenariats avec des écoles, médecine du travail, et outils RH (Skello, Lamster, Poplee, Flatchr).' where code = 'FAFRAISRHo';
update public.facturation_budget_lines set hint = 'Charges de gestion courante diverses : affranchissement et autres frais courants qui ne rentrent dans aucune autre imputation.' where code = 'FADIVooooo';
update public.facturation_budget_lines set hint = 'Produits et charges de coopération commerciale : accords conclus avec des fournisseurs (ex. Laurent-Perrier, ProAchat).' where code = 'RECACALLoo';
update public.facturation_budget_lines set hint = 'Fournitures diverses : petit matériel (dont informatique), fournitures administratives, frais d''actes et envois postaux (La Poste).' where code = 'FAFOURNDIV';
update public.facturation_budget_lines set hint = 'Frais bancaires : tenue de compte et services facturés par la banque (à distinguer des commissions sur encaissement).' where code = 'FASERVBQoo';
update public.facturation_budget_lines set hint = 'Dépenses liées aux séminaires internes : nourriture et boissons soft, transports (avion, train, transports en commun) et restaurants.' where code = 'HESEMINToo';
update public.facturation_budget_lines set hint = 'Voyages et déplacements professionnels : avion, train, transports en commun et restaurants liés aux déplacements.' where code = 'FEDEPLACET';

-- FRAIS COMMERCIAUX ET MARKETING
update public.facturation_budget_lines set hint = 'Outils et supports de communication : imprimés d''exploitation, gifting, accessoires d''animation, publicité (sponsoring, pub Facebook), community management et droits photo.' where code = 'FCOUTILooo';
update public.facturation_budget_lines set hint = 'Commissions versées aux plateformes de réservation en ligne (OTA/GDS) : Booking, Expedia, HRS, Dayuse, Bnetwork…' where code = 'HECOMMOTAo';
update public.facturation_budget_lines set hint = 'Invitations commerciales de clients ou de fournisseurs : déjeuners et réceptions institutionnels.' where code = 'FCINVITooo';
update public.facturation_budget_lines set hint = 'Gestes commerciaux offerts à la clientèle : remises accordées et prestations offertes.' where code = 'FCOFFERToo';

-- Frais de Perso
update public.facturation_budget_lines set hint = 'Salaires des renforts en CDD d''usage : personnel intérimaire et mise à disposition de personnel.' where code = 'FAFREEXTRA';
update public.facturation_budget_lines set hint = 'Salaires des renforts en CDD d''usage pour l''hébergement : personnel intérimaire.' where code = 'HERENFORTo';

-- FRAIS EXPLOITATION / OPERATION
update public.facturation_budget_lines set hint = 'Consommation de chauffage urbain (réseau de chaleur de la ville).' where code = 'FMCHAUFFUo';
update public.facturation_budget_lines set hint = 'Consommation d''eau (fourniture et assainissement).' where code = 'FMEAUooooo';
update public.facturation_budget_lines set hint = 'Consommation d''électricité (fourniture d''énergie électrique).' where code = 'FMELECoooo';
update public.facturation_budget_lines set hint = 'Consommation de gaz de ville (fourniture d''énergie).' where code = 'FMGAZooooo';
update public.facturation_budget_lines set hint = 'Réparation ou entretien ponctuel, réalisé hors du contrat de maintenance (même si un contrat existe) : ex. réparer le chauffage ou acheter une pièce. À imputer ici, et non en maintenance obligatoire (FMOBLI).' where code = 'FMPONCTUEL';
update public.facturation_budget_lines set hint = 'Maintenances NON réglementaires (non obligatoires) : TPE (Adyen), machine à café et équipements de cuisine, audit HACCP, dératisation/désourisation, traitement des déchets.' where code = 'FMNONOBLIo';
update public.facturation_budget_lines set hint = 'Maintenance et contrôles réglementaires OBLIGATOIRES : ascenseurs, portes automatiques, extincteurs, désenfumage, SSI, CVC, ECS, étanchéité, pompe à chaleur, contrôle périodique (Bureau Veritas), analyse légionnelle et entretien lié à l''hygiène.' where code = 'FMOBLIoooo';
update public.facturation_budget_lines set hint = 'Réparations et frais consécutifs à un sinistre (dégât matériel), qu''ils soient couverts par une assurance ou non.' where code = 'FMSINISTRE';
update public.facturation_budget_lines set hint = 'Abonnements et ambiance de l''établissement : musique (SACEM, SPRÉ), journaux, décorations et fleurs (dont décoration de Noël).' where code = 'FEABONNEoo';
update public.facturation_budget_lines set hint = 'Commissions prélevées sur les encaissements clients : banque, cartes bancaires (Amex…), Adyen et ANCV.' where code = 'FACOMMENCo';
update public.facturation_budget_lines set hint = 'Consommables d''exploitation : uniformes, produits d''entretien, papeterie et fournitures de bureau, petit matériel (clés, parapluies, sacs pressing, sacs kraft, gaz Enomatic/Castalie…), décoration, fleurs et plantes.' where code = 'FEMATERIEL';
update public.facturation_budget_lines set hint = 'Consommables d''exploitation de l''hébergement : literie (oreillers, draps…) et fournitures des chambres non inventoriées.' where code = 'HEMATERIEL';
update public.facturation_budget_lines set hint = 'Consommables techniques : petit matériel du responsable technique (RT) et petit outillage technique.' where code = 'FMMATTECHo';
update public.facturation_budget_lines set hint = 'Consommables de restauration : vaisselle, petit matériel et décoration pour le service en restauration.' where code = 'REMATERIEL';
update public.facturation_budget_lines set hint = 'Consommables liés à la boutique : articles destinés à la vente en boutique.' where code = 'RAFBOUT';
update public.facturation_budget_lines set hint = 'Licences et abonnements logiciels : connexion PMS/GDS (H&P, 3DS, GDS Care), distribution et revenue (Olakala, OTA Insight, channel manager, RMS, META), relation client (LoungeUp, Stay in Touch), et autres outils (Lightspeed, Skello, Backyou, Etis…).' where code = 'FENTICoooo';
update public.facturation_budget_lines set hint = 'Locations de matériel et de mobilier : copieur, diffuseur de parfum, fontaine à eau (Castalie), équipements (Spectre, Yoghurt Kitchen) et financement locatif (Tragfood/Locam).' where code = 'FELOCMOBoo';
update public.facturation_budget_lines set hint = 'Sous-traitance et prestataires externes divers : gardiennage, transport de fonds (Loomis), classification 4 étoiles, déclaration tertiaire et sous-traitance ponctuelle.' where code = 'FESSTDIVoo';
update public.facturation_budget_lines set hint = 'Maintenance informatique : maintenance des systèmes et des logiciels (UTH, Hoist…).' where code = 'FMINFORMoo';
update public.facturation_budget_lines set hint = 'Téléphonie, Internet et VOD : abonnements et communications (Coriolis, Free…).' where code = 'FMTELWEBoo';

-- Hebergement
update public.facturation_budget_lines set hint = 'Frais de délogement d''un client : relogement dans un autre hôtel (surbooking ou chambre indisponible).' where code = 'HEDELOoooo';
update public.facturation_budget_lines set hint = 'Location et blanchissage du linge (draps, serviettes, nappes…) auprès d''un prestataire.' where code = 'HELINGEooo';
update public.facturation_budget_lines set hint = 'Produits d''accueil mis à disposition des clients en chambre (savons, gels, nécessaires…).' where code = 'HEPDACCooo';
update public.facturation_budget_lines set hint = 'Approvisionnement de l''apéritivo : nourriture et boissons soft servies au moment de l''apéritif.' where code = 'HEAPERITIo';
update public.facturation_budget_lines set hint = 'Approvisionnement du snacking : nourriture et boissons soft de la petite restauration.' where code = 'HESNACKooo';
update public.facturation_budget_lines set hint = 'Pertes sur créances clients irrécouvrables : impayés et chargebacks (paiements rejetés).' where code = 'FAPERTECoo';
update public.facturation_budget_lines set hint = 'Sous-traitance du nettoyage des chambres et de la blanchisserie : ménage des chambres, lavage des couettes, oreillers, etc.' where code = 'HESSTCHBoo';
update public.facturation_budget_lines set hint = 'Sous-traitance du nettoyage des vitres (prestataire externe).' where code = 'HESSTVIToo';

-- LOCATION D'ESPACES
update public.facturation_budget_lines set hint = 'Fournitures et petit matériel pour la location d''espaces : stock, vaisselle, décoration et produits d''accueil dédiés aux salles louées.' where code = 'LOMATERIEL';
update public.facturation_budget_lines set hint = 'Sous-traitance diverse liée à la location d''espaces (prestations réalisées pour les salles louées).' where code = 'LOSSTDIVoo';

-- Redevances
update public.facturation_budget_lines set hint = 'Redevance de marketing et de publicité versée au titre de la marque (enseigne).' where code = 'RDEVMARKoo';
update public.facturation_budget_lines set hint = 'Redevance de gestion calculée sur le RBO (résultat brut d''exploitation).' where code = 'RDEVRBOooo';

-- RESTAURATION
update public.facturation_budget_lines set hint = 'Sous-traitance diverse en restauration, hors traiteur.' where code = 'RESSTDIVoo';
update public.facturation_budget_lines set hint = 'Sous-traitance food & beverage : prestations de traiteur et frais de livraison associés.' where code = 'RESSTFBooo';
update public.facturation_budget_lines set hint = 'Achats de boissons alcoolisées pour la restauration et le bar.' where code = 'REBEALCOOL';
update public.facturation_budget_lines set hint = 'Achats de nourriture et de boissons soft pour la restauration à la carte.' where code = 'REFOODoooo';
update public.facturation_budget_lines set hint = 'Achats de nourriture et de boissons soft pour le petit-déjeuner.' where code = 'REPDJFBooo';

-- REVENUS ANNEXES
update public.facturation_budget_lines set hint = 'Achats d''articles destinés à la vente en boutique.' where code = 'RAFBOUTooo';
update public.facturation_budget_lines set hint = 'Frais de conciergerie et de pressing : prestations et achats réalisés pour un client puis refacturés à ce client.' where code = 'RAFCONGooo';

-- Contrôle : select code, hint from public.facturation_budget_lines order by sort_order;
