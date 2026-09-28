# Étape 5 — Cache du poste partagé : effacé au changement de compte

## Objectif

Fermer le trou n° 2 de l'audit : le cache des données est écrit sur le disque
du navigateur (`lib/queryPersist.ts`, 24 h), **sans distinction de compte et
sans effacement à la déconnexion** (vérifié le 2026-09-28). Avec des classeurs
réservés, B pourrait voir s'afficher depuis le cache un classeur lu par A sur
le même poste, avant que la base ne le refuse.

Le défaut dépasse le Classeur (toute page à droits différents par compte),
mais il ne devient une FUITE qu'avec des contenus réservés par personne.

## Fichier(s) impacté(s)

- `src/lib/queryPersist.ts`
- `src/components/auth/AuthContext.tsx`
- `src/lib/queryPersist.test.ts`, `queryPersist.integration.test.ts`

## Travail à réaliser

1. Mémoriser l'identifiant du compte propriétaire du cache (clé
   `bo.query.cache.owner`).
2. Au démarrage et à chaque changement d'utilisateur (`onAuthStateChange` :
   connexion d'un autre compte, `SIGNED_OUT`) : si le compte diffère du
   propriétaire → `queryClient.clear()` + suppression de la clé disque, AVANT
   tout rendu de données.
3. Déconnexion volontaire et éjection pour inactivité : même effacement.
4. Ne PAS effacer sur une simple erreur réseau ni sur `TOKEN_REFRESHED`
   (règles de résilience du projet : une panne ne vide jamais le cache).

## Critère de validation

- Test d'intégration : cache écrit par A, démarrage avec B → rien de A n'est
  restauré ; démarrage avec A → cache restauré.
- Panne simulée (erreur réseau) : cache intact.

## Contrôle /borg

- Le chemin d'éjection (`profiles` 0 ligne → `signOut`) efface aussi.
- Aucune régression du « cache de secours » pendant une panne pour le MÊME
  compte (raison d'être du cache persisté, panne du 2026-09-24).
