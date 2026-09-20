# Étape 3 — Sortir la police du chemin critique

## Objectif

Supprimer la dernière requête **tierce et bloquante** avant le premier pixel.

## Contexte

`src/routes/__root.tsx:44-53` charge Inter par `<link rel="stylesheet">` vers
`fonts.googleapis.com`, précédé des `preconnect` réglementaires.

La règle du projet — « jamais d'`@import url()` dans le CSS » — est **respectée**,
et l'audit du bundle l'a confirmée. Mais la respecter ne suffit pas : un
`<link rel="stylesheet">` reste **bloquant pour le rendu**. Les `preconnect`
réduisent la latence d'établissement de connexion, ils ne suppriment pas le
blocage ; `display=swap` ne concerne que le fichier `.woff2`, pas la feuille CSS
qui le déclare.

Conséquence concrète dans un hôtel : réseau filtrant, portail captif, DNS lent →
**écran blanc jusqu'au timeout réseau du navigateur**, soit plusieurs dizaines de
secondes, et de façon totalement intermittente. C'est exactement le profil décrit
par l'utilisateur.

Voir l'angle **D3** de l'index : l'option retenue conditionne le travail ci-dessous.

## Fichier(s) impacté(s)

- `src/routes/__root.tsx` (modifié)
- `public/fonts/` (nouveau, option A uniquement)
- `src/styles.css` (modifié, option A uniquement : déclaration `@font-face`)
- `vercel.json` (modifié, option A uniquement : retrait des domaines Google de la CSP)

## Travail à réaliser

### Option A — auto-héberger Inter (recommandée)

1. Récupérer les deux graisses réellement utilisées (vérifier lesquelles avant de
   télécharger : `grep -rn "font-weight" src/styles/` et la déclaration de
   `font-family` dans `src/styles.css`). Format `woff2` uniquement, sous-ensemble
   latin.
2. Les déposer dans `public/fonts/`.
3. Déclarer les faces dans `src/styles.css`, en tête :

```css
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/inter-latin-400.woff2') format('woff2');
}
```

4. Retirer les `preconnect` et le `<link>` de `__root.tsx:44-53`.
5. Ajouter un `<link rel="preload" as="font" type="font/woff2" crossorigin>` sur
   la graisse du texte courant — le fichier étant de même origine, il ne bloque
   plus rien et arrive plus tôt.
6. **Resserrer la CSP** dans `vercel.json` : retirer `https://fonts.googleapis.com`
   de `style-src` et `https://fonts.gstatic.com` de `font-src`. Gain de sécurité
   gratuit, et preuve que plus rien ne sort vers Google.

⚠ `routes/affichage.tsx` charge Poppins de la même manière pour l'affiche A3.
Cette page est utilisée ponctuellement et son chargement n'est pas critique :
**la laisser telle quelle** et ne pas retirer Google de la CSP tant qu'elle en
dépend — sinon l'affiche perdra sa police sans le dire. Soit on traite Poppins
dans la même étape, soit on garde `fonts.gstatic.com` dans la CSP. Trancher au
moment de l'exécution, ne pas casser l'affiche.

### Option B — garder Google Fonts, sans bloquer

Une seule modification dans `__root.tsx` :

```tsx
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Inter..."
  media="print"
  onLoad={(e) => { e.currentTarget.media = 'all' }}
/>
```

Le navigateur télécharge la feuille sans la considérer comme bloquante, puis
l'applique une fois arrivée. Moins de travail, mais la dépendance à un tiers
demeure : si `fonts.gstatic.com` est filtré, le texte s'affiche en police de repli
— ce qui est un dégradé acceptable, à l'inverse de l'écran blanc actuel.

## Ordre d'exécution

1. Trancher D3.
2. Appliquer l'option retenue.
3. Vérifier que l'affiche A3 (`/affichage`) rend toujours en Poppins.
4. `pnpm build`
5. `npx tsc --noEmit`

## Critère de validation

- Dans l'onglet Réseau, **aucune requête bloquante vers un domaine tiers** avant
  le premier pixel.
- Le texte de l'app s'affiche en Inter, sans saut visible de police au chargement.
- `/affichage` rend toujours l'affiche en Poppins.
- Option A : la CSP de `vercel.json` ne mentionne plus `fonts.googleapis.com` en
  `style-src` — ou, si Poppins est conservée, la raison est écrite en commentaire.
- Test décisif, le seul qui compte vraiment : bloquer `fonts.googleapis.com` dans
  les DevTools et recharger. **L'app doit s'afficher normalement.** Aujourd'hui,
  elle reste blanche.
