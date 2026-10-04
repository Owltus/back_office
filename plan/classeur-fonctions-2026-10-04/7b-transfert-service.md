# Étape 7b — Transfert : service et correction de `moveItems` ⚠

## Objectif

Exécuter le plan de 7a de façon sûre. Corriger au passage un défaut
EXISTANT de `moveItems`.

## Dépend de

L'étape 7a, et la décision D21 (comment tester les droits en écriture).

## Faits établis

- **Déplacer** (`update chapter_id`) : la base vérifie les DEUX classeurs. La
  condition `USING` porte sur l'origine, `WITH CHECK` sur l'arrivée.
  `classeur_versions_suivent` fait suivre l'historique au document (D8).
- **Copier** : il suffit d'avoir l'insert sur l'arrivée et la lecture sur
  l'origine (D6). La version fournie par le client est acceptée à l'insert,
  donc on envoie 1.0 explicitement. On n'envoie pas `uuid`.
- **Images** : `storage.from('classeur-images').copy(src, dst)` passe sous la
  RLS (lecture de l'origine, insert `webp` sur l'arrivée). Ne jamais passer
  `upsert`, car il n'existe pas de policy UPDATE. Aucune RPC n'est
  nécessaire (D7).
- **Défaut existant** : `moveItems` ne voit pas un refus RLS (0 ligne, aucune
  erreur) et n'appelle `avantEcriture` que sur l'arrivée.

## Fichier(s) impacté(s)

- `src/lib/classeur/service.ts` : `copierImageVersClasseur`, `transfererItems`,
  `moveItems` corrigé.
- `src/lib/classeur/keys.ts` : invalidation des DEUX classeurs.
- `src/components/classeur/hooks/useClasseur.ts` : mutation.
- Éventuellement `supabase/classeur_transfert_<date>.sql`, seulement si un
  essai en local (D21 = A) prouve qu'il faut une fonction côté base. Le
  fichier est commité AVANT d'être joué, après confirmation.

## Travail à réaliser

1. **`moveItems`** :
   - ajouter `.select('id')` ;
   - lever une erreur si moins de lignes que demandé ;
   - appeler `avantEcriture` sur l'origine ET sur l'arrivée.
2. **`copierImageVersClasseur(image, arrivee)`** :
   - copier le fichier d'affichage et l'original (`original_* = null` est
     toléré) ;
   - créer la fiche `classeur_images` (`<arrivée>/<nouvel uuid>.webp`) ;
   - si la fiche échoue, retirer les fichiers copiés (jamais d'orphelin).
3. **`transfererItems`** : suit le plan de 7a.
   - images, puis document, puis origine ;
   - un échec arrête tout et retire les copies de cette opération ;
   - l'état reste restaurable par les deux points pris en tête.

## Implications propres

- Points de restauration sur les deux classeurs, avant toute écriture.
- Invalidation de `classeurKeys` pour les deux classeurs.
- Un transfert interrompu ne laisse jamais de chemin cassé dans un document
  écrit.

## Phase de test /martin

- **Simulateur avec une panne injectée à chaque pas.** On croise pas × type
  de refus en pairwise, et on vérifie toujours exhaustivement les cas de
  refus. Invariants contrôlés après chaque scénario :
  - aucun document écrit ne référence un fichier absent ;
  - aucune fiche n'existe sans son fichier, aucun fichier copié sans sa fiche ;
  - les points de restauration des deux classeurs sont pris avant la première
    écriture ;
  - un refus RLS à l'arrivée n'écrit rien à l'origine ;
  - un refus à l'origine (déplacement) retire les copies faites à l'arrivée ;
  - `moveItems` refusé produit une erreur visible, plus jamais un succès
    annoncé.
- **Mutations** :
  - inverser l'ordre images / document ;
  - retirer `.select('id')` ;
  - retirer l'`avantEcriture` de l'origine ;
  - passer `upsert: true`.
- **Droits en écriture (D21)** :
  - **A** : base locale (`supabase start`, schéma relevé en lecture par
    `supabase db dump --linked --schema public,private,storage`), matrice
    `verif_transfert_classeur.sql` dans une transaction annulée, 3 mutations
    de policy détectées ;
  - **B** : lecture du catalogue seulement (`pg_policies`, `pg_proc`,
    `pg_trigger`).
  - **JAMAIS** de transaction annulée sur la production.
- **Utilisateur** : un transfert réel. L'assistant compare en lecture, avant
  et après, les fiches, les objets Storage, les chemins et l'historique.

## Critère de validation

- Simulateur vert, mutations attrapées, `pnpm test` et `npx tsc --noEmit`
  verts.

## Contrôle /borg

- Aucune image orpheline et aucun chemin cassé après un transfert interrompu.
- La RLS des deux classeurs est respectée : aucune écriture ne repose sur le
  droit d'un seul côté pour un déplacement.
- Aucune régression sur le déplacement entre chapitres d'un même classeur,
  qui passe désormais par le `moveItems` corrigé.
