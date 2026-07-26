# Étape 6 — Durcissement des Edge Functions (B1, B2, B4)

## Objectif

Fermer les écarts basse gravité des Edge Functions (toutes déjà admin-only et
correctement gardées) : empêcher la suppression d'un autre admin / du dernier admin
(B1), plafonner les entrées de `send-report` (B2), restreindre le CORS `*` à l'origine
de l'app (B4).

## Fichier(s) impacté(s)

- `supabase/functions/delete-user/index.ts` (garde anti-suppression d'admin)
- `supabase/functions/send-report/index.ts` (plafonds taille + validation `pdfName`)
- `supabase/functions/_shared/cors.ts` (nouveau : origine allowlistée)
- `supabase/functions/create-user/index.ts` (consomme `_shared/cors`)

## Travail à réaliser

### 1. B1 — `delete-user` : protéger les admins

Après la garde admin et le blocage de l'auto-suppression (`:94`), avant `deleteUser` :

```ts
// Refuser de supprimer un autre admin (et donc le dernier admin).
const { data: target } = await admin
  .from('profiles').select('role').eq('id', targetId).single()
if (target?.role === 'admin') {
  return json(403, { error: 'Impossible de supprimer un compte administrateur.' })
}
```

> Documenter l'impact cross-app assumé (la suppression retire aussi `auth.users`).

### 2. B2 — `send-report` : plafonds + validation

Avant l'envoi (`:100-103`, `:136-144`) :

```ts
if (typeof pdfName !== 'string' || !/^[\w .-]+\.pdf$/i.test(pdfName))
  return json(400, { error: 'pdfName invalide' })
if (pdfBase64 && pdfBase64.length > 8_000_000)   // ~6 Mo décodés
  return json(413, { error: 'Pièce jointe trop volumineuse' })
if ((htmlBody?.length ?? 0) > 200_000 || (subject?.length ?? 0) > 300)
  return json(413, { error: 'Contenu trop volumineux' })
```

### 3. B4 — CORS restreint (partagé)

Créer `_shared/cors.ts` avec une allowlist d'origines (prod Vercel + previews +
`localhost` dev), renvoyant les en-têtes CORS uniquement si l'`Origin` est autorisée ;
sinon pas d'`Access-Control-Allow-Origin`. Les 3 fonctions l'importent au lieu de
`'*'` en dur. (Non exploitable en CSRF — auth par Bearer — mais durcissement par
principe.)

## Ordre d'exécution

1. Écrire `_shared/cors.ts`, l'importer dans les 3 fonctions.
2. Ajouter la garde B1 (delete-user) et les plafonds B2 (send-report).
3. Utilisateur : déployer les 3 Edge Functions.

## Critère de validation

- Un admin tentant de supprimer un autre admin reçoit 403 (compte jetable).
- `send-report` avec `pdfName` = `../evil` ou pièce > plafond → 400/413.
- Une requête depuis une origine non listée ne reçoit pas d'en-tête CORS permissif ;
  l'app en prod fonctionne toujours (création/suppression/envoi).
