# Étape 4 — Facturation : gating lecture / écriture / gestion dans le board

> **STATUT : DIFFÉRÉ (décision utilisateur).** Hors périmètre du chantier courant.
> La facturation reste protégée côté serveur (RPC durcies à `>= 2`) et n'est de
> facto accordée qu'aux admins ; l'angle mort n'existe que si `facturation:lecture`
> est un jour accordé à un non-admin. Ce dossier est conservé comme référence pour
> reprise ultérieure. Ne pas exécuter dans ce chantier.

## Objectif

Combler le plus gros écart au modèle : aujourd'hui **aucun composant de
`src/components/facturation/` n'utilise `useAuth`/`can`**. Toute personne autorisée
à voir la page peut tout faire (tamponner, importer le référentiel, bannir un
émetteur). Ça ne tient que parce que la page n'est de facto accordée qu'aux admins.
On introduit les trois niveaux dans le board.

## Contexte

La RLS protège déjà côté serveur (SELECT `read (page:facturation)`, RPC durcies à
`page_level_rank(get_page_level('facturation')) >= 2`). Mais l'UI n'a pas de garde
et le niveau `gestion` n'est pas distingué. Répartition cible :

- **lecture** : galaxie, listes, aperçu tampon, historique. (déjà, via PageGuard)
- **ecriture** : tamponner une facture, importer le référentiel, éditer les
  lignes budgétaires.
- **gestion** : denylist émetteur↔code (bannir/lever), désapprentissage
  (`forget`/`reset`/`unlearn-doc`), réimport destructif du référentiel — les
  actions qui réécrivent l'apprentissage global.

## Fichier(s) impacté(s)

- `src/components/facturation/FacturationBoard.tsx` (modifié — dérive `canWrite`/`canManage`)
- `src/components/facturation/InvoicePanel.tsx` (modifié — tamponnage sous `canWrite`, denylist sous `canManage`)
- `src/components/facturation/ReferentielImport.tsx` (modifié — import sous `canWrite`, réimport sous `canManage`)
- `src/components/facturation/BudgetLinesManager.tsx` (modifié — édition sous `canWrite`)
- `src/components/facturation/FacturationRevue.tsx` (modifié — lever ban / désapprentissage sous `canManage`)
- hooks `useFacturationCuration.ts` : inchangés (la garde reste dans les composants ; la RLS RPC reste le rempart)

## Travail à réaliser

### 1. Dériver les niveaux au sommet du board

```tsx
const { can } = useAuth()
const canWrite = can('facturation', 'ecriture')
const canManage = can('facturation', 'gestion')
```

Les passer en props aux sous-panneaux (ou via un petit contexte facturation local
si le prop-drilling devient lourd — au choix, rester simple).

### 2. Garder les actions

- `InvoicePanel` : bouton tamponner `disabled={!canWrite || !canStamp || stamping}` ;
  bouton bannir émetteur↔code visible seulement si `canManage`.
- `ReferentielImport` : import courant sous `canWrite` ; réimport écrasant
  (`facturation_ref_reimport`) sous `canManage` avec confirmation.
- `BudgetLinesManager` : `save`/`upsertBudgetLine` sous `canWrite`.
- `FacturationRevue` : lever un ban, `forget`/`reset`/`unlearn-doc` sous `canManage`.

Ne jamais retirer les RPC durcies ; l'UI **double** la garde, elle ne la remplace pas.

### 3. Aligner la RLS gestion (contrôle)

Vérifier que les RPC de denylist / désapprentissage exigent bien `gestion`
(`= 'gestion'`) et non seulement `>= 2`. Si elles sont à `>= 2`, ajuster le seuil
dans les fichiers `facturation_issuer_denylist.sql` / `facturation_corrections.sql`
(SQL exécuté par l'utilisateur) pour matcher l'UI.

## Ordre d'exécution

1. `canWrite`/`canManage` dans `FacturationBoard`, props descendantes.
2. Garder tamponnage + budget (écriture).
3. Garder denylist + désapprentissage + réimport (gestion).
4. Contrôler/ajuster le seuil RLS des RPC de curation.

## Contrôle /borg

Étape sensible (sécurité). Auditer :
- Aucune action mutante de facturation ne reste sans garde `can(...)`.
- Le seuil UI (`gestion`) et le seuil RLS des RPC de curation coïncident.
- Un compte `facturation:lecture` ne voit aucun bouton mutant ; `facturation:ecriture`
  peut tamponner mais pas bannir ; `facturation:gestion` a tout.
