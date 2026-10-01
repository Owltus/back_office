import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import {
  Bold,
  Columns2,
  Heading1,
  Heading2,
  ImagePlus,
  Images,
  Italic,
  LayoutGrid,
  Link,
  List,
  ListOrdered,
  ListTodo,
  ScissorsLineDashed,
  SeparatorHorizontal,
  Table,
  TextQuote,
} from 'lucide-react'

import { HelpDialogHeader } from '#/components/shared/HelpDialogHeader.tsx'
import { HelpGlyph } from '#/components/shared/HelpGlyph.tsx'
import { Kbd, KbdPlus, Shortcut } from '#/components/shared/Kbd.tsx'
import { Dialog, DialogContent } from '#/components/ui/dialog.tsx'
import { PAGE_FONT_FAMILY } from '#/lib/classeur/print/constants.ts'
import {
  REHYPE_CLASSEUR,
  REMARK_CLASSEUR,
} from '#/lib/classeur/print/pipeline.ts'

/*
 * Mode d'emploi de l'éditeur des documents (bouton « ? » de l'en-tête,
 * demande utilisateur du 2026-09-27 : « un petit tuto pour les personnes
 * qui n'y connaissent rien »). Même présentation que les aides de la
 * caisse, du parking ou du petit-déjeuner.
 *
 * Chaque exemple montre ce que l'on TAPE et ce que ça DONNE sur la page ;
 * le résultat est rendu par le même moteur Markdown et les mêmes styles
 * que les pages A4 (`.pdf-prose`, pipeline PARTAGÉ `print/pipeline.ts`) —
 * une illustration redessinée à la main finirait par mentir sur ce que la
 * page imprime. Les images des exemples sont des vignettes neutres : le
 * texte tapé montre un nom de fichier lisible, pas un chemin du stockage.
 */

/** Vignette grise 4:3 (montagne et soleil), pour les exemples d'images. */
const VIGNETTE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e5e5e5"/><circle cx="290" cy="90" r="34" fill="#c4c4c4"/><path d="M40 260 150 120l70 90 50-55 90 105z" fill="#bdbdbd"/></svg>',
)}`

const COMPOSANTS_EXEMPLE: Components = {
  img: ({ alt, title }) => (
    <img src={VIGNETTE} alt={alt ?? ''} data-taille={title ?? 'auto'} />
  ),
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

function Term({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>
}

/** Pastille d'un bouton de la barre, pour le désigner dans le texte. */
function Bouton({ icon }: { icon: ReactNode }) {
  return (
    <span
      className="inline-flex size-6 items-center justify-center rounded-md border border-border bg-background align-middle text-foreground [&_svg]:size-3.5"
      aria-hidden="true"
    >
      {icon}
    </span>
  )
}

/** « Vous tapez » à gauche, « Sur la page » à droite (empilés sur mobile). */
function Exemple({ source }: { source: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="min-w-0 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wide">
          Vous tapez
        </p>
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground">
          {source}
        </pre>
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wide">
          Sur la page
        </p>
        <div
          className="pdf-prose rounded-md border border-border bg-white px-3 py-2 text-black"
          style={{
            fontFamily: PAGE_FONT_FAMILY,
            fontSize: '9.5pt',
            lineHeight: 1.6,
          }}
        >
          <ReactMarkdown
            remarkPlugins={REMARK_CLASSEUR}
            rehypePlugins={REHYPE_CLASSEUR}
            components={COMPOSANTS_EXEMPLE}
          >
            {source}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

export function AideMiseEnFormeDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <HelpDialogHeader
          icon={<HelpGlyph />}
          title="Mettre en forme un document"
          description="Titres, gras, listes, tableaux, images : tout se fait avec la barre au-dessus du texte."
        />
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
          <Section title="Le principe">
            <p>
              On écrit du <Term>texte simple</Term>. Quelques signes placés
              devant ou autour des mots (un <code>#</code>, deux <code>**</code>
              , un tiret…) changent la mise en page. Vous n'avez pas à les
              retenir :{' '}
              <Term>la barre au-dessus du texte les écrit pour vous</Term>.
              Sélectionnez un mot ou placez le curseur sur une ligne, puis
              cliquez sur un bouton. Un second clic retire la mise en forme.
            </p>
            <p>
              L'<Term>aperçu</Term> à côté du texte montre la page telle qu'elle
              sera imprimée, au fil de la frappe. Rien n'est enregistré avant{' '}
              <Term>Sauvegarder</Term> (ou <Kbd>Ctrl</Kbd> <KbdPlus />{' '}
              <Kbd>S</Kbd>).
            </p>
          </Section>

          <Section title="Aller à la ligne, faire des paragraphes">
            <p>
              <Term>Laissez une ligne vide</Term> entre deux paragraphes. Un
              simple retour à la ligne, sans ligne vide, colle les deux lignes
              ensemble sur la page : c'est la seule règle à retenir.
            </p>
            <Exemple
              source={
                'Première ligne\ncollée à la suivante.\n\nNouveau paragraphe, après une ligne vide.'
              }
            />
          </Section>

          <Section title="Titres">
            <p>
              <Bouton icon={<Heading1 />} /> grand titre,{' '}
              <Bouton icon={<Heading2 />} /> titre de partie, puis sous-titre.
              Placez le curseur sur la ligne et cliquez : le bouton reste
              enfoncé tant que la ligne est un titre.
            </p>
            <Exemple
              source={
                '# Objectif\n\n## Étapes\n\n### Étape 1\n\nTexte de l’étape.'
              }
            />
          </Section>

          <Section title="Gras, italique, barré">
            <p>
              Sélectionnez les mots, puis <Bouton icon={<Bold />} /> ou{' '}
              <Bouton icon={<Italic />} />. Sans sélection, un exemple est
              inséré et sélectionné : tapez simplement par-dessus.
            </p>
            <Exemple
              source={
                'Un mot **important**, une *nuance*, une mention ~~périmée~~.'
              }
            />
          </Section>

          <Section title="Listes et encadrés">
            <p>
              <Bouton icon={<List />} /> puces,{' '}
              <Bouton icon={<ListOrdered />} /> numéros,{' '}
              <Bouton icon={<ListTodo />} /> cases à cocher (pratique pour une
              liste de contrôle imprimée), <Bouton icon={<TextQuote />} />{' '}
              encadré pour une remarque.
            </p>
            <p>
              Dans une liste, <Kbd>Entrée</Kbd> crée l'élément suivant (le
              numéro suit tout seul) ; <Kbd>Entrée</Kbd> sur un élément vide
              termine la liste. <Kbd>Tab</Kbd> fait une sous-liste,{' '}
              <Kbd>Maj</Kbd> <KbdPlus /> <Kbd>Tab</Kbd> la ramène.
            </p>
            <Exemple
              source={
                '1. Accueillir le client\n2. Vérifier la réservation\n   - nom\n   - dates\n\n- [ ] Clé remise\n\n> Une remarque à ne pas oublier.'
              }
            />
          </Section>

          <Section title="Tableaux">
            <p>
              <Bouton icon={<Table />} /> ouvre une grille à remplir comme un
              tableur : Tab passe à la case suivante, Entrée à la ligne du
              dessous, et des boutons ajoutent ou retirent lignes et colonnes.
              La première ligne est l'en-tête. Pour <Term>modifier</Term> un
              tableau, placez le curseur dedans puis cliquez sur le même bouton
              : la grille s'ouvre avec son contenu.
            </p>
            <p>
              Dans le texte, le tableau s'écrit avec des barres <code>|</code> ;
              on peut aussi le corriger directement. La ligne{' '}
              <code>| --- |</code> sépare l'en-tête du reste : ne la supprimez
              pas.
            </p>
            <Exemple
              source={
                '| Élément | Détail |\n| --- | --- |\n| Premier | Texte |\n| Second | Texte |'
              }
            />
          </Section>

          <Section title="Liens">
            <p>
              Sélectionnez le texte, <Bouton icon={<Link />} /> (ou{' '}
              <Kbd>Ctrl</Kbd> <KbdPlus /> <Kbd>K</Kbd>), puis collez l'adresse à
              la place de <code>https://</code>, déjà sélectionné.
            </p>
            <Exemple
              source={'Voir les [conditions générales](https://exemple.fr).'}
            />
          </Section>

          <Section title="Images">
            <p>
              <Bouton icon={<ImagePlus />} /> pour choisir un fichier, ou plus
              simplement <Term>collez</Term> une capture d'écran (
              <Kbd>Ctrl</Kbd> <KbdPlus /> <Kbd>V</Kbd>) ou <Term>glissez</Term>{' '}
              une image dans le texte. <Bouton icon={<Images />} /> reprend une
              image déjà envoyée dans ce classeur.
            </p>
            <p>
              Avant l'envoi, une fenêtre demande une <Term>légende</Term>{' '}
              (imprimée sous l'image : dites ce qu'elle montre), permet de la{' '}
              <Term>recadrer</Term> (tirez les coins du cadre) et de choisir sa{' '}
              <Term>taille</Term>. En <Term>Automatique</Term>, l'application
              s'occupe de tout : l'image est centrée et ne dépasse jamais 10 cm
              de haut, même une photo prise en hauteur. Petite, moyenne et
              pleine largeur restent possibles ; une capture d'écran à lire se
              met en pleine largeur.
            </p>
            <Exemple
              source={'Ouvrir le bac à sel.\n\n![Bac à sel ouvert](photo.webp)'}
            />
            <p>
              Pour <Term>retoucher</Term> une image déjà placée (légende,
              taille, cadre), <Term>cliquez dessus</Term> dans l'aperçu de la
              page : la même fenêtre s'ouvre. <Kbd>Ctrl</Kbd> <KbdPlus />{' '}
              <Kbd>Z</Kbd> annule.
            </p>
            <p>
              Dans le texte, une image est une ligne <code>![légende](…)</code>,
              parfois suivie de sa taille entre guillemets (
              <code>"petite"</code>, <code>"moyenne"</code>,{' '}
              <code>"pleine"</code>). Ne modifiez pas la partie entre
              parenthèses : déplacez ou supprimez la ligne entière.
            </p>
          </Section>

          <Section title="Planche de photos">
            <p>
              Pour montrer <Term>plusieurs photos</Term> d'un coup (repérer des
              vannes, comparer un avant / après),{' '}
              <Bouton icon={<LayoutGrid />} /> : choisissez toutes les photos,
              elles sont rangées en <Term>grille</Term>, toutes au même format
              (2 photos côte à côte, 4 en carré, 3 ou 6 sur trois colonnes).
              Cliquez ensuite sur chaque photo dans l'aperçu pour lui écrire sa
              légende.
            </p>
            <Exemple
              source={
                ':::photos\n![Manchette 1 : en haut](photo1.webp)\n![Manchette 2 : en bas](photo2.webp)\n:::'
              }
            />
            <p>
              Dans le texte, la planche commence par <code>:::photos</code> et
              finit par <code>:::</code>, chacun seul sur sa ligne et sans
              espace. Entre les deux, une photo par ligne.
            </p>
          </Section>

          <Section title="Étape illustrée">
            <p>
              Pour mettre une <Term>photo à côté d'une consigne</Term>, placez
              le curseur sur la consigne (ou sélectionnez-en plusieurs lignes),
              puis <Bouton icon={<Columns2 />} /> et choisissez la photo : le
              texte reste à gauche, la photo se place dans une colonne à droite.
            </p>
            <Exemple
              source={
                ':::etape\nSur le boîtier, appuyer sur le **bouton rouge** :\n\n1. Un appui court.\n2. Un appui long.\n\n![Boîtier du ballon](photo.webp)\n:::'
              }
            />
            <p>
              Un titre au-dessus d'une étape reste au-dessus : il l'emporte avec
              lui si elle passe à la page suivante. Une étape plus haute qu'une
              page s'imprime simplement texte puis photo.
            </p>
          </Section>

          <Section title="Séparation et saut de page">
            <p>
              <Bouton icon={<SeparatorHorizontal />} /> trace un trait fin entre
              deux parties. <Bouton icon={<ScissorsLineDashed />} /> insère une
              ligne <code>===</code> : la suite commence sur une nouvelle page à
              l'impression.
            </p>
          </Section>

          <Section title="Raccourcis clavier">
            <div className="space-y-1.5">
              <Shortcut
                keys={
                  <>
                    <Kbd>Ctrl</Kbd>
                    <KbdPlus />
                    <Kbd>B</Kbd>
                  </>
                }
              >
                Gras
              </Shortcut>
              <Shortcut
                keys={
                  <>
                    <Kbd>Ctrl</Kbd>
                    <KbdPlus />
                    <Kbd>I</Kbd>
                  </>
                }
              >
                Italique
              </Shortcut>
              <Shortcut
                keys={
                  <>
                    <Kbd>Ctrl</Kbd>
                    <KbdPlus />
                    <Kbd>K</Kbd>
                  </>
                }
              >
                Lien
              </Shortcut>
              <Shortcut
                keys={
                  <>
                    <Kbd>Ctrl</Kbd>
                    <KbdPlus />
                    <Kbd>Z</Kbd>
                  </>
                }
              >
                Annuler la dernière modification, y compris un clic de la barre
              </Shortcut>
              <Shortcut
                keys={
                  <>
                    <Kbd>Ctrl</Kbd>
                    <KbdPlus />
                    <Kbd>S</Kbd>
                  </>
                }
              >
                Sauvegarder
              </Shortcut>
            </div>
          </Section>

          <Section title="Pour aller plus loin">
            <p>
              L'éditeur comprend aussi les formules (entre <code>$</code>) et
              les diagrammes Mermaid. Ils ne sont utiles qu'aux documents
              techniques : on peut les ignorer.
            </p>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
