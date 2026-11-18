# Plan — Corrections de l'audit de sécurité run-2 (2026-11-18)

## Contexte

L'audit approfondi du 18/11 (`~/security-audit-skill/back_office/run-2/`, 75 agents, couverture complète) n'a trouvé aucune faille grave. Il reste 4 failles faibles confirmées, 6 pistes à valider et une liste d'améliorations. Ce plan dit ce qu'on corrige, ce qu'on laisse, et dans quel ordre.

Décisions de l'utilisateur (18/11) :

- **Caisse : on ne touche à rien.** La date de remboursement des cautions est une décision métier. Les fenêtres de la caisse et des cautions restent aussi telles quelles.
- **Pour le reste, l'assistant décide**, en appliquant les bonnes pratiques.
- **E-mails : prudence maximale.** L'utilisateur ne maîtrise pas ce sujet et veut que ses utilisateurs continuent de recevoir les e-mails. Le contrôle strict du Worker a été déployé le 17/11 (version e45fbffb ; retour possible vers 8fafd2ee). Son contrôle par les journaux est prévu la nuit du 18/11 entre 02:22 et 02:52. **Rien ne change sur le Worker ni sur `import-report` avant que ce contrôle soit passé.**

Sources des bonnes pratiques e-mail (consultées le 18/11) :

- RFC 8601 : lecture de `Authentication-Results`, chaînes entre guillemets et commentaires ;
- RFC 7489 §3.1 : alignement DMARC ;
- documentation Cloudflare Email Workers (`message.from`, `rawSize`, `Authentication-Results` posé par `mx.cloudflare.net`) ;
- page postmaster de Cloudflare : un e-mail est accepté avec SPF ou DKIM valide, sans exigence d'alignement. C'est donc au Worker de contrôler l'alignement.

---

## Ce qui est corrigé, et ce qui ne l'est pas

| Sujet                                                              | Décision                                                               | Étape |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- | ----- |
| Marqueur d'envoi `auto_sent_at` modifiable                         | corrigé                                                                | 1     |
| PDJ : ligne importée déplacée puis remplacée                       | corrigé                                                                | 1     |
| Dernier administrateur retirable                                   | corrigé (et `created_at` figé)                                         | 1     |
| Jours fériés générés validés d'office (`ferie_chome`)              | corrigé                                                                | 1     |
| Suppressions de `pms_daily_metrics` non journalisées               | corrigé                                                                | 1     |
| Adresses des destinataires du rapport lisibles en lecture          | réservé à la gestion                                                   | 1     |
| Fenêtres J-2, J-3, J-7 calculées en UTC                            | heure de Paris, SAUF caisse et cautions                                | 2     |
| Règle du passé du planning                                         | selon la décision Q1                                                   | 3     |
| Seuil de `planning_valider_avec_repos`                             | corrigé avec l'étape 3                                                 | 3     |
| Cache d'un autre onglet, factures gardées après déconnexion        | corrigé                                                                | 4     |
| Changement d'e-mail sans mot de passe, inscription TOTP            | réglages local + dashboard prod                                        | 5     |
| Pages d'impression du Classeur                                     | un DOMPurify final + test Mermaid                                      | 6     |
| Import LLM sans portée                                             | reste dans le chapitre ou document ouvert                              | 6     |
| Outillage (tesseract, hachés de la copie de prod)                  | corrigé                                                                | 7     |
| Hotel Code, pièces jointes, dates, compteurs (`import-report`)     | d'abord en observation                                                 | 8     |
| Analyseur du Worker (guillemets, alignement exact)                 | corrigé, après l'étape 8                                               | 9     |
| Hotel Code imposé, retrait de l'ancien contrôle                    | après 3 nuits propres                                                  | 10    |
| Anciennes fonctions inutilisées, table `classeur_acces`            | retirées (`--supprimer`)                                               | 11    |
| Caisse : date de remboursement des cautions                        | **laissé** (décision métier)                                           | —     |
| Classeur supprimé encore lisible par l'API                         | laissé (question de conception ouverte, risque de casser la corbeille) | —     |
| `search_path 'public'` sur ~40 fonctions, droits sur des séquences | laissé (non exploitable, réécriture risquée)                           | —     |
| Auteur d'une version tiré du nom modifiable                        | laissé (contraire à une décision existante)                            | —     |
| CORS `*` sur les fonctions, `deno.lock`                            | plus tard, livraisons séparées hors chantier e-mail                    | —     |
| Conservation des noms du parking et des copies du journal          | selon la décision Q2                                                   | —     |

---

## Réponses de l'utilisateur (18/11)

- Q1 : option (a), les jours passés sont figés en écriture et restent libres pour la gestion.
- Q2 : on en reparle plus tard, rien ne change pour la conservation.
- Q3 : accord pour régler le dashboard de la prod (Secure email change ON, inscription TOTP désactivée).
- Feu vert donné pour l'exécution.

## Angles à clarifier (posés avant les réponses)

- **Q1 : planning, jours passés.** Aujourd'hui l'écran permet de corriger un jour passé d'une semaine non verrouillée, par exemple pour poser un arrêt maladie après coup. Pourtant l'aide dit que les jours passés sont figés pour tout le monde. Trois options :
  - (a) figé en écriture, libre pour la gestion (recommandé) ;
  - (b) figé pour tous, ce qui demande aussi de changer l'écran ;
  - (c) on garde comme aujourd'hui et on corrige seulement le texte de l'aide.
- **Q2 : durée de conservation.** Combien de temps garder le nom des clients du parking, et les copies des lignes dans le journal d'audit ? C'est une décision métier et RGPD. Sans réponse, rien ne change.
- **Q3 : dashboard Supabase de la prod.** Activer « Secure email change » et désactiver l'inscription TOTP. Accord nécessaire avant que l'assistant le fasse dans le navigateur.
- **Divergence relevée entre agents : lecture du Hotel Code.** Les 4 formats de rapport du PMS portent le code 4401NACH, mais les exports manuels n'ont pas toujours ce bloc. Choix retenu : un code absent est seulement noté dans les journaux, seul un code présent ET différent est refusé.
- **Point technique à vérifier en local (étape 3) :** `pg_trigger_depth()` compte-t-il la suppression en cascade ? Le test le dira.

---

## Phases

| #   | Fichier                                                                        | Phase                                                        | Dépend de              | Priorité | Effort | Livrable                                    | Critique |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------- | -------- | ------ | ------------------------------------------- | -------- |
| 1   | [1-base-correctifs-simples.md](./1-base-correctifs-simples.md)                 | 6 correctifs de base sans risque pour l'existant             | —                      | P0       | 3h     | 4 migrations + test pgTAP 93                | ⚠        |
| 2   | [2-base-heure-de-paris.md](./2-base-heure-de-paris.md)                         | Fenêtres d'écriture à la date de Paris (hors caisse)         | 1                      | P1       | 2h     | 1 migration, ~20 policies                   | ⚠        |
| 3   | [3-planning-jours-passes.md](./3-planning-jours-passes.md)                     | Règle du passé selon Q1 + seuil des repos                    | Q1                     | P1       | 3h     | 1 migration + tests 05                      | ⚠        |
| 4   | [4-navigateur-changement-de-compte.md](./4-navigateur-changement-de-compte.md) | Cache entre onglets, oubli de session, profil                | —                      | P0       | 3h     | `queryPersist.ts`, `oubliSession.ts`, tests | ⚠        |
| 5   | [5-auth-email-mfa.md](./5-auth-email-mfa.md)                                   | `config.toml` + dashboard prod                               | Q3                     | P1       | 30min  | config + 2 réglages vérifiés                |          |
| 6   | [6-classeur-impression-import.md](./6-classeur-impression-import.md)           | DOMPurify final, test Mermaid, petits nettoyages, portée LLM | —                      | P1       | 2h     | code + tests                                | ⚠        |
| 7   | [7-outillage.md](./7-outillage.md)                                             | tesseract, hachés anonymisés                                 | —                      | P2       | 30min  | 2 scripts                                   |          |
| 8   | [8-import-report-observation.md](./8-import-report-observation.md)             | Hotel Code, PJ, dates, compteurs : journaux d'abord          | contrôle de cette nuit | P1       | 2h     | Edge Function + tests Deno                  | ⚠        |
| 9   | [9-worker-analyseur.md](./9-worker-analyseur.md)                               | Analyseur RFC 8601, grammaire d'enveloppe, alignement exact  | 8 + 2 nuits propres    | P1       | 2h     | Worker + tests                              | ⚠        |
| 10  | [10-activation-et-retrait.md](./10-activation-et-retrait.md)                   | Hotel Code imposé, retrait de l'ancien contrôle              | 9 + 3 nuits propres    | P2       | 30min  | 1 variable, puis 1 déploiement              | ⚠        |
| 11  | [11-nettoyage-supprimer.md](./11-nettoyage-supprimer.md)                       | Anciennes fonctions et `classeur_acces`                      | 1                      | P2       | 1h     | 1 migration `--supprimer`                   | ⚠        |
| 12  | [12-validation-globale.md](./12-validation-globale.md)                         | Batterie complète, livraison, mémoire et CLAUDE.md           | toutes                 | P0       | 1h     | livré + bilan                               | ⚠        |

---

## Ordre d'exécution

Le chantier se fait en quatre livraisons. Chaque livraison passe par le protocole habituel (`--essai`, puis `--confirme`), toujours en journée et jamais entre 00:00 et 05:00.

1. **Livraison A (sans e-mail)** : étapes 1, 2, 4, 5 (côté config), 6, 7, et 3 une fois Q1 tranchée. Elle ne touche ni au Worker ni à `import-report`.
2. **Livraison B** : étape 8, en journée, seulement après un contrôle propre cette nuit. Puis 2 nuits d'observation des journaux.
3. **Livraison C** : étape 9 (Worker), en journée, au moins 2 h avant 02:00. L'assistant suit la première nuit dans les journaux. Puis 3 nuits sans incident.
4. **Livraison D** : étape 10, puis 11. L'étape 12 clôt le chantier.

Règle e-mail : un seul changement par nuit. On constate dans les journaux, on ne déduit pas. Le retour arrière se prépare avant chaque déploiement.

---

## Fichiers impactés (résumé)

| Couche               | Fichiers modifiés                                                                                                                                                                                                                                                                                                                                                                                                                    | Fichiers nouveaux                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Base                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                    | 6 à 7 migrations `20261118*`, `supabase/tests/93_audit_2026_11_18.test.sql` |
| Tests base existants | `05_planning.test.sql`, `00_socle.test.sql` (liste), `04_classeur_acces.test.sql`, `scripts/livrer-plan.mjs` (`TESTS_SUR_COPIE`)                                                                                                                                                                                                                                                                                                     | —                                                                           |
| Client               | `src/lib/queryPersist.ts`, `src/components/auth/AuthContext.tsx`, `src/lib/facturationStore.ts`, `src/lib/afficheStore.ts`, `src/lib/classeur/images.ts`, `src/lib/classeur/restauration.ts`, `src/lib/classeur/print/*`, `src/components/classeur/print/DocumentPages.tsx`, `src/lib/classeur/mermaid.ts`, `src/lib/classeur/slug.ts`, `src/lib/classeur/merge/changements.ts`, `src/components/facturation/GalaxyChart.render.tsx` | `src/lib/auth/oubliSession.ts` + tests                                      |
| Edge Functions       | `supabase/functions/import-report/{index,pdj,addon,repjour}.ts`                                                                                                                                                                                                                                                                                                                                                                      | tests Deno                                                                  |
| Worker               | `cloudflare/stayntouch_in_to_supabase.js`, `cloudflare/worker.audit.test.ts`, `cloudflare/wrangler.toml` (commentaires)                                                                                                                                                                                                                                                                                                              | —                                                                           |
| Config et outillage  | `supabase/config.toml`, `scripts/prepare-tesseract.mjs`, `supabase/anonymiser.sql`, `supabase/seed/generer.ts`                                                                                                                                                                                                                                                                                                                       | —                                                                           |
| **Total**            | **~30 modifiés**                                                                                                                                                                                                                                                                                                                                                                                                                     | **~10 nouveaux**                                                            |
