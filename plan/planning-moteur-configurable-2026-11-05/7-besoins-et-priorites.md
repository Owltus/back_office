# Étape 7 ⚠ — Page Besoins refaite et importance des postes

## Objectif

D4 et D11 : « retravailler la page Besoins avec d'autres paramètres » ; « les hôteliers sont plus importants sur les postes de Club et Réception ou la nuit, tu dois pouvoir configurer l'importance des postes ».

## Dépend de

Étapes 1 et 4. D11 à trancher avant.

## Faits établis

- `effectif` (à tenir) et `renfort` (en plus si besoin) existent par case ; `soutien` = places apprentis.
- L'importance de l'accueil est aujourd'hui IMPLICITE : postes cochés « Accueil », `POSTE_ID_ACCUEIL`, coûts plus lourds dans le générateur.
- Quand il manque du monde, la case reste vide (D3 = A, gardé).

## Fichier(s) impacté(s)

- `src/components/planning/parametres/BesoinsPage.tsx`, `besoins/GrilleBesoins.tsx`, `besoins/TableauAccueil.tsx`
- `src/lib/planning/generateur.ts`, `verificateur.ts`, `semaine.ts`, `presence.ts`
- Migration d'ajout : `planning_postes.importance`, `planning_besoins.obligatoire`, `planning_besoins.niveau_min`, `planning_postes.fermeture`

## Travail à réaliser

1. **Importance du poste** (D11, tranchée : trois niveaux) : Indispensable / Important / Si possible. Défauts : Réception, Club, Veille de nuit = Indispensable ; Direction = Si possible. L'ordre de ce qui reste vide en premier se DÉDUIT de l'importance.
2. **Obligatoire / souhaité** par besoin. Un souhaité reste vide avant un obligatoire.
3. **Niveau demandé** par besoin : titulaire exigé, dépannage accepté, soutien en plus. Rappel D9 : un apprenti ou stagiaire titulaire ou en dépannage compte comme autonome ; en soutien, jamais seul.
4. **Ouverture et fermeture** du poste, au même endroit que ses besoins.
5. **Passation entre équipes** (D8) : continuité OBLIGATOIRE (la suivante commence au plus tard quand la précédente finit) ; croisement de X minutes = préférence (l'actuelle relève).
6. Le texte « Dans quel ordre le planning décide » est GÉNÉRÉ depuis ces réglages.
7. Les défauts reproduisent exactement l'hôtel d'aujourd'hui.

## Critère de validation

- Empreinte `generateur.test.ts` et banc décembre identiques avec les défauts.
- Test : à manque égal, un poste « Si possible » reste vide avant un « Indispensable ».
- Test : une continuité impossible à tenir donne un point « À vérifier », jamais un modèle impossible.

## Contrôle /borg

Migration d'ajout seule, RLS des colonnes, aucune règle d'importance lue ailleurs que par `lireRegles`.
