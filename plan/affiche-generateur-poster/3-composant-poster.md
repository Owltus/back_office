# Étape 3 — Rendu JSX de l'affiche A3

## Objectif

Convertir `Poster.update()` (rendu impératif DOM du fork) en composant React `Poster` qui reçoit l'état complet en props et produit l'arborescence de l'affiche. Les dimensions physiques (1123×1587px, padding 60×80px) et les styles typographiques doivent être conservés à l'identique pour la fidélité impression.

## Fichier(s) impacté(s)

- `src/components/affiche/Poster.tsx` (nouveau)

Sources fork : `assets/js/poster.js`, structure DOM de `index.html` (lignes 197-231), `assets/css/poster.css`.

## Travail à réaliser

### 1. Arborescence JSX

Reproduire l'arbre DOM du fork avec les classes sémantiques préfixées `poster-` (le CSS relève de l'étape 5) :

```tsx
<div className="poster" id="poster" style={{ backgroundColor, color, '--poster-bg': backgroundColor }}>
  {showIcon && (
    <div className="poster-zone-icon">
      <div className="poster-icon" style={{ color: iconColor }}
           dangerouslySetInnerHTML={{ __html: iconSvg }} />
    </div>
  )}
  <div className="poster-zone-content">
    <section className="poster-zone-section">
      <h1 className="poster-section-title">{titleFr}</h1>
      <Message text={messageFr} />
      {infoFr && <div className="poster-section-info">{/* <p> dates / horaires */}</div>}
    </section>
    {showEnglish && <div className="poster-divider">{/* .stars-container : 4 étoiles SVG */}</div>}
    {showEnglish && (
      <section className="poster-zone-section">
        <h1 className="poster-section-title">{titleEn}</h1>
        <Message text={messageEn} />
        {infoEn && <div className="poster-section-info">{/* From/On … */}</div>}
      </section>
    )}
  </div>
  <div className="poster-zone-footer">
    <PosterLogo colorKey={colorKey} textColor={color.text} />
  </div>
</div>
```

Props d'entrée : contenu (`titleFr, messageFr, titleEn, messageEn`), `selectedIcon`, `colorKey`, dates/heures formatées ou brutes, et les 4 tailles de police (`fontSizeIcon/Title/Message/Info`). Les tailles sont appliquées en `style={{ fontSize }}` inline sur titre/message/info ; la taille icône en `width/height` sur le SVG.

### 2. Champs dérivés (calculés, pas stockés)

- `showEnglish = titleEn.trim() !== '' || messageEn.trim() !== ''` — pilote la section EN ET le divider.
- `showIcon = selectedIcon !== 'none'`.
- `color = COLORS[colorKey]` ; `backgroundColor = color.bg` ; texte via `color.text` ; icône via `color.icon || color.text` ; divider et étoiles via `color.border`.

### 3. Rendu du message (`<Message>`)

Sous-composant privé. Selon l'arbitrage « rendu HTML » de l'index :
- Option A : `text.split('\n')` → intercaler des `<br />` (aucun `dangerouslySetInnerHTML`).
- Option B : `dangerouslySetInnerHTML={{ __html: text.replace(/\n/g, '<br>') }}` (colle au fork).

Le titre est rendu en texte simple (`textContent` dans le fork).

### 4. Infos dates/horaires

Reproduire la logique `_getDates`/`_getHours` + rendu du fork :
- FR : `dates.isRange` → `<p>Du {formatDateFr(start)} au {formatDateFr(end)}</p>` ; sinon start seul → `<p>Le {formatDateFr(start)}</p>`. Heures → `<p>{formatTimeFr(full)}</p>`.
- EN : `<p>From {…} to {…}</p>` / `<p>On {…}</p>` / `<p>{formatTimeEn(full)}</p>`.
- La zone info est masquée si vide.

### 5. Étoiles du divider

Reproduire les 4 « étoiles » (astérisques SVG, path fixe de `poster.js` lignes 209-213) dans un `.stars-container` centré, `stroke = color.border`. Le trait du divider utilise `currentColor` (= couleur du poster) ; le masque central `::before` utilise `var(--poster-bg)` (variable inline posée sur `#poster`).

### 6. Mise à l'échelle de l'aperçu (`adjustScale`)

Porter `adjustScale()` en hook React. Le poster garde ses dimensions physiques (1123×1587) ; un wrapper parent applique `transform: scale(optimalScale)` pour tenir dans le conteneur d'aperçu à l'écran. Implémentation : `useRef` sur le conteneur + `ResizeObserver` (recalcul au mount et au resize), `optimalScale = min(scaleW, scaleH, 1)` où `scaleW/H` = dimensions dispo / dimensions poster. À l'impression, ce transform est neutralisé (étape 5, `transform: none !important`).

## Ordre d'exécution

1. Squelette JSX + application des couleurs/tailles inline.
2. Champs dérivés (`showEnglish`, `showIcon`).
3. Sous-composant `Message` (selon arbitrage).
4. Rendu infos dates/horaires FR + EN.
5. Divider + étoiles.
6. Hook `adjustScale` (ResizeObserver).

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Le composant rend sans erreur avec l'état par défaut (template `coffee_broken`, couleur `okko`, mode auto).
- Section EN et divider apparaissent/disparaissent selon la présence de contenu EN.
- L'aperçu se met à l'échelle pour tenir dans le conteneur (vérifié à l'étape 6 une fois câblé).
