# Étape 10 — Validation globale et documentation

## Objectif

Mettre à jour DESIGN.md pour refléter le déploiement du système responsive sur
les 5 domaines (plus seulement Rapro), et valider l'ensemble du chantier.

## Contexte

DESIGN.md affirme actuellement : « Consommé aujourd'hui uniquement par les
deux vues Rapprochement… les 8 autres pages du socle n'ont pas ce mode ; ne pas
présumer qu'elles l'ont sans vérifier le code. » Cette phrase devient fausse
dès la première page portée (étape 2) — sa correction est différée à cette
étape finale pour n'écrire qu'une seule fois l'état consolidé des 5 domaines,
plutôt que de la retoucher à chaque étape intermédiaire.

## Fichier(s) impacté(s)

- `DESIGN.md`

## Travail à réaliser

### 1. Mettre à jour la section « Barre d'outils basse mobile »

Remplacer la mention « consommé aujourd'hui uniquement par les deux vues
Rapprochement » par la liste réelle des domaines portés à l'issue de ce
chantier (RepJour, PDJ, Caisse, Parking, Rapprochement — préciser lesquels
parmi les 10 pages analytique au total l'ont, si le chantier n'a pas tout
couvert). Documenter le nouveau socle partagé (`useResponsiveShell`,
`MobileToolbar`) comme LE mécanisme de référence, avec Rapro cité comme
première implémentation (non refactorisée dessus, cf. `00-INDEX.md`) et les 4
autres domaines comme consommateurs directs.

### 2. Documenter les décisions D1/D2/D3

Une ligne courte par domaine dans la section pertinente de DESIGN.md (ex. sous
« Barre d'outils basse mobile » ou dans une note dédiée) : ce qui a été
tranché pour l'automode PDJ, la navigation shift Caisse, la séparation
densité/édition Parking — pour qu'un futur chantier ne redécouvre pas ces
arbitrages depuis zéro.

### 3. Validation globale

```bash
npx tsc --noEmit
npx vitest run
npx pnpm build
npx pnpm lint
```

## Ordre d'exécution

1. Mettre à jour DESIGN.md (§1, §2).
2. Lancer la suite de validation complète (§3).
3. Revue manuelle des 5 domaines (RepJour/PDJ/Caisse/Parking/Rapro), à la
   souris ET sur tactile réel ou émulé — les trois paliers déjà établis cette
   session (mobile, tablette 768-1024px, desktop) pour chacun.

## Critère de validation

- `npx tsc --noEmit` : aucune erreur.
- `npx vitest run` : 428 tests (ou plus) verts.
- `npx pnpm build` : succès.
- `npx pnpm lint` : aucune nouvelle alerte introduite par ce chantier.
- DESIGN.md reflète fidèlement l'état réel du code (pas de description d'un
  état qui n'existe pas), conformément à la discipline suivie tout au long de
  cette session.
- Aucune régression sur `RaproBoard.tsx` (non touché) ni sur les composants
  partagés déjà utilisés par des pages hors périmètre (Facturation, Affichage,
  Literie).

## Contrôle qualité (revue)

Étape marquée critique (validation globale de fin de chantier). `/borg` non
installé, revue manuelle ciblée :

- Relire le diff complet du chantier (les ~16 fichiers modifiés + 2 nouveaux)
  en confirmant qu'aucune branche nouvelle ne s'active par défaut pour des
  pages hors périmètre (Facturation, Affichage, Literie, Comptes/Gestion).
- Confirmer qu'aucun test des domaines hors périmètre n'a de comportement
  différent après ce chantier.
