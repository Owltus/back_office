# Étape 6 — Rendu e-mail PDJ (nouveau)

## Objectif

Produire le contenu de l'e-mail PDJ. Aucun rendu réutilisable n'existe (le PDJ ne
fait aujourd'hui que de l'impression navigateur CSS).

## Qui

MOI.

## Décision liée

[C-CONTENU] : (a) totaux du jour seuls ; (b) totaux + liste chambres (RGPD) ;
(c) + PDF joint. **Ce fichier suppose (a) par défaut** (simple, sans PII, sans PDF)
et sera ajusté selon la réponse.

## Fichier(s)

- `src/lib/pdj/reportHtml.ts` (nouveau, fonction PURE — modèle : repjour/reportHtml.ts)
- copie Deno dans `supabase/functions/…` (pour l'envoi serveur)

## Travail à réaliser

1. Écrire `buildPdjEmail(data)` PUR (HTML inline, HEX, `escapeHtml`, responsive) sur
   le modèle de `reportHtml.ts` : un tableau/cartes des **totaux du service** —
   chambres occupées, clients, PDJ inclus, PDJ non inclus (potentiel), recouches,
   départs (les 6 tuiles déjà calculées par `stats`, BreakfastBoard.tsx:166-190).
2. `buildPdjDataFromDb(admin, serviceDate)` : agrège `pdj_breakfasts` du jour en ces
   totaux (réutilise la logique de `stats`).
3. Sujet : « OKKO Nantes centre-ville - PDJ du <date> ».
4. [si (b)] ajouter la liste par chambre en respectant la fenêtre RGPD (noms J/J-1).
5. [si (c)] créer `src/lib/pdj/pdf.ts` (jsPDF) — gros, à cadrer séparément.

## Critère de validation

- Sur un jour réel, le HTML PDJ affiche les bons totaux (cohérents avec l'écran PDJ).
- Aucune PII hors fenêtre RGPD (si liste nominative retenue).
