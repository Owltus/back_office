# Étape 8 — Harmoniser la gestion d'erreur du chemin souris (jsPDF)

## Objectif

Faire en sorte qu'aucun des mécanismes jsPDF restants côté SOURIS (Rapro,
Parking, Analytique) n'avale une erreur en silence. Portée réduite par
rapport à la version initiale de cette étape : depuis la décision D1, le
chemin TACTILE de ces 5 surfaces n'utilise plus jsPDF/`window.open` du tout
(remplacé par `printWithTitle()`, étapes 3-7) — cette étape ne concerne donc
plus que le chemin SOURIS, qui reste inchangé par ce chantier mais dont la
robustesse mérite d'être alignée pendant qu'on est dans ces fichiers.

## Contexte

État actuel constaté par l'audit :
- RepJour (`DashboardBoard.tsx:456-459`) et Caisse (`CaisseBoard.tsx:781-782`)
  affichent déjà un message d'erreur clair côté souris.
- Rapro (`RaproBoard.tsx:710-712`) a un `catch {}` VIDE côté souris, commenté
  « Silencieux : l'impression est un confort, pas un flux critique » — à
  reconsidérer.
- Parking n'a AUCUN `try/catch` avant l'étape 1 de ce plan (qui l'introduit
  pour le chemin souris).
- `AnalytiqueShell`'s chemin souris (`printAnalytique(...)` sans
  `printWindow`, inchangé par D1) n'a ni `try/catch` ni `.catch()`.

## Fichier(s) impacté(s)

- `src/components/rapro/RaproBoard.tsx`
- `src/components/analytique/AnalytiqueShell.tsx`
- (Parking et RepJour/Caisse déjà couverts par l'étape 1 et l'état actuel —
  vérifier seulement la cohérence du LIBELLÉ du message.)

## Travail à réaliser

### 1. Rapro : remplacer le `catch` vide par un message (chemin souris)

```ts
} catch {
  setActionError("L'aperçu d'impression n'a pas pu s'ouvrir. Réessaie.")
} finally {
  setPdfBusy(false)
}
```
(vérifier le nom exact de l'état d'erreur déjà utilisé ailleurs dans
`RaproBoard.tsx` et le réutiliser).

### 2. `AnalytiqueShell` : ajouter une gestion d'erreur au chemin souris

```ts
async function handlePrintPdf() { // renommé par l'étape 7
  try {
    await printAnalytique(root, printTitle) // plus de printWindow, souris uniquement
  } catch {
    // message à afficher — vérifier s'il existe déjà un mécanisme de
    // notification dans AnalytiqueShell avant d'en créer un
  }
}
```

## Ordre d'exécution

1. Rapro (simple, message à remplacer).
2. `AnalytiqueShell` (vérifier d'abord s'il existe un mécanisme de message à
   réutiliser avant d'en écrire un).

## Critère de validation

- `npx tsc --noEmit`
- `npx vitest run`
- `npx pnpm build`
- Test manuel SOURIS uniquement (le tactile ne passe plus par ce chemin
  depuis les étapes 3-7) : simuler un échec (bloquer temporairement l'import
  dynamique de `jspdf`) — un message doit s'afficher, jamais un échec muet.
