# Étape 5 — CSS écran et impression A3 fidèle au fork

## Objectif

Ajouter une section `poster-*` dans `src/styles.css` reproduisant fidèlement le CSS de l'affiche du fork (`poster.css`) et surtout ses règles d'impression (`print.css` : A3 portrait sans marge, couleurs exactes, échelle réelle). Le chrome (panneau) reste dans le thème sombre Tailwind ; l'affiche reste blanche en Poppins, à l'identique du fork. Ne rien faire fuir entre écran et impression, sur le patron `.pdj-doc`.

## Fichier(s) impacté(s)

- `src/styles.css` (ajout d'une section dédiée en fin de fichier)

Sources fork : `assets/css/poster.css`, `assets/css/print.css`.

## Travail à réaliser

### 1. Chargement de Poppins

Selon l'arbitrage « Poppins » de l'index (Option A recommandée) : importer Poppins 400/600/800 en tête de `styles.css` (à côté de l'import Inter existant). L'algorithme de dimensionnement est calé sur cette police ; l'affiche doit la conserver quel que soit le thème Inter du chrome.

### 2. CSS écran de l'affiche

Recopier les valeurs exactes du fork (hors couleurs, propagées en inline depuis React) :

```css
.poster {
  width: 1123px; height: 1587px;      /* A3 96 DPI, dimensions figées */
  background: white; font-family: 'Poppins', sans-serif;
  display: flex; flex-direction: column;
  padding: 60px 80px; position: relative; flex-shrink: 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact;
}
.poster-zone-icon { text-align: center; margin-bottom: 20px; padding-top: 10px; flex-shrink: 0; }
.poster-icon svg { width: 140px; height: 140px; stroke-width: 1.5; opacity: 0.9; }
.poster-zone-content { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; padding-top: 10px; min-height: 0; }
.poster-zone-section { text-align: center; padding: 30px 60px; display: flex; flex-direction: column; justify-content: center; gap: 25px; flex: 1; min-height: 0; }
.poster-section-title { font-weight: 800; line-height: 1.1; text-transform: uppercase; letter-spacing: 3px; overflow-wrap: break-word; hyphens: none; margin: 0; }
.poster-section-message { font-weight: 400; line-height: 1.6; overflow-wrap: break-word; hyphens: none; margin: 0; max-width: 90%; margin-left: auto; margin-right: auto; text-align: justify; text-align-last: center; }
.poster-section-info { font-weight: 600; line-height: 2; margin: 0; margin-top: 20px; }
.poster-section-info p { margin: 5px 0; }
.poster-divider { position: relative; height: 2px; background: currentColor; opacity: 0.75; margin: 40px 120px; }
.poster-divider::before { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 90px; height: 30px; background: var(--poster-bg, white); }
.poster-zone-footer { text-align: center; padding-top: 40px; flex-shrink: 0; opacity: 0.5; margin-top: auto; }
.poster-zone-footer svg { height: 100px; width: auto; }
```

Les tailles de police du titre/message/info ne sont PAS fixées ici (injectées en inline par React). Ne pas remplacer les px par des unités mm/relatives.

### 3. Aperçu écran (wrapper + fond)

À l'écran uniquement (`@media screen`, pour ne pas fuir en print) : le fond du passe-partout et l'ombre portée du poster. Le `transform: scale()` de l'aperçu vit sur le wrapper (posé en inline par le hook `adjustScale`), pas ici.

```css
@media screen {
  .poster-preview { /* conteneur d'aperçu : fond, centrage, overflow */ }
  .poster-wrapper { box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
}
```

### 4. Bloc `@media print` (priorité fidélité — recopier `print.css`)

```css
@media print {
  .poster, .poster * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  @page { size: A3 portrait; margin: 0; }        /* A3, aucune marge (# fork) */
  .poster-wrapper { transform: none !important; box-shadow: none; }  /* échelle réelle 100% */
  .poster { box-shadow: none; page-break-after: avoid; page-break-inside: avoid; }
  /* masquer tout le chrome à l'impression : géré côté React par print:hidden sur le panneau */
}
```

Points impératifs (identiques au fork) : `@page { size: A3 portrait; margin: 0 }`, neutralisation du `transform` d'aperçu (`transform: none !important`), `print-color-adjust: exact !important`, `page-break-inside/after: avoid`. Combiné aux 1123×1587px, l'affiche remplit exactement la page A3.

### 5. Non-fuite écran/impression

- Le fond gris du passe-partout, l'ombre, le scale d'aperçu → `@media screen` uniquement.
- Le panneau de contrôle → `print:hidden` (Tailwind) côté React (étape 4), redondé si besoin par `display: none` en print.
- Rien de la section `.poster-*` ne doit affecter les autres pages (scope par préfixe de classe).

## Ordre d'exécution

1. Import Poppins.
2. CSS écran de l'affiche (`.poster*`).
3. Wrapper/fond d'aperçu (`@media screen`).
4. Bloc `@media print` (recopie de `print.css`).
5. Vérification non-fuite.

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `/affichage` répond (HTTP 200).
- Aperçu écran : affiche blanche en Poppins mise à l'échelle dans un passe-partout sombre, panneau à gauche.
- Ctrl+P : format A3 portrait, panneau absent, affiche à taille réelle remplissant la page, couleurs/fonds imprimés, pas de coupure.
- Les autres pages (PDJ, parking…) restent visuellement inchangées.
