# Étape 4 — UI page, états vides, modales

## Objectif

Clarifier les messages hors flux d'import : états vides et de chargement de la page,
distinction « aucune donnée » vs « échec de chargement », alertes natives brutes
(`window.alert` / `confirm`) humanisées, échecs silencieux (aperçu PDF, copie d'image),
et tutoiement partout (corriger le vouvoiement résiduel).

## Contexte

Piège identifié à la reconnaissance : `RecipientsModal` colore ses messages en rouge via
`message.includes('Erreur')` (l.279). Si on change les textes d'erreur sans toucher ce
couplage, la couleur casse. À traiter dans la même étape (drapeau d'état explicite
plutôt que test sur le texte).

## Fichier(s) impacté(s)

- `src/components/repjour/boards/DashboardBoard.tsx`
- `src/components/repjour/RecipientsModal.tsx`
- `src/components/repjour/ProtectedRoute.tsx`

## Travail à réaliser

### 1. `DashboardBoard.tsx` — états vides / chargement / échec

| Ligne(s) | Avant | Après |
|----------|-------|-------|
| 566-568 | `Aucun rapport importé pour le ${date}. Importez-le ci-dessous.` | `Le rapport du ${date} n'a pas encore été chargé. Charge-le ci-dessous.` |
| 575-577 | `Aucun rapport ni prévision n'a été importé pour cette date.` | `Aucun rapport ni prévision pour cette date.` |

Échec de CHARGEMENT distinct de « aucune donnée » (l.205-214, `reportError` aujourd'hui
seulement `console.error` puis retombe sur l'état vide) : afficher un message dédié.

```tsx
// Nouveau : si la LECTURE a échoué (pas juste vide), le dire.
// Bloc distinct de l'état vide (l.570) :
Impossible de charger le rapport. Vérifie ta connexion et réessaie.
```

### 2. `DashboardBoard.tsx` — alertes natives et catch silencieux

| Ligne(s) | Avant | Après |
|----------|-------|-------|
| 252-255 | `window.alert('Suppression impossible : ' + err.message)` | Message humanisé via l'UI (bandeau/état), pas d'`alert` natif : `La suppression a échoué. Réessaie dans un instant.` (+ `console.error`) |
| 398-410 | `catch {}` silencieux (aperçu PDF) | Note d'échec discrète : `L'aperçu d'impression n'a pas pu s'ouvrir. Réessaie.` |
| 435-437 | `serverNote = 'Erreur inattendue : ' + err.message` | `L'envoi a échoué. Réessaie dans un instant.` (+ `console.error`) |

Confirmation de suppression (l.783-784) : déjà claire, conservée.

### 3. `RecipientsModal.tsx` — messages + découpler la couleur du texte

| Ligne(s) | Avant | Après |
|----------|-------|-------|
| 98-99 | `Adresse email invalide` | `Cette adresse email n'est pas valide.` |
| 107 | `Destinataire ajouté` | (conservé) |
| 133 | `Mis à jour` | (conservé) |
| 110, 136 (catch) | `err.message` brut | `Une erreur s'est produite. Réessaie.` (+ `console.error`) |
| 141 | `confirm('Supprimer ce destinataire ?')` | texte conservé (voir Angle à clarifier : remplacement modale optionnel) |

Découplage couleur : remplacer le test `message.includes('Erreur')` (l.279) par un état
explicite, ex. `messageTone: 'error' | 'success' | null`, posé au moment où le message
est défini. Sinon les nouveaux textes sans le mot « Erreur » s'afficheraient en vert.

### 4. `ProtectedRoute.tsx` — tutoiement

| Ligne(s) | Avant | Après |
|----------|-------|-------|
| 37-39 | `Aucun rôle attribué à ce compte` | `Aucun rôle n'est attribué à ton compte` |
| 40-43 | `Votre compte est connecté mais n'a pas de profil actif. Contactez un administrateur pour obtenir un accès à cette section.` | `Ton compte est connecté mais n'a pas encore de profil actif. Demande un accès à un administrateur.` |

## Ordre d'exécution

1. `DashboardBoard.tsx` (§1 puis §2).
2. `RecipientsModal.tsx` (§3, ne pas oublier le découplage couleur).
3. `ProtectedRoute.tsx` (§4).

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- La page `/repjour` répond (HTTP 200).
- Revue visuelle : état « aucune donnée » vs « échec de chargement » distincts ; plus
  de `window.alert` brut à la suppression ; messages destinataires colorés correctement
  (rouge sur erreur réelle, vert sur succès) ; tutoiement partout.
