# Plan — Accès PAR CLASSEUR (des droits dans les droits de page)

## Contexte

Aujourd'hui (depuis le 2026-09-26, modèle « Affichage ») : tout compte qui a
accès à la page Classeur **voit tous les classeurs** ; `ecriture` crée des
classeurs et ne modifie que **les siens** ; `gestion` (et l'admin, que
`private.get_page_level` traite comme `gestion`) fait tout.

Demande utilisateur (2026-09-28) : pouvoir régler l'accès **classeur par
classeur**, avec plusieurs niveaux, révocables à tout moment par un
gestionnaire de la page ou un admin. Audit de la réflexion fait avec
l'utilisateur ; décisions ci-dessous, **toutes validées par lui**.

État relevé en base le 2026-09-28 : 3 classeurs (Registre de Sécurité,
Procédures de la réception, Documentation Technique), tous créés par l'admin ;
**aucun compte non admin n'a de droit sur la page Classeur**. La bascule ne
retire donc rien à personne.

---

## Règles validées

### Le niveau effectif sur un classeur

**Niveau effectif = le plus petit de (droit sur la PAGE, droit sur le
CLASSEUR)** — sauf `gestion` / admin, qui voient et font tout.

| Droit sur le classeur ↓ / sur la page → | lecture | ecriture | gestion (et admin) |
|---|---|---|---|
| aucun | ne voit pas | ne voit pas | tout |
| lecture | lit | lit | tout |
| ecriture | lit (plafonné) | modifie | tout |

Le droit sur le classeur se lit, par ordre de priorité :

1. une **exception** pour cette personne (`aucun`, `lecture` ou `ecriture`) —
   dans les DEUX sens : elle peut ouvrir OU retirer (y compris au créateur) ;
2. sinon, être le **créateur** → `ecriture` ;
3. sinon, l'**accès pour tous** du classeur (`aucun`, `lecture`, `ecriture`).

Conséquences voulues :
- rien à réécrire quand un droit de PAGE change : le plafond s'applique seul ;
- un droit sur un classeur ne donne jamais plus que le droit de page.

### Création et partage

- Créer un classeur : droit `ecriture` sur la page (inchangé).
- Nouveau classeur : **écriture pour le créateur, lecture pour tous** par
  défaut. L'option **« Privé »** (accès pour tous = aucun) n'est proposée à la
  création qu'à la gestion et à l'admin.
- Le créateur **ne partage pas** : seuls la gestion et l'admin ouvrent,
  étendent ou retirent des accès.

### Ce que l'écriture ne permet PAS (réservé gestion / admin)

| Action | ecriture | gestion / admin |
|---|---|---|
| Chapitres, documents, images, titres, réordonner le contenu | oui | oui |
| Point de restauration manuel | oui | oui |
| Restaurer un point (écrase tout le classeur) | non | oui |
| Supprimer le classeur (douce ou physique) | non | oui |
| Vider les points de restauration | non | oui |
| Gérer les accès (accès pour tous, exceptions) | non | oui |
| Réordonner la LISTE des classeurs | non | oui |

### Bascule

Tous les classeurs existants : **accès pour tous = lecture**, créateurs en
écriture (tous admin aujourd'hui).

### Points de l'audit retenus sans discussion

- **Sécurité en base partout** : classeurs, chapitres, éléments, médiathèque,
  points de restauration (ils contiennent une copie complète), historique des
  versions, fichiers du stockage d'images.
- **Cache du poste partagé** effacé à chaque changement de compte.
- Compte « Réception » partagé : accepté tel quel.
- Lecture = peut copier (imprimer, exporter) : accepté.
- Classeur orphelin (créateur supprimé, plus personne en écriture) : gestion
  seule, signalé dans l'interface.
- Lien vers un classeur interdit : « accès refusé » propre.
- Chaque changement d'accès est journalisé (`audit_log`).
- Pas de droits par chapitre.

---

## Angles à clarifier

- **Restaurer un point** : une restauration n'est qu'une suite d'écritures
  ordinaires (fusion en remplacement). La base ne sait pas distinguer
  « restaurer » de « modifier à la main ». Le blocage pour `ecriture` sera
  donc **dans l'interface** seulement. Ce n'est pas une élévation de droits
  (la même personne peut déjà tout modifier à la main), mais c'est à savoir.
  Alternative lourde, NON retenue : réserver la lecture des instantanés à la
  gestion par une RPC (casserait les points automatiques pris par les
  comptes `ecriture`).
- **Liste des personnes** dans le dialogue d'accès : un gestionnaire non
  admin ne peut pas lire les profils des autres (RLS de `profiles`). Il faut
  une RPC privilégiée (étape 2) qui ne rend que prénom, nom et droit de page
  des comptes ayant accès à la page Classeur — jamais l'e-mail.

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-base-modele.md](./1-base-modele.md) | Table des accès, colonne « accès pour tous », calcul du niveau effectif | — | P0 | 2h | SQL écrit et commité | ⚠ |
| 2 | [2-base-rls.md](./2-base-rls.md) | RLS lecture/écriture de toutes les tables + stockage + gardes + journal + RPC personnes | 1 | P0 | 3h | SQL écrit et commité | ⚠ |
| 3 | [3-tests-base.md](./3-tests-base.md) | Matrice de droits testée en base (transactions annulées), PUIS application | 2 | P0 | 2h | SQL joué, matrice verte | ⚠ |
| 4 | [4-metier.md](./4-metier.md) | Miroir TypeScript du niveau effectif + service + clés | 1 | P0 | 1h30 | `droits.ts` réécrit, testé | |
| 5 | [5-cache.md](./5-cache.md) | Cache effacé au changement de compte | — | P0 | 1h | persistance par compte | ⚠ |
| 6 | [6-ui-acces.md](./6-ui-acces.md) | Dialogue « Accès au classeur », option Privé à la création | 4 | P1 | 3h | gestion des accès utilisable | |
| 7 | [7-ui-gardes.md](./7-ui-gardes.md) | Actions masquées selon le niveau, accès refusé, orphelin, liste | 4 | P1 | 2h | UI alignée sur la base | |
| 8 | [8-cloture.md](./8-cloture.md) | Contrôle navigateur par profils, verif_advisor, CLAUDE.md | 3, 5, 6, 7 | P0 | 1h30 | chantier validé | ⚠ |

## Ordre d'exécution

1. Étapes 1 → 2 → 3 : la base d'abord, **testée avant d'être appliquée**.
   Rien n'est joué en production avant que la matrice de l'étape 3 soit verte
   dans une transaction annulée.
2. Étapes 4 et 5 en parallèle (indépendantes).
3. Étapes 6 et 7.
4. Étape 8.

L'application SQL (étape 3) et la mise en ligne du front doivent être
**rapprochées** : entre les deux, l'ancien front masquerait des boutons selon
l'ancienne règle (« les siens »), sans risque de fuite (la base fait foi) mais
avec des refus inattendus pour un compte `ecriture`. Aujourd'hui, aucun compte
non admin n'est concerné.

## Architecture cible

```
page Classeur (user_page_permissions)     classeur_classeurs.acces_tous
        │  lecture / ecriture / gestion              │ aucun / lecture / ecriture
        ▼                                            ▼
private.classeur_niveau(classeur_id) ◄── classeur_acces (exception par personne)
        │                                 created_by (créateur → ecriture)
        ├─► classeur_lecture_ok(id)   → policies SELECT (8 tables + storage)
        ├─► classeur_write_ok(id)     → policies INSERT/UPDATE (inchangées de nom)
        └─► gestion                   → accès, suppression, ordre de la liste
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Base | `supabase/classeur_2026-09-25.sql` (autorité), `supabase/classeur_images_2026-09-26.sql`, `supabase/classeur_versions_documents_2026-09-27.sql`, `supabase/verif_advisor.sql` | `supabase/classeur_acces_2026-09-28.sql`, `supabase/verif_classeur_acces.sql` |
| Métier | `lib/classeur/droits.ts`, `service.ts`, `keys.ts`, `types.ts`, `lib/queryPersist.ts` | `lib/classeur/droits.property.test.ts` |
| Auth | `components/auth/AuthContext.tsx` (effacement du cache) | — |
| UI | `hooks/useDroitsClasseur.ts`, `ClasseurList.tsx`, `ClasseurListActions.tsx`, `ClasseurDashboard*.tsx`, `ChapterBoard.tsx`, `ChapterSidebar.tsx`, `dialogs/ClasseurDialog.tsx`, `dialogs/HistoriqueDialog.tsx`, `routes/classeur/$classeurId.tsx` | `dialogs/AccesClasseurDialog.tsx` |
| **Total** | **~20 modifiés** | **~5 nouveaux** |
