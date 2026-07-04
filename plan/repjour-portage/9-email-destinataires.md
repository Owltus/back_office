# Étape 9 — Email : destinataires, capture image, envoi

## Objectif

Porter l'envoi de rapports par email : construction de l'image du tableau via html2canvas, copie presse-papier, ouverture d'un `mailto:` pré-rempli, et gestion des destinataires (`RecipientsModal`). Gating admin.

## Contexte

C'est la brique la plus fragile techniquement. Contrainte majeure (D10) : html2canvas 1.4.1 ne sait pas parser les couleurs `oklch()` que Tailwind v4/shadcn génèrent. La source contourne cela avec un `buildTableElement` **autonome, entièrement en HEX inline**, rendu hors écran — il ne faut **jamais** pointer html2canvas sur le DOM shadcn. L'image envoyée par email reste volontairement en thème clair, indépendamment du dark de l'app. `clipboard.write` et `mailto:` peuvent être soumis à la CSP/permissions du Back Office : à valider.

## Fichier(s) impacté(s)

- `src/lib/repjour/email.ts` (nouveau — `sendReport`, `captureTableImage`, `buildTableElement` HEX, `escapeHtml`)
- `src/lib/repjour/services/recipients.ts` (nouveau — CRUD destinataires)
- `src/components/repjour/RecipientsModal.tsx` (nouveau — → `Dialog` shadcn)
- `src/components/repjour/boards/DashboardBoard.tsx` (modification : boutons « copier image » et « envoyer par email », admin)
- Sources fork : `src/lib/email.ts`, `src/services/recipients.ts`, `src/components/RecipientsModal.tsx`

## Travail à réaliser

### 1. `email.ts` avec îlot HEX préservé

Porter `email.ts` à l'identique en **conservant `buildTableElement` en HEX inline** (aucune classe Tailwind, aucun `oklch`). Conserver `escapeHtml` (anti-XSS), `captureTableImage` (html2canvas → `toBlob` → `ClipboardItem`), `sendReport` (capture + `mailto:` pré-rempli avec destinataires). Ne pas restyler cet élément en dark.

### 2. Service destinataires

Porter `services/recipients.ts` (`fetchRecipients`, `addRecipient`, `updateRecipient`, `deleteRecipient`) — écritures soumises RLS admin.

### 3. RecipientsModal

Porter la modale vers `Dialog` shadcn : liste to/cc, ajout inline, édition inline, toggle de type, suppression. Restyler le chrome en dark (mais pas l'image email).

### 4. Câblage dans le dashboard

Rebrancher les boutons « copier image » et « envoyer par email » de `DashboardBoard` (admin uniquement), qui appellent `captureTableImage` / `sendReport`.

## Ordre d'exécution

1. `email.ts` (îlot HEX).
2. `services/recipients.ts`.
3. `RecipientsModal`.
4. Câblage dashboard, typecheck, test manuel.

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `pnpm build` passe.
- La capture image fonctionne (pas de crash `oklch`) et produit une image lisible en thème clair.
- La copie presse-papier et l'ouverture `mailto:` fonctionnent, ou l'échec éventuel (CSP) est diagnostiqué et signalé.
- CRUD destinataires opérationnel (admin), soumis RLS.

## Contrôle /borg

Étape critique (écriture destinataires + contrainte technique oklch). Audit post-exécution :

- `buildTableElement` reste isolé en HEX inline ; html2canvas ne pointe jamais sur le DOM shadcn (aucune régression `oklch`).
- Les écritures se limitent au CRUD `email_recipients`, soumis RLS admin.
- `escapeHtml` est bien appliqué à toutes les valeurs injectées (pas de régression XSS).
- Aucune migration, aucun DDL.
