import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '#/components/ui/tabs.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { EffectsPanel } from './EffectsPanel.tsx'
import galleryHtml from './gallery.html?raw'

/*
 * Page « Artefact » — bac à sable admin, à des fins de test. Mise en page
 * STANDARD (comme toutes les autres routes) : `PageContainer` + `PageHeader` +
 * conteneur centré `max-w-5xl`, avec deux onglets posés sous l'en-tête.
 *
 * - « Registre » : maquette autonome (`gallery.html`) rendue dans un <iframe
 *   srcDoc> ISOLÉ — ses propres tokens de couleur, sans toucher au thème de
 *   l'app — encadrée comme une carte. Importée en `?raw`.
 * - « Effets » : des effets visuels canvas déclenchés au clic (cf. `EffectsPanel`).
 *
 * Réservé aux admins (cf. route + lien Navbar).
 */
export function ArtefactBoard() {
  return (
    <Tabs defaultValue="registre" className="flex flex-1 flex-col">
      <PageContainer>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <PageHeader
            title="Artefact"
            meta="Bac à sable admin — registre d'interface et effets visuels"
          />

          {/* Pleine largeur : les deux onglets se partagent toute la barre
              (les `TabsTrigger` sont `flex-1`). */}
          <TabsList className="w-full">
            <TabsTrigger value="registre">Registre</TabsTrigger>
            <TabsTrigger value="effets">Effets</TabsTrigger>
          </TabsList>

          {/* Registre : la maquette isolée (iframe) encadrée comme une carte,
              pour qu'elle s'intègre au layout au lieu de déborder pleine largeur. */}
          <TabsContent
            value="registre"
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <iframe
              title="Registre d'artefacts"
              srcDoc={galleryHtml}
              className="block w-full border-0"
              style={{ height: 'calc(100dvh - 13rem)', minHeight: '30rem' }}
            />
          </TabsContent>

          <TabsContent value="effets">
            <EffectsPanel />
          </TabsContent>
        </div>
      </PageContainer>
    </Tabs>
  )
}
