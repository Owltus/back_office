# Étape 1 — Parking : garde-fous manquants sur l'impression

## Objectif

Aligner `ParkingBoard.tsx` sur le pattern déjà appliqué à Rapro/RepJour/Caisse :
un état `pdfBusy` qui désactive le bouton pendant la génération, une gestion
d'erreur qui ne laisse jamais un onglet vide orphelin sans explication, et un
garde sur le raccourci Ctrl+P.

## Contexte

Trois agents d'audit indépendants (boards, pdf.ts, boutons) ont convergé sur
le même constat : `ParkingBoard.handleGeneratePdf` (`ParkingBoard.tsx:790-840`)
est le SEUL des 4 boards jsPDF sans état `pdfBusy`, sans `try/catch`, et sans
`disabled` sur son bouton d'impression (souris ET tactile). Conséquence
concrète : un double-tap tactile (probable, vu l'absence de feedback pendant
les 4 requêtes réseau + rasterisation PMR) ouvre plusieurs `window.open('',
'_blank')` concurrents — un seul onglet recevra le PDF, les autres restent
des pages blanches orphelines — et toute erreur devient une unhandled promise
rejection totalement silencieuse.

## Fichier(s) impacté(s)

- `src/components/parking/ParkingBoard.tsx`

## Travail à réaliser

### 1. État `pdfBusy`

Ajouter `const [pdfBusy, setPdfBusy] = useState(false)` près des autres états
du composant (même emplacement relatif que dans `CaisseBoard.tsx`/
`RaproBoard.tsx`).

### 2. `try/catch/finally` autour de `handleGeneratePdf`

```tsx
async function handleGeneratePdf() {
  if (pdfBusy) return
  setPdfBusy(true)
  const printWindow = isTouchDeviceNow() ? window.open('', '_blank') : null
  try {
    // ... logique existante (fetchPdjDay, construction des jours, matchRoom) ...
    await printParkingSheets({ days }, `Feuille_parking_${stamp}`, printWindow)
  } catch (err) {
    setActionError(
      "L'aperçu d'impression n'a pas pu s'ouvrir. Réessaie.",
    )
  } finally {
    setPdfBusy(false)
  }
}
```

Réutiliser `actionError`/le mécanisme d'affichage d'erreur déjà présent dans
le fichier (`ParkingBoard.tsx` a déjà un état d'erreur pour les actions du
planning — vérifier son nom exact et le réutiliser plutôt que d'en créer un
nouveau, pour rester cohérent avec le reste du fichier).

### 3. `disabled` sur les deux boutons

- `PrintButton` (souris, `~ParkingBoard.tsx:1432-1436`) : ajouter
  `disabled={pdfBusy}`.
- `ToolbarCell` (tactile, `~ParkingBoard.tsx:2014-2019`) : ajouter
  `disabled={pdfBusy}`.

### 4. Garde sur le raccourci clavier

`usePrintShortcut(() => void handleGeneratePdf())` (`~ParkingBoard.tsx:841`)
→ `usePrintShortcut(() => { if (!pdfBusy) void handleGeneratePdf() })`, ou
laisser le guard `if (pdfBusy) return` en tête de `handleGeneratePdf`
suffire (auquel cas ne pas dupliquer la condition ici) — choisir la même
convention que Rapro/Caisse/RepJour pour ce point précis (vérifier laquelle
des deux ils utilisent et répliquer à l'identique).

## Ordre d'exécution

1. Ajouter l'état `pdfBusy`.
2. Envelopper le corps de `handleGeneratePdf` dans `try/catch/finally`.
3. Ajouter `disabled={pdfBusy}` aux deux boutons.
4. Sécuriser le raccourci clavier.

## Critère de validation

- `npx tsc --noEmit`
- `npx vitest run`
- `npx pnpm build`
- Vérification manuelle du diff : le bouton Imprimer de Parking (souris et
  tactile) doit maintenant avoir un `disabled` cohérent avec les 3 autres
  boards jsPDF, et `handleGeneratePdf` ne doit plus jamais lever une
  exception non interceptée.
