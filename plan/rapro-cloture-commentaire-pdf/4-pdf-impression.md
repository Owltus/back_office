# Étape 4 — Impression PDF

## Objectif

Générer un **document PDF simple** du rapprochement du jour, ouvert directement dans la fenêtre d'impression du navigateur (aucun téléchargement), via le bouton **Imprimer** visible une fois la feuille clôturée.

## Contexte

Patron répliqué **à l'identique** : `src/lib/caisse/pdf.ts` (`printCaisseSheet` → import dynamique de jsPDF, `pdf.autoPrint()`, iframe caché recyclé) et son câblage dans `CaisseBoard` (`handleGeneratePdf`, état `pdfBusy`, `PrintButton iconOnly`). jsPDF est chargé en **`import()` dynamique** (lib lourde, hors du premier rendu — convention perf du projet). L'`id` de l'iframe doit être **`rapro-print-frame`** (ne pas collisionner avec `caisse-print-frame`).

Données disponibles côté `RaproBoard` : `statuses` (Map chambre→statut), `occupied` (Set), compteurs (`countStats`), `FLOORS`, `STATUS_LABEL`, `selectedDate` (titre long FR déjà formaté), `comment`, `sheet.validatedAt`.

## Fichier(s) impacté(s)

- `src/lib/rapro/pdf.ts` (nouveau)
- `src/components/rapro/RaproBoard.tsx` (modifié — handler + import)

## Travail à réaliser

### 1. Module `src/lib/rapro/pdf.ts`

```ts
import type { jsPDF } from 'jspdf'

import { STATUS_LABEL } from '#/lib/rapro/constants.ts'
import { FLOORS, ROOM_COUNT } from '#/lib/rapro/rooms.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

export interface RaproPdfData {
  titleDate: string
  statuses: ReadonlyMap<number, RoomStatus>
  occupied: ReadonlySet<number>
  counts: { sold: number; clean: number; todo: number; refus: number; noshow: number }
  comment: string
  validatedAt: string | null
}

export async function printRaproSheet(
  data: RaproPdfData,
  title: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  pdf.setProperties({ title })
  renderRaproDocument(pdf, data)
  pdf.autoPrint()
  const blobUrl = pdf.output('bloburl').toString()
  document.getElementById('rapro-print-frame')?.remove()
  const iframe = document.createElement('iframe')
  iframe.id = 'rapro-print-frame'
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  iframe.src = blobUrl
  document.body.appendChild(iframe)
}
```

### 2. `renderRaproDocument` — mise en page simple (A4 portrait, mm)

Reprendre les primitives caisse (`setFont`/`setFontSize`/`setTextColor`, `text`, `rect`, `line`, `splitTextToSize`) et le flux vertical `let y`. Sections proposées (mise en page libre) :

1. **En-tête** centré : titre « RAPPROCHEMENT DES CHAMBRES » (petit) + `titleDate` (grand, gras) ; trait de séparation.
2. **Bandeau de synthèse** : une ligne de compteurs — Vendues `counts.sold`, Nettoyées `counts.clean`, Non nettoyées `counts.todo`, Refus `counts.refus`, No-show `counts.noshow` (texte simple, ou petits cadres `rect`).
3. **Par étage** : pour chaque `FLOORS`, un titre « Étage N » puis la liste des chambres avec leur statut. Version simple et lisible : **ne lister que les chambres à signaler** (non nettoyées / refus / no-show), la couleur ou le libellé (`STATUS_LABEL`) à côté du numéro ; les non vendues sont ignorées ou grisées. (Alternative : grille compacte de pastilles colorées — au choix, tant que ça tient sur une page.)
4. **Commentaire** : cadre pleine largeur (`rect` + `splitTextToSize`).
5. **Pied** : « Clôturé le {validatedAt formaté} » si présent.

Contrainte : tenir sur **une page A4**. Avec 80 chambres, préférer « lister uniquement les anomalies » (2) pour rester compact, ou des pastilles multi-colonnes par étage.

### 3. Câblage dans `RaproBoard`

```ts
const [pdfBusy, setPdfBusy] = useState(false)
async function handleGeneratePdf() {
  setPdfBusy(true)
  try {
    const [y, m, d] = selectedDate.split('-')
    await printRaproSheet(
      {
        titleDate: title,
        statuses,
        occupied,
        counts: { sold: occupied.size, clean: stats.clean, todo: stats.todo, refus: stats.refus, noshow: stats.noshow },
        comment,
        validatedAt: sheet?.validatedAt ?? null,
      },
      `Rapprochement_${d}-${m}-${y}`,
    )
  } catch {
    // afficher un message d'erreur léger si besoin
  } finally {
    setPdfBusy(false)
  }
}
```

Le bouton `PrintButton iconOnly` est déjà posé à l'étape 3 (visible si `isValidated`).

## Ordre d'exécution

1. Créer `src/lib/rapro/pdf.ts` (`printRaproSheet` + `renderRaproDocument`).
2. Câbler `handleGeneratePdf` + `pdfBusy` dans `RaproBoard`.
3. `npx tsc --noEmit` puis test d'impression sur un jour clôturé.

## Critère de validation

- Sur un jour **clôturé**, le bouton Imprimer ouvre la **fenêtre d'impression du navigateur** (pas de téléchargement, pas de popup bloquée).
- Le PDF tient sur **une page A4** et affiche : date, compteurs de synthèse, chambres à signaler par étage, commentaire, et « Clôturé le … » si dispo.
- Aucun import **statique** de `jspdf` (uniquement `import type` + `await import('jspdf')`).
- `id` d'iframe = `rapro-print-frame` (pas de collision avec la caisse).
- `npx tsc --noEmit` vert.
