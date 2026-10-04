# Étape 9 — Télécharger le PDF ⚠

## Objectif

Un bouton **Télécharger le PDF** dans l'aperçu d'impression (élément,
chapitre, sélection, modifications, classeur complet) qui produit un fichier,
sans passer par la fenêtre d'impression du navigateur.

## Choix technique à trancher (angle n° 1 de l'index)

| | A. Navigateur (images) | B. Serveur (Chrome sans écran) |
|---|---|---|
| Fidélité | bonne à l'œil, texte en IMAGE | identique à « Enregistrer en PDF », texte vectoriel |
| Texte sélectionnable / recherche | non | oui |
| Poids | ~300 – 800 ko par page | ~50 – 200 ko par page |
| Images privées | déjà chargées dans la page | la fonction doit les lire avec le jeton de l'utilisateur |
| Mise en œuvre | `html2canvas` (déjà présent, chargé à la demande) + `jspdf` (déjà utilisé par /caisse) | fonction Vercel `@sparticuz/chromium` + `puppeteer-core`, taille et durée à surveiller |
| Maintenance | aucune côté serveur | une fonction serveur de plus |

## Fichier(s) impacté(s) (voie A)

- `src/lib/classeur/print/pdfDirect.ts` (nouveau) : page par page, chaque
  `.a4-page` → canvas (échelle 2) → page A4 jsPDF ; chargé par `import()`
  dynamique (règle CLAUDE.md : grosses librairies hors du chunk d'entrée).
- `src/components/classeur/print/PrintPreview.tsx` : bouton, état « Création
  du PDF… (page 3 / 12) », nom de fichier `<classeur> - <titre>.pdf`.

## Fichier(s) impacté(s) (voie B)

- `api/pdf.ts` (fonction Vercel) + `vercel.json` (durée, mémoire)
- passage du jeton Supabase, CSP `connect-src` inchangée (même origine)

## Critère de validation

- Le PDF a le même nombre de pages que l'aperçu, rien de rogné, images
  présentes ; comparé visuellement à « Enregistrer en PDF ».
- Voie A : chunk dynamique vérifié par `pnpm build`.
