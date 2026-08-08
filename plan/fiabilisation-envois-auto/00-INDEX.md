# Plan — Fiabilisation des envois auto (filet de confiance)

## Contexte

L'audit swarm (19 agents, 12 anomalies confirmées) a montré que le pipeline
d'envoi auto fonctionne bien une nuit normale, mais qu'il peut échouer EN SILENCE
(rapport en retard, hoquet Resend, jonction de mois/année) sans que personne ne le
sache. L'utilisateur ne sera pas présent à 02:30 : il doit pouvoir FAIRE CONFIANCE.

Principe métier posé par l'utilisateur : **le RepJour est toujours en J-1 ; on
travaille avec les données qu'on a.** Le réalisé du dimanche part le lundi, etc. La
seule condition en trop aujourd'hui, c'est d'exiger un forecast « frais » les nuits de
jonction (fin de mois, fin d'année), alors qu'un forecast frais du mois qui s'achève
ne viendra jamais (StayNTouch a déjà basculé au mois suivant).

Décisions de l'utilisateur (2026-08-08) :
- **Jonction mois/année** : envoyer avec le forecast déjà en base (le mois est complet).
  Garder l'exigence « forecast frais » UNIQUEMENT en milieu de mois (filet anti mauvais
  chiffres si un soir le forecast plante vraiment).
- **Alerte** = un **bandeau** dans la page RepJour (pas d'e-mail) ; se retire à l'envoi
  (auto OU manuel via le bouton Envoyer).
- **Forecast en HT** : rien à faire en auto (export toujours configuré avec TVA → cas
  impossible ; le mode manuel garde son contrôle).
- **Envoi raté** : jusqu'à 5 tentatives, arrêt dès succès.
- **Fenêtre 02h-04h** : jugée suffisante (rapports à 02:30) — hors périmètre.

Marqueur d'envoi : on **réutilise** les marqueurs existants (pas de migration) —
`daily_reports.auto_sent_at` (RepJour) et la présence d'une ligne `pdj_auto_send_log`
(PDJ). L'envoi MANUEL les posera aussi, pour que le bandeau reflète « envoyé par qui
que ce soit ».

## Angles à clarifier

- **Bandeau PDJ** : l'utilisateur n'a validé explicitement que la page RepJour ; le plan
  inclut le PDJ par symétrie — à confirmer.
- **Sémantique `auto_sent_at`** : réutilisé pour « envoyé (auto ou manuel) » afin d'éviter
  une migration — à valider (sinon, colonne `sent_at` dédiée).

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-marquer-envoi-manuel.md](./1-marquer-envoi-manuel.md) | L'envoi manuel pose le marqueur d'envoi | — | P0 | 45min | Un envoi manuel « éteint » le bandeau | |
| 2 | [2-regle-envoi-jonction-mois.md](./2-regle-envoi-jonction-mois.md) | Règle d'envoi RepJour : jonction mois/année + horloge unique | — | P0 | 1h | Le dernier jour du mois/année part tout seul | |
| 3 | [3-robustesse-envoi.md](./3-robustesse-envoi.md) | Envoi robuste : retry ≤5 + rollback sur toute erreur | — | P0 | 1h | Un hoquet ne fait plus perdre l'e-mail en silence | |
| 4 | [4-bandeau-page-repjour-pdj.md](./4-bandeau-page-repjour-pdj.md) | Bandeau « pas encore envoyé » (RepJour, +PDJ) | 1 | P0 | 1h30 | Le souci devient visible dans l'app | |
| 5 | [5-validation-commits-deploiement.md](./5-validation-commits-deploiement.md) | Validation + commits + déploiement | 1,2,3,4 | P0 | 30min | tsc + deno + build OK, versionné, déployé | ⚠ |

## Ordre d'exécution

Séquentiel : 1 (marqueur) → 2 (règle jonction, timing) → 3 (robustesse envoi) → 4 (bandeau, lit le marqueur) → 5 (validation/deploy).
Étapes 1, 2, 3 sont largement indépendantes ; 2 et 3 touchent toutes deux `autoSend.ts`
(faire 2 avant 3 ; l'horloge unique de l'étape 2 est ensuite réutilisée telle quelle).

## Architecture cible

```
RepJour = TOUJOURS J-1, envoyé avec les données présentes.
  - Jour normal : réalisé J-1 + projeté du mois (forecast frais du soir) -> envoi.
  - Fin de mois / fin d'année : réalisé J-1 + projeté depuis le forecast DÉJÀ en base
        (le mois est complet) -> envoi (plus de blocage « pas frais »).
  - Milieu de mois SANS forecast frais (forecast a planté ce soir) -> on attend
        (pas de mauvais chiffres) -> BANDEAU dans la page.
Envoi : jusqu'à 5 tentatives, stop au succès. Échec réel -> jour NON brûlé -> BANDEAU.
Bandeau : présent tant que non envoyé ; se retire dès l'envoi (auto ou manuel).
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Edge (Deno) | `send-report/index.ts`, `import-report/autoSend.ts`, `import-report/autoSendPdj.ts`, `import-report/index.ts`, `_shared/send-mail.ts` | — |
| Client | `components/repjour/boards/DashboardBoard.tsx`, `components/pdj/BreakfastBoard.tsx` | `components/shared/SendStatusBanner.tsx` |
| Plan | — | `plan/fiabilisation-envois-auto/*` |

| **Total** | **~7 modifiés** | **~1 nouveau** |
