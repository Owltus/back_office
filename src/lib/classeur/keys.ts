/*
 * Clés TanStack Query de la page Classeur — SOURCE UNIQUE.
 *
 * Toutes commencent par 'classeur' : c'est ce préfixe qu'on invalide après
 * une mutation, et c'est lui que le cache persisté (`lib/queryPersist.ts`)
 * accepte d'écrire sur disque — aucune donnée nominative ici.
 *
 * Rappel (CLAUDE.md) : l'invalidation compare ÉLÉMENT PAR ÉLÉMENT.
 * `['classeur','chapters', 3]` n'est attrapée que par un préfixe exact
 * (`['classeur']`, `['classeur','chapters']`, ou la clé entière).
 */
export const classeurKeys = {
  all: ['classeur'] as const,
  /** Liste des classeurs (non supprimés). */
  list: () => ['classeur', 'list'] as const,
  /** Un classeur par identifiant. */
  one: (classeurId: number) => ['classeur', 'one', classeurId] as const,
  /** Chapitres (non supprimés) d'un classeur. */
  chapters: (classeurId: number) =>
    ['classeur', 'chapters', classeurId] as const,
  /** Un chapitre par identifiant. */
  chapter: (chapterId: number) => ['classeur', 'chapter', chapterId] as const,
  /** Les quatre familles d'éléments d'un chapitre. */
  items: (chapterId: number) => ['classeur', 'items', chapterId] as const,
  /** Tous les éléments d'un classeur (tableau de bord, recherche, export). */
  classeurItems: (classeurId: number) =>
    ['classeur', 'classeur-items', classeurId] as const,
  /** Référentiel des périodicités (staleTime: Infinity côté appelant). */
  periodicites: () => ['classeur', 'periodicites'] as const,
  /** Historique des fusions d'un classeur. */
  mergeHistory: (classeurId: number) =>
    ['classeur', 'merge-history', classeurId] as const,
  /**
   * Une image de document (Blob, bucket privé). Immuable (UUID dans le
   * chemin) ; jamais persistée : un Blob ne survit pas au JSON.
   */
  image: (chemin: string) => ['classeur', 'image', chemin] as const,
  /**
   * Versions d'un document. Portent des NOMS de collègues : exclues du
   * cache disque (`PREFIXES_SENSIBLES`, poste partagé).
   */
  versions: (documentId: number) =>
    ['classeur', 'versions', documentId] as const,
  /**
   * Accès par classeur (2026-09-28). Mes exceptions, celles d'un classeur
   * (gestion), la liste des personnes : identifiants et NOMS — exclues du
   * cache disque (`PREFIXES_SENSIBLES`), et propres au compte connecté.
   */
  mesAcces: (userId: string) => ['classeur', 'acces', 'miens', userId] as const,
  acces: (classeurId: number) =>
    ['classeur', 'acces', 'classeur', classeurId] as const,
  personnes: () => ['classeur', 'acces', 'personnes'] as const,
  /** Médiathèque d'un classeur (fiches `classeur_images`). */
  images: (classeurId: number) => ['classeur', 'images', classeurId] as const,
}
