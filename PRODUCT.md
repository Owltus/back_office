# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Personnel back-office de l'hôtel OKKO Nantes (réception, encadrement, administration),
en poste pendant leurs vacations (matin/soir/nuit), qui utilise l'outil au quotidien pour
le reporting, la caisse, le parking, le petit-déjeuner, le rapprochement ménage et la
facturation de l'établissement. Trois rôles : `utilisateur` (lecture), `super_utilisateur`
(+ import), `admin` (+ gestion des comptes) — droits réels appliqués page par page par la
RLS Supabase, la garde d'interface n'étant qu'ergonomique.

## Product Purpose

Remplacer des processus manuels/tableurs fragmentés par un seul outil interne qui
couvre le reporting journalier, le planning de parking, le suivi et la facturation des
petits-déjeuners, le rapprochement de caisse (espèces/CB/chèques vacances/Adyen, avec
cautions clients), le rapprochement ménage par chambre, la facturation fournisseurs, un
écran d'affichage back-office et un module literie. Le succès se mesure à l'exactitude
des rapprochements financiers/opérationnels et à la rapidité d'exécution du personnel
pendant une vacation, pas à l'attrait visuel pour un visiteur externe.

## Positioning

Une modélisation métier hôtelière fine, directement câblée sur les données réelles de
l'établissement (import PMS StayNTouch / Lightspeed, inventaire réel des 80 chambres,
logique de « jour métier » par vacation, règles de facturation petit-déjeuner/addon,
gestion des cautions en espèces) qu'un tableur générique ou un outil non spécialisé ne
pourrait reproduire fidèlement.

## Operating Context

Vacations hôtelières (matin/soir/nuit, la nuit rattachée rétroactivement au jour
précédent), imports CSV PMS/Lightspeed, cycles de rapprochement quotidiens et mensuels,
rapports imprimés/PDF, caisse physique avec enveloppes de cautions scellées, écran
d'affichage en zone back-office/lobby.

## Capabilities and Constraints

- Hôtel **unique** (OKKO Nantes, 80 chambres, numérotation réelle par tranches —
  102-114/201-214/.../621-631, pas une plage 1-80), TVA 10 % — **contrainte durable**,
  pas d'évolution multi-établissements prévue.
- Interface en **français uniquement**.
- Usage **strictement interne** : pas de visiteur/client externe, pas d'enjeu marketing
  ou de conversion.
- Backend Supabase **dédié** à cette app (prod live, vrais utilisateurs) — RLS par page
  comme unique autorité de sécurité réelle.
- Maturité inégale des modules : RepJour est la seule feature pleinement aboutie ;
  Parking, PDJ, Rapprochement, Caisse, Affichage, Facturation, Artefact, Literie sont à
  des stades variés.
- « OKKO Nantes » est un repère interne pratique, **pas** un engagement de marque
  externe à respecter (pas de contrainte de logo/identité de la chaîne OKKO Hotels à
  reproduire fidèlement).

## Product Principles

1. Outil interne mono-hôtel : la justesse opérationnelle et l'efficacité du personnel
   priment sur l'attrait visuel pour un public externe.
2. **Opérabilité clavier intégrale** : toute action de l'application doit rester
   accessible sans souris, sur toutes les pages — aucune fonctionnalité clavier-exclue.
3. **Responsive réellement adaptatif** : le layout s'adapte à la largeur/résolution
   réelle de l'écran (smartphone, tablette, ordinateur), pas un simple rétrécissement
   proportionnel du même agencement.
4. La RLS Supabase par page est la frontière de sécurité réelle ; toute garde
   d'interface (rôle, statut clôturé...) reste ergonomique, jamais la seule protection.
5. Exactitude du domaine métier avant convention générique : les contraintes hôtelières
   réelles (numérotation des chambres, jour métier par vacation, règles de facturation
   françaises PDJ/TVA) doivent être modélisées fidèlement, jamais approximées.

## Accessibility & Inclusion

Exigence confirmée : **usage clavier seul** (sans souris) doit rester possible sur
l'ensemble de l'application. Aucune autre exigence spécifique (lecteur d'écran,
contraste renforcé...) n'est établie à ce jour.
