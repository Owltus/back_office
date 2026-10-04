# Étape 9 — PDF direct ⚠ (conditionnée à la décision D19)

## Objectif

Répondre au besoin réel derrière « télécharger directement un PDF ».

Deux voies existent déjà :
- la carte « Exporter PDF » de l'accueil (`ClasseurDashboard.tsx` l.373) ;
- le choix « Enregistrer en PDF » du navigateur, qui produit un PDF
  VECTORIEL : texte net et cherchable.

## Dépend de

- L'étape 4 (`selectionImpression.ts`).
- L'étape 8 : le zoom doit être neutralisé pendant une capture.
- La décision D19, puis D5 et D20 selon la voie choisie.

## Faits établis

- **html2canvas n'est pas installé** (CLAUDE.md est périmé sur ce point).
  Sa version 1.4.1 ne lit pas les couleurs `oklch` de Tailwind v4 (voir
  `lib/repjour/reportHtml.ts` l.14) et gère mal le `zoom` CSS.
- `printViaIframe` n'attend ni les images, ni Mermaid, ni la mesure de
  pagination.
- On ne sait pas si html2canvas rend le `foreignObject` des schémas Mermaid.

## Voies

| | D19 = A : bon nom, fenêtre du navigateur | D19 = B, voie navigateur | D19 = B, voie serveur |
|---|---|---|---|
| Ce qu'on fait | `<title>` du document imprimé = « Classeur - Titre », plus une aide « Enregistrer en PDF » | Chaque `.a4-page` capturée en image, puis assemblée avec jsPDF | Fonction Vercel avec un Chrome sans écran |
| Texte | vectoriel, cherchable | en image | vectoriel |
| Poids | léger | ~300 à 800 ko par page | léger |
| Dépendance nouvelle | aucune | un équivalent de html2canvas qui lit `oklch` | `@sparticuz/chromium` + `puppeteer-core` |
| Sécurité | rien de nouveau | rien de nouveau | la fonction reçoit votre jeton (D20) |
| Effort | 1 h | 5 h | 1,5 jour |

## Fichier(s) impacté(s)

- **A** : `src/lib/classeur/print/buildPrintHtml.ts` (`<title>`) et l'aide.
- **B, voie navigateur** : `src/lib/classeur/print/pdfDirect.ts` (chargé par
  `import()` dynamique), `PrintPreview.tsx`, `package.json`.
- **B, voie serveur** : `api/pdf.ts`, `vercel.json`.

## Phase de test /martin

- **A** : `buildPrintHtml.test.ts` vérifie un `<title>` attendu, écrit à la
  main, y compris pour des titres avec `/`, `:` et des guillemets.
- **B, voie navigateur** :
  - `pnpm build` prouve que la librairie reste hors du chunk d'entrée ;
  - nombre de pages du PDF = nombre de `.a4-page`. L'oracle compte les pages
    dans le DOM, et le PDF est relu par `pdf-lib`.
- **B, voie serveur** :
  - refus sans jeton (401) ;
  - jamais `service_role` ;
  - testée seulement sur une prévisualisation Vercel, jamais en production.
- **Utilisateur** : comparaison à l'œil avec « Enregistrer en PDF ».

## Critère de validation

- Même nombre de pages que l'aperçu, rien de rogné, images présentes.

## Contrôle /borg

- Voie serveur : aucun secret dans le client, aucune clé côté serveur au-delà
  du jeton de l'utilisateur, CSP `connect-src` inchangée.
- Voie navigateur : le chunk reste dynamique et le zoom est remis à 1 pendant
  la capture.
