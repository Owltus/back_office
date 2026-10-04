# Étape 7 — Copier ou déplacer vers un autre classeur ⚠

## Objectif

« Déplacer vers… » (menu d'un élément et barre de sélection) propose aussi
les chapitres des AUTRES classeurs où l'utilisateur a le droit d'écriture,
avec deux actions : **Déplacer** et **Copier**.

## Pourquoi c'est délicat

- **Images** : une image appartient à son classeur (dossier
  `<classeurId>/…`, contrainte `chemin ↔ classeur_id`, droits par classeur).
  Un document déplacé qui garde ses chemins afficherait « image
  indisponible » à un lecteur qui n'a pas accès au classeur d'origine. →
  Copier les images utilisées dans le classeur d'arrivée (fichier d'affichage
  ET original, nouvelle fiche), réécrire les chemins du texte (angle n° 3).
- **Droits** : écriture requise sur les DEUX classeurs (lire l'origine,
  écrire l'arrivée) ; la base le vérifie déjà par la RLS des deux côtés.
- **Historique** : un document déplacé garde ses versions (le trigger
  `classeur_versions_suivent` suit le chapitre — vérifier qu'il suit aussi
  le changement de classeur). Une copie repart en V 1.0, historique vide.

## Fichier(s) impacté(s)

- `src/lib/classeur/transfert.ts` (nouveau, pur + test) : plan de transfert
  (images à copier, réécriture des chemins via `remplacementImage`).
- `src/lib/classeur/service.ts` : `copierImageVersClasseur`, `moveItems`
  étendu ou `transfererItems` ; points de restauration des DEUX classeurs.
- `src/components/classeur/…` : menu « Déplacer vers… » groupé par classeur.
- Éventuellement `supabase/classeur_transfert_<date>.sql` (si une fonction
  côté base est nécessaire pour copier un objet Storage sous RLS) — écrit et
  commité AVANT d'être joué.

## Critère de validation

- Tests purs : chemins réécrits, images non utilisées non copiées, image
  utilisée deux fois copiée une fois.
- Vérification de bout en bout : à faire PAR L'UTILISATEUR (écriture réelle :
  CLAUDE.md, l'assistant ne teste pas les écritures applicatives contre la
  prod) ; l'assistant vérifie en lecture avant/après.

## Contrôle /borg

- Aucune image orpheline ni chemin cassé après un transfert interrompu
  (ordre : copier les images, PUIS écrire le document, PUIS supprimer à
  l'origine en cas de déplacement).
- La RLS des deux classeurs est respectée (pas d'écriture via un droit
  d'un seul côté).
