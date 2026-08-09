# Plan — Retrait de l'envoi e-mail du PDJ

## Contexte

La livraison des e-mails PDJ vers la boîte okkohotels est un puits sans fond
(blocage silencieux côté tenant Microsoft, non résoluble depuis notre côté). Pour
simplifier, on RETIRE toute la notion d'e-mail de la partie PDJ — auto ET manuel,
bandeau, destinataires, test — en gardant INTACTS : la page PDJ (import In-House,
affichage, impression) et TOUT l'e-mail du Rep Jour.

Principe : on ne touche NI à l'import In-House (`pdj_breakfasts`), NI à l'impression
(CSS `printWithTitle`), NI à quoi que ce soit du Rep Jour. On retire uniquement le
chemin e-mail spécifique au PDJ.

## Angles à clarifier

- **Tables SQL `pdj_report_recipients` et `pdj_auto_send_log`** : un `DROP` est
  destructif. Par défaut on les LAISSE dormantes (le code n'y touche plus) ; script
  `DROP` fourni en option, à exécuter par toi si tu veux vraiment nettoyer la base.
- **Secrets `PDJ_REPORT_FROM` et `PDJ_TEST_NO_PDF`** : à retirer côté config
  (`supabase secrets unset …`) — action utilisateur, pas du code.
- Confirmer : la page PDJ garde bien import + affichage + impression (seul l'e-mail
  part). Oui, c'est le périmètre.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-edge-retrait-auto-pdj.md](./1-edge-retrait-auto-pdj.md) | Edge : retirer l'envoi AUTO du PDJ | — | P0 | 30min | Le pipeline n'envoie plus de PDJ | |
| 2 | [2-edge-send-report-repjour-only.md](./2-edge-send-report-repjour-only.md) | Edge : send-report redevient RepJour-only | — | P0 | 30min | Plus de chemin PDJ dans send-report | |
| 3 | [3-client-breakfastboard.md](./3-client-breakfastboard.md) | Client : retirer l'UI e-mail de la page PDJ | 2 | P0 | 1h | Page PDJ sans envoi/bandeau/destinataires | |
| 4 | [4-client-lib-pdj.md](./4-client-lib-pdj.md) | Client : nettoyer lib/pdj + services | 3 | P0 | 45min | Code e-mail PDJ supprimé, types gardés | |
| 5 | [5-validation-commits.md](./5-validation-commits.md) | Validation + commits (+ notes config/SQL) | 1,2,3,4 | P0 | 30min | tsc + deno + build OK, versionné | ⚠ |

## Ordre d'exécution

Séquentiel : 1 (edge auto) → 2 (edge manuel) → 3 (UI board) → 4 (lib client) → 5 (validation).
1 et 2 sont indépendants ; 3 dépend de 2 (le board n'appelle plus le manuel) ; 4 après 3.

## Architecture cible

```
PDJ : import In-House -> pdj_breakfasts -> affichage feuille -> IMPRESSION (CSS).
      (AUCUN e-mail : ni auto, ni bouton Envoyer, ni bandeau, ni destinataires.)
Rep Jour : INCHANGÉ (import + envoi auto + envoi manuel + bandeau + destinataires).
Module partagé send-mail.ts / businessDay.ts / SendStatusBanner / RecipientsModal :
      CONSERVÉS (le Rep Jour s'en sert), on retire juste les appels PDJ.
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers supprimés |
|--------|-------------------|--------------------|
| Edge (Deno) | `import-report/index.ts`, `send-report/index.ts` | `import-report/autoSendPdj.ts`, `_shared/pdj/render.ts`, `_shared/pdj/pdf.ts` |
| Client | `components/pdj/BreakfastBoard.tsx`, `lib/pdj/service.ts`, `lib/pdj/pdf.ts`, `lib/repjour/services/recipients.ts` | `lib/pdj/sendServer.ts`, `lib/pdj/reportHtml.ts` |
| SQL (option) | — | (optionnel) `pdj_report_recipients`, `pdj_auto_send_log` |

| **Total** | **~6 modifiés** | **~5 supprimés** |
