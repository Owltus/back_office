# Étape 1 — Charpente « Affichage » et retrait de la barre

## Objectif

Rendre la page Facturation homogène avec la page Affichage : retirer complètement la barre d'en-tête (`PageHeader` — titre + sous-titre), et reconstruire la mise en page sur la charpente exacte d'`AffichageBoard` (trois panneaux en carte, **toujours rendus**, y compris à l'état vide, avec le même comportement responsive).

## Contexte

`AffichageBoard` n'utilise aucun `PageHeader` : la route rend seulement `<PageContainer printBleed fillHeight><Board/></PageContainer>`, et le board porte directement un conteneur `flex … flex-col gap-4 lg:flex-row lg:gap-6` avec trois enfants toujours présents. La page Facturation, elle, affiche une barre d'en-tête et ne montre les trois panneaux que lorsqu'une facture est chargée (sinon un grand dropzone centré). On aligne Facturation sur Affichage.

## Fichier(s) impacté(s)

- `src/components/facturation/FacturationBoard.tsx` (modification : retrait `PageHeader`, nouvelle charpente 3 panneaux toujours visibles)
- `src/components/facturation/InvoicePanel.tsx` (modification : état vide « aucune facture sélectionnée »)
- `src/routes/facturation.tsx` (modification mineure : parité `PageContainer` avec Affichage si nécessaire)

## Travail à réaliser

### 1. Retirer la barre d'en-tête

Supprimer le `PageHeader` (`title="Facturation"`, `meta="Prototype — lecture PDF…"`) et son import. Supprimer aussi le bouton d'action « Ajouter » de l'en-tête (le dépôt/clic passera par la dropzone gauche, étape 2).

### 2. Reprendre la charpente d'AffichageBoard

Conteneur racine du board calqué sur `AffichageBoard.tsx:264` :

```tsx
<div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
  {/* GAUCHE */}  <aside className="flex min-h-0 w-full shrink-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 lg:max-h-full lg:w-80 lg:overflow-y-auto" />
  {/* CENTRE */}  <section className="order-last flex min-w-0 flex-1 flex-col lg:order-none lg:min-h-0" />
  {/* DROITE */}  <aside className="flex min-h-0 w-full shrink-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 lg:max-h-full lg:w-80 lg:overflow-y-auto" />
</div>
```

Les trois enfants sont **toujours rendus** (plus de branche « état vide » qui masque les panneaux). La zone centrale garde son cadre d'aperçu (`rounded-xl border border-border bg-muted/30 p-3`, enfant `flex min-h-0 flex-1`) et affiche `StampPreview` si la facture sélectionnée est prête, sinon un `CenterPlaceholder` (spinner / erreur / invite « Déposez une facture »).

### 3. État vide homogène (D3, option A)

- Colonne gauche : contiendra la dropzone + la liste (étape 2) ; à vide, seule la dropzone est visible.
- Centre sans sélection : `CenterPlaceholder` avec une invite discrète (« Déposez une facture pour commencer »).
- Colonne droite (`InvoicePanel`) : si `record` absent, afficher un texte grisé (« Aucune facture sélectionnée ») au lieu du formulaire.

### 4. Route

Vérifier `src/routes/facturation.tsx` : conserver `ssr:false` + garde admin. Aligner le `PageContainer` sur Affichage (`fillHeight` déjà présent ; `printBleed` optionnel — sans effet hors impression, l'ajouter seulement pour parité stricte si souhaité).

## Ordre d'exécution

1. Retirer `PageHeader` + bouton « Ajouter » + imports inutiles.
2. Remplacer la charpente conditionnelle par les trois panneaux toujours rendus (classes ci-dessus).
3. Ajouter l'état vide du `InvoicePanel` et l'invite du `CenterPlaceholder`.
4. `npx tsc --noEmit`.

## Critère de validation

- Plus aucune barre/titre en haut de `/facturation`.
- À l'ouverture (aucune facture), les trois zones (gauche, centre, droite) sont visibles, en cartes, comme sur Affichage.
- Responsive : en dessous de `lg`, la zone centrale passe en bas (`order-last`) ; à partir de `lg`, trois colonnes en ligne.
- `npx tsc --noEmit` sans erreur.
