import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '#/components/ui/tabs.tsx'
import { EffectsPanel } from './EffectsPanel.tsx'
import galleryHtml from './gallery.html?raw'

/*
 * Page « Artefact » — bac à sable admin, à des fins de test. Deux onglets :
 *
 * - « Registre » : la trace des éléments d'interface retenus. Maquette autonome
 *   (HTML/CSS self-contained) rendue dans un <iframe srcDoc> ISOLÉ — ses propres
 *   tokens de couleur, sans interférer avec le thème de l'app. Importée en `?raw`.
 * - « Effets » : dix effets visuels canvas déclenchés au clic (voir
 *   `EffectsPanel`). Pendant longtemps le seul effet du projet était l'easter
 *   egg `SecretFireworks`, déclenché à la frappe d'un mot ; cet onglet en
 *   généralise l'idée à des déclencheurs par bouton.
 *
 * Réservé aux admins (cf. route + lien Navbar).
 */
export function ArtefactBoard() {
  return (
    <Tabs defaultValue="registre" className="flex flex-1 flex-col gap-0">
      <div className="border-b px-4 pt-3">
        <TabsList>
          <TabsTrigger value="registre">Registre</TabsTrigger>
          <TabsTrigger value="effets">Effets</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="registre" className="flex flex-col">
        <iframe
          title="Registre d'artefacts"
          srcDoc={galleryHtml}
          className="w-full flex-1 border-0"
          style={{ minHeight: 'calc(100dvh - 7rem)' }}
        />
      </TabsContent>

      <TabsContent value="effets">
        <EffectsPanel />
      </TabsContent>
    </Tabs>
  )
}
