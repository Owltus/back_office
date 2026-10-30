# Contrat de la vague 1 (fixé par l'orchestrateur le 2026-10-30)

Les quatre lots travaillent en même temps dans le même dépôt. Ce contrat dit
ce que chacun fournit aux autres. Base : commit 7e9a566 (vague 0).

## 1. Présence (lot A, `presence.ts`)

- `periodePresence(poste, horaire, debut, nuitComptee = false)` : nouvel
  argument FACULTATIF (les appelants actuels ne changent pas).
  - middle → `null` (D11) ; court → selon l'heure de début, comme avant ;
  - matin, soir : seulement si `poste.presence` (inchangé) ;
  - nuit : code de famille `nuit` (ou horaire libre de nuit) ET
    `nuitComptee === true` (le poste a au moins un code de famille nuit,
    calculé par l'appelant) ; `poste.presence` n'est pas regardé (D15).
- `periodeShift` inchangé (sert à l'équité).

## 2. Créneaux remplaçants (lot C produit, lot B consomme)

- id `r<besoinId>-<horaireId>`, `place: 'b<besoinId>'`, `effectif: 0`,
  `facultatif: 0`, `soutien: 0`, `typeShift` = id du code remplaçant,
  `presence` = `periodePresence(…, nuitComptee)` du code remplaçant,
  `ferme: false`, bornes, pause, raccourci du code remplaçant.
- Un remplaçant : autre code permis du poste (`codesDuPoste`), MÊME cycle
  (`cycleDe`) que le code du besoin ; middle seulement pour un middle ; un code
  sans famille (`periode === null`) n'a jamais de remplaçant et n'en est jamais
  un. Aucun code ajouté ou modifié.
- Les créneaux `b…` gardent `place: null`.

## 3. Moteur (lot B, `generateur.ts`)

- Groupe de couverture : pour chaque `b`, les autonomes de `b` et de tous les
  `r` dont `place === b.id` comptent ensemble ; un seul manque par `b` ; total
  ≤ effectif + facultatif de `b`. Les `r` n'ont pas de contrainte propre.
- Un créneau dont `place !== null` est un remplaçant : coût
  `POIDS_REMPLACANT` (≈ 2 000, option A, D16) par affectation, en plus de
  `coutDepannage` si la personne est en dépannage. Ordre D13 figé par test.
- Minimum par cycle (consignes, nuit comprise) : manque au niveau P1 (D7),
  coût séparé du maximum (P2). `presenceLaPlusChere` ne relit que le maximum.
- TROU ENTRE ÉQUIPES (définition commune B et D) : pour chaque poste dont
  `presence` est vrai et chaque jour, la PLAGE va du début du premier besoin
  (`b…`, place non vide) à la fin du dernier besoin de ce poste ce jour-là ;
  à chaque quart d'heure de la plage, il faut au moins UNE personne autonome
  présente sur ce poste (middle compris, soutien non compté, shifts posés
  compris). Un quart d'heure à zéro = un trou. Moteur : variable de trou par
  quart d'heure, coût P2, jamais une contrainte dure.
- Relève : bonus faible (P5), facultatif ; à documenter.

## 4. Oracle (lot D, `verificateur.ts`, `cycles.ts`)

- `manquants` et SUREFFECTIF comptent par `c.place ?? c.id`.
- `trousDuJour` dans `cycles.ts` : même définition qu'au 3, écrite sans rien
  reprendre du générateur ; minutes réelles (`temps.ts`), nuit du dimanche,
  changement d'heure.
- Recompte des minimums par cycle (consignes) sans le générateur.

## 5. Assemblage (lot C, `semaine.ts`)

- `correspondances` en deux passes (code exact puis même poste, jour, cycle) ;
  épinglés d'abord ; soutien sur place de soutien ; un code sans famille par
  code exact seulement. Un shift rattaché par cycle reçoit
  `code_demande = horaire_id du besoin`.
- `preparerGeneration` crée les `r…` (§2) ; `traduire` les relit avec le code
  réel et `code_demande`.
- `presenceDe` passe `nuitComptee` (le poste a un code de nuit).
- `APourvoirOut` : raisons calculées sur le code imposé ET les remplaçants.

## Règles de travail en parallèle

- Chaque lot ne modifie QUE ses fichiers (`10-essaim.md`, propriété).
- Pendant la vague, `tsc` peut montrer des erreurs dans les fichiers d'un
  autre lot : ne les corrige pas, ne regarde que les tiennes.
- Tests : seulement les fichiers de ton lot (`npx vitest run <tes fichiers>`).
  Si ton test a besoin du travail d'un autre lot, construis l'entrée à la main
  (un `Probleme`, des `Creneau`).
- Pas de commit, pas de prod, pas de `db:reset`.
