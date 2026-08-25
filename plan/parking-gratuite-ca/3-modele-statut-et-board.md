# Étape 3 — Modèle de statut + board

## Objectif

Ajouter `'gratuite'` au type `Status` et au board : le menu contextuel de
sélection et la légende visuelle affichent automatiquement le nouveau
statut, sans code additionnel à ces deux endroits (les deux itèrent déjà sur
`STATUS_ORDER`).

## Fichier(s) impacté(s)

- `src/lib/parking/model.ts` (modifié)
- `src/components/parking/ParkingBoard.tsx` (modifié)

## Travail à réaliser

### 1. Étendre le type `Status`

`src/lib/parking/model.ts:32` :

```ts
export type Status = 'reserve' | 'paye' | 'checkout' | 'employe' | 'gratuite'
```

### 2. Ajouter l'entrée dans `STATUS` et `STATUS_ORDER`

`src/components/parking/ParkingBoard.tsx:165-198` — ajouter une entrée
`gratuite` au record `STATUS` (teinte `sky`, cf. « Angles à clarifier » de
l'index — pas de collision avec les quatre teintes existantes) :

```ts
gratuite: {
  label: 'Gratuité',
  border: 'border-sky-500/50',
  fill: 'bg-sky-500/15',
  text: 'text-sky-700 dark:text-sky-100',
  dot: 'bg-sky-500',
},
```

Puis l'ajouter à `STATUS_ORDER` (position : après `employe`, dernière
position — cohérent avec l'ordre d'introduction des statuts dans le temps) :

```ts
const STATUS_ORDER: Status[] = ['reserve', 'paye', 'checkout', 'employe', 'gratuite']
```

Le menu contextuel (`ContextMenuRadioGroup` / `ContextMenuRadioItem`,
`ParkingBoard.tsx:2258-2270`) et la légende (`ParkingBoard.tsx:1906-1937`)
itèrent tous deux sur `STATUS_ORDER.map(...)` — aucune autre modification
requise pour qu'ils affichent « Gratuité ».

### 3. Vérifier `setStatus` (aucun changement de comportement attendu)

`setStatus` (`ParkingBoard.tsx:1094-1114`) ne déclenche la modale de motif
obligatoire QUE pour `status === 'checkout'` — `gratuite` s'applique
directement, sans modale, comme `reserve`/`paye`/`employe` aujourd'hui
(cohérent avec « Angles à clarifier » : pas de justification exigée par
défaut). Ne rien changer ici sauf si l'utilisateur demande explicitement
qu'un motif soit requis pour « gratuité ».

## Ordre d'exécution

1. Modifier `model.ts` (type `Status`).
2. Modifier `ParkingBoard.tsx` (`STATUS`, `STATUS_ORDER`).
3. Lancer `pnpm dev`, ouvrir `/parking`, clic droit sur une place → vérifier
   que « Gratuité » apparaît dans le menu contextuel avec le point bleu ciel,
   et dans la légende sous la grille.

## Critère de validation

- `npx tsc --noEmit` : vert (le type `Status` élargi ne casse aucun
  `switch`/`Record<Status, ...>` exhaustif ailleurs dans le code — TypeScript
  signalerait toute exhaustivité manquante).
- Menu contextuel d'une place : 5 options visibles (Réservé, Payé, Non payé,
  Employé, Gratuité), sélectionner « Gratuité » écrit `status: 'gratuite'`
  en base (nécessite le SQL de l'étape 1 déjà exécuté par l'utilisateur pour
  que l'écriture réussisse — sinon la contrainte SQL la rejette).
- Légende sous la grille : 5 puces de couleur, dans le même ordre que le
  menu.
- Aucune régression visuelle sur les 4 statuts existants (couleurs, ordre).
