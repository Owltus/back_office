# Étape 2 — RepJour : board jour responsive tactile

## Objectif

Câbler le board principal de RepJour (`DashboardBoard.tsx`) sur le socle de
l'étape 1 : identité de page migrée dans la Navbar sous 1024px, barre basse
tactile pour les actions, alignement à droite en mode souris. Pas de badge de
statut à ajouter (RepJour n'a aucune notion de clôture — confirmé par grep
négatif sur `cloture|verrou|locked|validated_at`, contrairement à Rapro).

## Contexte

Contrairement à Rapro, les actions actuelles de `DashboardBoard.tsx` (4
groupes : suppression admin, aide+analytique+impression, actions admin
envoi/destinataires, StepNav+DatePickerButton) sont rendues INCONDITIONNELLEMENT
à toutes les tailles — aucune bascule tactile n'existe. Aucune décision
produit n'est en attente pour ce domaine (voir `00-INDEX.md`) : portage direct.

## Fichier(s) impacté(s)

- `src/components/repjour/boards/DashboardBoard.tsx`

## Travail à réaliser

### 1. Câbler le hook combiné

```tsx
import { useResponsiveShell } from '#/components/shared/useResponsiveShell.ts'
import { MobileToolbar, ToolbarCell } from '#/components/shared/MobileToolbar.tsx'
import { useNavbarSubtitle } from '#/lib/navbarSubtitle.ts'

const { isNavbarMobile, isTouchDevice } = useResponsiveShell()
useNavbarSubtitle(isNavbarMobile ? displayDate : null)
```

### 2. `PageHeader` : identité + actions gatées

```tsx
<PageHeader
  title={isNavbarMobile ? undefined : displayDate}
  actions={isTouchDevice ? undefined : (
    <>
      {/* les 4 groupes existants, INCHANGÉS */}
    </>
  )}
  actionsAlign="end"
/>
```

### 3. Réserve d'espace + barre basse tactile

Sur le conteneur racine du board, ajouter `isTouchDevice && 'pb-20'` (même
motif que Rapro). Choisir les cellules de la barre basse tactile parmi les
actions existantes — TOUTES ne se transposent pas forcément à l'identique en
icône+libellé (ex. les actions admin "Envoi"/"Destinataires" sont réservées
au rôle admin : garder cette condition dans la barre basse aussi). Proposition
de composition (à ajuster si le rendu réel le justifie) :

```tsx
<MobileToolbar visible={isTouchDevice}>
  <ToolbarCell icon={<HelpGlyph className="size-5" />} label="Aide" ariaLabel="..." onClick={...} bordered={false} />
  <ToolbarCell icon={<LineChart className="size-5" />} label="Analytique" ariaLabel="..." onClick={() => navigate({ to: '/repjour/analytique' })} />
  <ToolbarCell icon={<Printer className="size-5" />} label="Imprimer" ariaLabel="..." onClick={handleGeneratePdf} disabled={!canPrint || pdfBusy} />
  {/* navigation temporelle : Préc./Suiv. aux deux bords, comme Rapro */}
</MobileToolbar>
```

Le bouton "Vue analytique" étant actuellement un `<Link>` (pas un `onClick`),
`ToolbarCell` n'accepte qu'un `onClick` — soit ajouter une variante `href`/
`to` à `ToolbarCell` (généralisation utile aux autres domaines aussi, qui ont
tous ce même bouton), soit utiliser `navigate()` programmatique comme fait
côté Rapro pour ses cellules "Retour". Trancher au moment de l'implémentation
selon ce qui est le plus simple sans dupliquer `ToolbarCell`.

Les actions ADMIN (suppression, envoi, destinataires) : à la discrétion de
l'exécutant, soit omises de la barre basse (réservées au mode souris/bureau,
cohérent avec un usage admin peu probable sur tablette), soit ajoutées si le
nombre de cellules reste raisonnable — ne pas surcharger la barre basse au
point de la rendre illisible (5-6 cellules maximum, comme Rapro).

## Ordre d'exécution

1. Importer et appeler `useResponsiveShell`.
2. Gater `title`/`actions` du `PageHeader`.
3. Construire la barre basse tactile (choix des cellules).
4. Ajouter la réserve `pb-20` conditionnelle.

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run` (428 tests), `npx pnpm build`.
- Vérification manuelle : le board RepJour desktop est visuellement identique
  à avant (aucune régression) ; sur écran tactile (émulé ou réel), la barre du
  haut disparaît, la barre basse apparaît avec les cellules choisies.
