# Étape 5 ⚠ — Contrôle de cohérence avec liens

## Objectif

L'app relit elle-même les réglages et dit ce qui ne colle pas, en phrases
courtes, chaque point avec un bouton qui ouvre le bon réglage. C'est le
« contrôle de préparation » des logiciels du marché, et il sert aussi de guide
de démarrage (étape 7).

## Dépend de

2.

## Fichier(s) impacté(s)

- Nouveau `src/lib/planning/coherence.ts` (pur) + `coherence.test.ts`.
- `src/lib/planning/semaine.ts:434-453,661,838` (`alertes_besoins` repris).
- Nouveau `src/components/planning/parametres/ControleReglages.tsx`.
- `EnTeteParametres.tsx` (pastille du nombre de points), `PageAvecEnTete` des quatre écrans.

## Travail à réaliser

1. `verifierReglages(referentiel, semaine?)` rend des points `{ gravite: 'bloquant' | 'a-voir', texte, lien: { page, cible } }`. Points prévus :
   - besoin sur un code que le poste n'a plus (aujourd'hui écarté en silence) ;
   - besoin sur un poste sans aucune personne autonome ;
   - matin / soir : somme des besoins sous la consigne « au moins », ou au-dessus de « au plus » (par jour) ;
   - personne sans code utilisable sur un de ses postes ;
   - code fixé de la semaine type impossible (hors poste, ou sans besoin de ce code ce jour-là) ;
   - heures de contrat des titulaires très en dessous des heures demandées (écart en heures) ;
   - poste qui compte dans la présence sans titulaire ;
   - code sans période (matin / soir / nuit) utilisé par un poste qui compte dans la présence ;
   - soutien demandé sur un poste où personne n'est apprenti ou stagiaire.
2. Regrouper par écran (Horaires, Postes, Équipe, Besoins), 1 ligne par point, au plus 5 visibles par groupe puis « 3 de plus ».
3. Panneau « À vérifier » ouvert depuis une pastille dans l'en-tête des paramètres ; même liste dans la boîte de génération.
4. Les liens ouvrent l'écran ET le volet concerné (poste, fiche, ligne de besoin) : réutiliser les paramètres de route existants ou ajouter un `?ouvrir=`.
5. Rien n'est bloquant pour enregistrer ; seul « bloquant » empêche de générer (étape 7).

## Phase de test /martin

Un référentiel construit pour chaque point le fait apparaître une fois, avec le bon lien ; un référentiel propre n'en produit aucun (oracle : référentiel du seed fictif corrigé à la main).

## Critère de validation

- Sur les données de dev : le contrôle trouve l'écart matin / soir et les 11 shifts d'adjoints relevés par l'audit.

## Contrôle /borg

- Aucun point ne reprend une règle déjà écrite ailleurs sans passer par `eligibilite.ts` ou `regles.ts`.
- Coût : `verifierReglages` reste sous 20 ms sur les données de dev (appelé à chaque rendu des paramètres, mémoïsé).
