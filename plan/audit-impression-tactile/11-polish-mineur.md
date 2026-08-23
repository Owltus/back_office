# Étape 11 — Polish mineur de cohérence

## Objectif

Corriger une série de petites incohérences relevées par l'audit, sans
enjeu fonctionnel majeur mais qui contribuent au ressenti « pas pareil
d'une page à l'autre ».

## Fichier(s) impacté(s)

- `src/components/rapro/RaproBoard.tsx`
- `src/components/repjour/boards/DashboardBoard.tsx`
- `src/components/parking/ParkingBoard.tsx`
- `src/lib/print.ts`
- `src/components/affichage/AffichageBoard.tsx` (si le fichier existe sous
  ce nom — à vérifier, l'audit l'a référencé mais n'a pas été audité en
  détail par les 5 agents de ce chantier)

## Travail à réaliser

### 1. `aria-label` dynamiques (Rapro, RepJour)

`RaproBoard.tsx` et `DashboardBoard.tsx` ont un `ariaLabel` STATIQUE sur la
cellule tactile d'impression (`"Imprimer / PDF"`), alors que le `tipLabel`
souris équivalent est dynamique (explique pourquoi le bouton est désactivé
— « Clôturez… », « Aucune donnée… »). PDJ et Caisse font déjà cette
distinction dynamique des deux côtés. Aligner Rapro et RepJour sur ce
pattern : le `ariaLabel` tactile doit refléter la même condition que le
`tipLabel` souris.

### 2. Condition `disabled` de Parking (souris ET tactile)

Parking est le seul board où le bouton Imprimer n'a AUCUNE condition
`disabled` liée aux données (seulement `pdfBusy` après l'étape 1). Décider
avec l'utilisateur si une condition métier doit être ajoutée (ex. désactivé
s'il n'y a aucune réservation sur les 4 jours de la feuille) — NE PAS
ajouter de condition arbitraire sans validation, ce point est probablement
un choix produit délibéré (la feuille a un sens même vide, à compléter à la
main) plutôt qu'un oubli.

### 3. Réentrance de `printWithTitle` (`src/lib/print.ts`)

Point devenu plus important depuis D1 : `printWithTitle` n'est plus
utilisée que par PDJ, elle le sera désormais par 5 surfaces de plus
(Rapro/RepJour/Parking/Caisse/Analytique, étapes 3-7) — un défaut de
réentrance non corrigé se répercute maintenant sur 6 pages au lieu d'une.
`printWithTitle` pose un listener `afterprint` `{once:true}` et un
`setTimeout(restore, 1000)` sans jamais les annuler. Un double-tap peut
empiler deux listeners/timers, et aucun des 6 appelants n'a de garde
`pdfBusy` PENDANT l'appel synchrone à `printWithTitle()` lui-même (contrai-
rement au chemin jsPDF, qui lui a `pdfBusy`). Ajouter une garde simple (ex.
un flag module-level ou un `AbortController` réutilisé à chaque appel pour
annuler le timer précédent), directement dans `print.ts` — bénéficie aux 6
appelants sans les toucher individuellement.

### 4. `AffichageBoard` et `usePrintShortcut`

Le commentaire de `AffichageBoard.tsx:309` revendique un « portage du
pattern PDJ handlePrint », mais le fichier n'appelle jamais
`usePrintShortcut` — Ctrl+P y déclenche l'impression NATIVE (pas
`printWithTitle`), donc sans le nom de fichier PDF suggéré. Ajouter l'appel
manquant si le comportement voulu est bien celui décrit par le commentaire.

## Ordre d'exécution

1. `aria-label` dynamiques (rapide, sans risque).
2. `printWithTitle` réentrance.
3. `AffichageBoard` (vérifier d'abord que le fichier/la fonction existent
   sous ce nom).
4. Condition `disabled` Parking — SEULEMENT après validation utilisateur du
   comportement voulu.

## Critère de validation

- `npx tsc --noEmit`
- `npx vitest run`
- `npx pnpm build`
- Revue manuelle des libellés d'accessibilité sur Rapro/RepJour en mode
  tactile avec le bouton désactivé.
