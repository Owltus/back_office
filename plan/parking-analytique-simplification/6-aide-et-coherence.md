# Étape 6 — Panneau d'aide et cohabitation des deux taux

## Objectif

Remettre le panneau d'aide en accord avec ce que l'écran affiche vraiment, et
dire explicitement pourquoi le planning et l'analytique annoncent deux taux
d'occupation différents pour la même journée.

## Contexte

`ParkingHelpPanel.tsx` est le panneau d'aide du **planning**, mais il contient
une section qui décrit la page **analytique** (lignes 685-728). Après les
étapes 3 et 4, trois de ses affirmations deviennent fausses :

- ligne 686-691 : « … quel chiffre d'affaires, combien de départs sans
  paiement » ;
- lignes 692-696 : « résume l'année en six cartes — Réservations, TO moyen,
  Nuits totales, CA Parking, Impayés et Captage » ;
- lignes 705-712 : « Le captage est plafonné à 100 %, contrairement au taux
  d'occupation », une puce qui décrit deux notions dont l'une disparaît et
  l'autre change de règle. L'intitulé « Trois points à connaître » (ligne 703)
  devra suivre.

Le reste du panneau décrit le planning et reste vrai : le statut « non payé »
(lignes 674-682), la couleur orange (lignes 715-720), les douze places client
et les deux places tampon (lignes 362-366 et 424-436), la démonstration à
108 % avec ses colonnes rouges. **Ne rien y toucher** : ce sont les règles du
planning, que ce chantier laisse intactes.

C'est précisément ce qui crée le besoin de cette étape. À partir de maintenant,
une journée à treize places occupées se lit 108 % en en-tête du planning et
92,9 % dans le tableau analytique. Les deux chiffres sont justes, ils ne
répondent pas à la même question : le planning surveille le débordement sur les
places tampon, l'analytique mesure le remplissage du parking. Un utilisateur
qui compare les deux écrans sans explication conclura à un bug. La règle
d'écriture du projet s'applique : phrases courtes, ponctuation simple, pas de
tiret cadratin ni de guillemets français dans les messages d'interface.

## Fichier(s) impacté(s)

- `src/components/parking/ParkingHelpPanel.tsx` (modifié : section analytique uniquement)
- `src/lib/analytique/pdf.ts` (modifié : commentaire d'exemple, cosmétique)

## Travail à réaliser

### 1. Réécrire l'énumération des cartes

Lignes 692-696 : l'énumération passe de six à quatre cartes — Réservations,
TO moyen, Nuits totales, CA Parking. Retirer `<Term>Impayés</Term>` et
`<Term>Captage</Term>`.

Ligne 686-691 : retirer « combien de départs sans paiement » de la phrase
d'introduction.

### 2. Supprimer la puce du captage

Lignes 705-712 : supprimer entièrement la puce qui explique le plafonnement du
captage. Ajuster le compte annoncé ligne 703 (« Trois points » devient « Deux
points », ou la formulation qui correspond à ce qui reste).

### 3. Ajouter la mise au point sur les deux taux

Dans la section analytique, ajouter une puce courte qui explique la
cohabitation. Formulation proposée, à ajuster au ton du panneau :

```tsx
// Le taux d'occupation de l'analytique se calcule sur les 14 places. Il ne
// depasse jamais 100 %. Celui du planning se calcule sur les 12 places
// client : il passe au-dessus de 100 % quand les places tampon sont prises.
// Le planning surveille le debordement, l'analytique mesure le remplissage.
```

Cette puce est le livrable principal de l'étape. Sans elle, l'écart entre les
deux écrans reste inexpliqué.

### 4. Rafraîchir un commentaire d'exemple

`src/lib/analytique/pdf.ts:195-205` cite « OCCUPATION » / « CAPTAGE » et
« OCC. » / « CAPT. » comme exemple de double libellé responsive. L'extraction
PDF lit le DOM et suit automatiquement les colonnes : aucun impact fonctionnel,
mais l'exemple devient trompeur. Le remplacer par un couple encore présent à
l'écran.

## Ordre d'exécution

1. Réécrire les lignes 686-696 de `ParkingHelpPanel.tsx`.
2. Supprimer la puce du captage et corriger le compte annoncé.
3. Ajouter la puce expliquant les deux taux.
4. Rafraîchir le commentaire de `pdf.ts`.
5. Relire la section entière à l'écran, panneau d'aide ouvert.
6. `npx tsc --noEmit`.
7. Commit.

## Critère de validation

- `grep -n "aptage" src/components/parking/ParkingHelpPanel.tsx` ne renvoie
  plus aucune ligne de la section analytique (lignes 685-728).
- Les mentions d'impayés et de « non payé » qui décrivent le **planning**
  (lignes 674-682, 715-720) sont toujours présentes : `grep -n "non payé"`
  renvoie encore ses lignes d'origine.
- La section analytique annonce quatre cartes, et l'écran en affiche quatre.
- Le nombre de points annoncé dans la phrase d'accroche correspond au nombre
  de puces réellement présentes.
- La puce sur les deux taux cite explicitement 14 places pour l'analytique et
  12 pour le planning.
- Le texte respecte les règles d'écriture du projet : phrases courtes,
  ponctuation simple, aucun tiret cadratin ni guillemets français.
