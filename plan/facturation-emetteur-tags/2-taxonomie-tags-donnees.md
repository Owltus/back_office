# Étape 2 — Taxonomie de tags + curage des 55 lignes

## Objectif

Définir une taxonomie de **tags de domaine** (transversaux aux sections comptables)
et attribuer 1 à plusieurs tags à chacune des 55 lignes de `BUDGET_LINES`, pour
permettre ensuite un affichage et un filtrage par domaine dans le modal.

## Contexte

Le modal groupe déjà par `category` (les 9 sections du plan). Mais deux sections
sont des fourre-tout : `FRAIS EXPLOITATION / OPERATION` (20 lignes : énergie,
technique, IT, finance, prestataires…) et `FRAIS ADMINISTRATIFS ET GENERAUX` (10 :
admin, RH, finance, déplacements…). Un simple mapping section→tag n'apporterait rien
de plus que le groupement actuel. La valeur vient d'un **curage ligne par ligne**,
guidé par les `hint` (descriptions/fournisseurs du plan). Le mapping ci-dessous est
une **première passe à faire valider par le métier OKKO** (D4).

## Fichier(s) impacté(s)

- `src/lib/facturation/types.ts` (modification : `BudgetLine.tags`)
- `src/lib/facturation/constants.ts` (modification : `TAGS` + `tags` sur 55 lignes)

## Travail à réaliser

### 1. `types.ts` — champ `tags`

```ts
export interface BudgetLine {
  code: string
  label: string
  category: string
  hint?: string
  tags: string[]
}
```

Choisir `tags: string[]` **non optionnel** : le compilateur signalera alors chaque
ligne de `BUDGET_LINES` où le tag manque — garde-fou contre un oubli sur 55 entrées.

### 2. `constants.ts` — taxonomie

```ts
/** Domaines transversaux (au-delà des sections comptables) pour filtrer vite. */
export const TAGS = [
  'Technique',
  'Énergie & fluides',
  'Hébergement',
  'Restauration',
  'IT & logiciels',
  'Administratif',
  'RH',
  'Commercial',
  'Finance',
  'Prestataires',
  'Déplacements',
  'Location',
  'Revenus annexes',
] as const
export type Tag = (typeof TAGS)[number]
```

### 3. `constants.ts` — attribution par ligne (première passe à valider)

Ajouter `tags: [...]` à chaque entrée. Mapping proposé :

| Code | Libellé (abrégé) | Tags proposés |
|------|------------------|---------------|
| FAABONoooo | Abonnements Administratifs | Administratif |
| HEFORMoooo | Formation + Frais RH | RH |
| FACOMPTooo | Comptabilité / Audit | Administratif, Finance |
| FAFRAISRHo | Compta/Audit RH | RH, Administratif |
| FADIVooooo | Divers charges gestion | Administratif |
| RECACALLoo | Divers (coopération comm.) | Commercial |
| FAFOURNDIV | Fournitures diverses | Administratif, IT & logiciels |
| FASERVBQoo | Services bancaires | Finance |
| HESEMINToo | Séminaires internes | RH, Restauration, Déplacements |
| FEDEPLACET | Voyages et déplacements | Déplacements |
| FCOUTILooo | Outils de communication | Commercial |
| HECOMMOTAo | Commissions OTA & GDS | Commercial |
| FCINVITooo | Invitation commerciale | Commercial, Restauration |
| FCOFFERToo | Remise clientèle - offerts | Commercial |
| FAFREEXTRA | Salaires renforts (intérim) | RH |
| HERENFORTo | Salaires renforts (intérim) | RH |
| FMCHAUFFUo | Chauffage Urbain | Énergie & fluides |
| FMEAUooooo | Eau | Énergie & fluides |
| FMELECoooo | Electricité | Énergie & fluides |
| FMGAZooooo | Gaz | Énergie & fluides |
| FMPONCTUEL | Entretien Ponctuel | Technique |
| FMNONOBLIo | Maintenance non obligatoire | Technique, Restauration |
| FMOBLIoooo | Maintenance obligatoire | Technique |
| FMSINISTRE | Réparation sur Sinistre | Technique |
| FEABONNEoo | Abonnements métier | Administratif, Hébergement |
| FACOMMENCo | Commissions encaissements | Finance |
| FEMATERIEL | Consommable expl. (uniformes, déco) | Technique, Administratif, Hébergement |
| HEMATERIEL | Consommable expl. (literie) | Hébergement |
| FMMATTECHo | Consommable expl. (matériel tech.) | Technique |
| REMATERIEL | Consommable expl. (vaisselle) | Restauration |
| RAFBOUT | Consommable expl. (boutique) | Revenus annexes |
| FENTICoooo | Licences & logiciels | IT & logiciels, Commercial, RH |
| FELOCMOBoo | Locations mobilières | Technique, Administratif |
| FESSTDIVoo | Sous-traitances diverses | Prestataires |
| FMINFORMoo | Maintenance Informatique | IT & logiciels, Technique |
| FMTELWEBoo | Téléphone / Internet / VOD | IT & logiciels |
| HEDELOoooo | Délogements | Hébergement |
| HELINGEooo | Location / Blanchissage linge | Hébergement |
| HEPDACCooo | Produits d'accueil | Hébergement |
| HEAPERITIo | Aperitivo | Hébergement, Restauration |
| HESNACKooo | Snacking | Hébergement, Restauration |
| FAPERTECoo | Pertes créances / Dépréciation | Finance |
| HESSTCHBoo | Nettoyage Chambres + Blanchisserie | Hébergement, Prestataires |
| HESSTVIToo | Nettoyage Vitres | Prestataires |
| LOMATERIEL | Fournitures location d'espaces | Location, Restauration |
| LOSSTDIVoo | Sous-traitance location | Location, Prestataires |
| RDEVMARKoo | Redevance Marketing | Commercial, Finance |
| RDEVRBOooo | Redevances de gestion (RBO) | Finance |
| RESSTDIVoo | Sous-traitance diverses | Restauration, Prestataires |
| RESSTFBooo | Sous-traitance F&B (traiteur) | Restauration |
| REBEALCOOL | Alcool | Restauration |
| REFOODoooo | Food ALC | Restauration |
| REPDJFBooo | Achats PDJ | Restauration |
| RAFBOUTooo | Articles de Boutique | Revenus annexes |
| RAFCONGooo | Conciergerie & Pressing | Revenus annexes, Hébergement |

Après attribution, `npx prettier --write src/lib/facturation/constants.ts` (les
littéraux longs seront reformatés).

## Ordre d'exécution

1. `types.ts` (`tags: string[]`, non optionnel).
2. `constants.ts` (`TAGS` + `tags` sur les 55 lignes).
3. `npx tsc --noEmit` (doit signaler 0 ligne sans `tags`).

## Critère de validation

- `tsc` vert (toutes les 55 lignes portent `tags`).
- Chaque tag utilisé appartient bien à `TAGS` (cohérence, à vérifier visuellement
  ou par un petit test optionnel).
- Mapping relu / ajusté selon retour métier OKKO (les cases ambiguës : les 5
  « Consommable d'exploitation », `FENTICoooo`, `HESEMINToo`).
