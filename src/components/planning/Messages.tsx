/*
 * Fil de messages de la page Planning : le retour d'une action (planning
 * généré, règle HCR touchée, refus de la base), en bas à droite, qui
 * s'efface seul (sauf `GARDER`). Le back office n'a pas de toasts globaux : ce fil est propre
 * à la page (le prototype en faisait des toasts).
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { CircleAlert, Info, TriangleAlert, X } from 'lucide-react'

import { cn } from '#/lib/utils.ts'

export type Ton = 'info' | 'attention' | 'danger'

interface Message {
  id: number
  texte: ReactNode
  ton: Ton
}

/** `dureeMs` : `GARDER` (0) garde le message jusqu'à ce qu'on le ferme (ou
 * qu'il soit poussé par les suivants : quatre au plus). Pour un message qui
 * porte une information à relire (places restées vides après une
 * génération), pas pour un simple retour d'action. */
type Notifier = (texte: ReactNode, ton?: Ton, dureeMs?: number) => void

export const GARDER = 0

const Contexte = createContext<Notifier | null>(null)

export function useNotifier(): Notifier {
  const n = useContext(Contexte)
  if (!n) throw new Error('useNotifier hors de <FilMessages>')
  return n
}

/** Comme `useNotifier`, mais sans fil (écran rendu seul, en test) ne dit
 * rien au lieu de lever. */
export function useNotifierOptionnel(): Notifier {
  return useContext(Contexte) ?? rien
}
const rien: Notifier = () => {}

export function FilMessages({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([])
  const suivant = useRef(0)
  const retirer = useCallback((id: number) => {
    setMessages((ms) => ms.filter((m) => m.id !== id))
  }, [])
  const notifier = useCallback<Notifier>(
    (texte, ton = 'info', dureeMs) => {
      const id = ++suivant.current
      setMessages((ms) => [...ms.slice(-3), { id, texte, ton }])
      if (dureeMs === GARDER) return
      window.setTimeout(
        () => retirer(id),
        dureeMs ?? (ton === 'info' ? 5000 : 9000),
      )
    },
    [retirer],
  )
  const valeur = useMemo(() => notifier, [notifier])
  return (
    <Contexte.Provider value={valeur}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {messages.map((m) => {
          const Icone =
            m.ton === 'danger'
              ? CircleAlert
              : m.ton === 'attention'
                ? TriangleAlert
                : Info
          return (
            <div
              key={m.id}
              className={cn(
                'pointer-events-auto flex items-start gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm shadow-lg',
                m.ton === 'danger' && 'border-destructive/50',
                m.ton === 'attention' && 'border-amber-500/50',
              )}
            >
              <Icone
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  m.ton === 'danger' && 'text-destructive',
                  m.ton === 'attention' && 'text-amber-500',
                  m.ton === 'info' && 'text-primary',
                )}
              />
              <div className="min-w-0 flex-1">{m.texte}</div>
              <button
                type="button"
                onClick={() => retirer(m.id)}
                className="rounded-sm text-muted-foreground hover:text-foreground"
                aria-label="Fermer le message"
              >
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </Contexte.Provider>
  )
}
