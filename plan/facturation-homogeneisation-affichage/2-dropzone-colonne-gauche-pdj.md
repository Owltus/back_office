# Étape 2 — Dropzone dans la colonne gauche, style PDJ

## Objectif

Déplacer le dépôt de PDF pour qu'il vive **uniquement dans la colonne de gauche**, en reprenant fidèlement le style de la dropzone de la page PDJ (composant partagé `EmptyCanvas` + classe `empty-canvas`). Retirer le dépôt « pleine page » (handlers de drag au niveau du board + voile de survol) mis en place précédemment.

## Contexte

La dropzone PDJ n'est pas un composant dédié : c'est `EmptyCanvas` (`src/components/shared/EmptyCanvas.tsx`) configuré en mode dropzone dans `BreakfastBoard.tsx:505-533`, avec un `<input type=file hidden>` séparé, un état `dragging`, et la classe `empty-canvas` (hachures 45°, définie dans `src/styles.css:157-165`). On réplique ce pattern côté Facturation, dans la colonne gauche, au-dessus de la liste des vignettes (`InvoiceList`).

## Fichier(s) impacté(s)

- `src/components/facturation/FacturationBoard.tsx` (modification : retrait des handlers de dépôt pleine page + voile ; ajout de la dropzone `EmptyCanvas` dans la colonne gauche)
- `src/components/facturation/InvoiceList.tsx` (modification mineure : cohabitation avec la dropzone dans la colonne, styles de vignettes)

## Travail à réaliser

### 1. Retirer le dépôt pleine page

Supprimer de `FacturationBoard` : `onDragOver`/`onDragLeave`/`onDrop` posés sur le wrapper racine, l'état `dragging` associé au board, et le `<div>` de voile absolu (`Déposez vos factures PDF`). Le dépôt ne se fait plus que dans la colonne gauche.

### 2. Dropzone EmptyCanvas dans la colonne gauche

Reproduire le pattern PDJ. `<input type=file hidden>` rendu une fois (référencé par `inputRef`), puis :

```tsx
<EmptyCanvas
  role="button"
  tabIndex={0}
  onClick={() => inputRef.current?.click()}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
  }}
  onDragOver={(e) => {
    e.preventDefault()
    setDragging(true)
  }}
  onDragLeave={() => setDragging(false)}
  onDrop={onDrop}
  className={cn(
    'empty-canvas cursor-pointer flex-col gap-3 p-6 text-center outline-none transition-colors',
    'hover:border-primary/60 hover:bg-secondary/30 focus-visible:ring-2 focus-visible:ring-ring',
    dragging && 'border-primary bg-secondary/40',
    hasRecords ? 'min-h-[140px]' : 'min-h-[340px]', // D2 option A : compacte si des factures
  )}
>
  <div className="rounded-full bg-secondary p-4">
    <FileUp className="size-8 text-muted-foreground" />
  </div>
  <div className="text-base font-medium">Glissez vos factures PDF ici</div>
  <div className="text-sm text-muted-foreground">
    un ou plusieurs .pdf — scan ou PDF natif, rien ne quitte votre navigateur
  </div>
</EmptyCanvas>
```

Imports à ajouter : `EmptyCanvas` (`#/components/shared/EmptyCanvas.tsx`), `FileUp` (lucide-react). La classe `empty-canvas` est déjà globale (aucun CSS à écrire).

### 3. Handlers de dépôt (repris de l'existant)

- `onDrop` : `e.preventDefault()`, `setDragging(false)`, `addFiles(e.dataTransfer.files)`.
- `onChange` de l'input : `addFiles(e.target.files)` puis `e.target.value = ''`.
- `addFiles` (déjà existant) filtre déjà `application/pdf` / `.pdf`, crée les records, sélectionne le premier, lance `process`. Le garder tel quel.

### 4. Colonne gauche = dropzone + liste

Structurer la colonne gauche (`<aside>` de l'étape 1) : la dropzone en haut (`shrink-0`), puis `InvoiceList` en dessous (défilement interne si beaucoup de factures — la colonne a déjà `lg:overflow-y-auto`). Adapter `InvoiceList` pour s'empiler verticalement dans la colonne (il gère déjà `lg:flex-col`).

## Ordre d'exécution

1. Retirer handlers de dépôt pleine page + voile + `DropTarget`/prompt de l'ancien état vide.
2. Ajouter l'`<input>` caché + la dropzone `EmptyCanvas` dans la colonne gauche.
3. Empiler `InvoiceList` sous la dropzone.
4. `npx tsc --noEmit`.

## Critère de validation

- Déposer un PDF **sur la dropzone gauche** l'ajoute ; déposer ailleurs sur la page ne fait plus rien (dépôt limité à la colonne gauche).
- La dropzone reprend visuellement le style PDJ (bordure pointillée `rounded-2xl`, hachures `empty-canvas`, pastille ronde + `FileUp`, états hover et « dragging »).
- Cliquer la dropzone ouvre le sélecteur de fichiers ; accessible au clavier (Enter/Espace).
- La liste des vignettes s'affiche sous la dropzone et reste utilisable.
- `npx tsc --noEmit` sans erreur.
