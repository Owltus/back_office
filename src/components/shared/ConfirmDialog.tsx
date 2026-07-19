import { useCallback, useState, type ReactNode } from 'react'

import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'

/**
 * Modale de confirmation d'une action (remplace `window.confirm`). Deux boutons :
 * annuler (ferme) et confirmer (exécute puis ferme). `destructive` teinte le
 * bouton de confirmation en rouge pour les suppressions.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description != null && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export interface ConfirmRequest {
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

/**
 * Variante PROMISE de la confirmation, pratique dans les listes où chaque ligne a sa propre
 * action : `if (await confirm({ … })) { … }`. Renvoie `confirm` et l'élément `confirmDialog`
 * à monter une seule fois dans l'arbre. Ergonomique (attraper le mesclic destructeur), pas
 * sécuritaire : l'autorité reste côté serveur (RPC + RLS).
 */
export function useConfirm() {
  const [req, setReq] = useState<ConfirmRequest | null>(null)
  const [resolver, setResolver] = useState<((v: boolean) => void) | null>(null)

  const confirm = useCallback((request: ConfirmRequest) => {
    setReq(request)
    return new Promise<boolean>((resolve) => setResolver(() => resolve))
  }, [])

  const close = (value: boolean) => {
    resolver?.(value)
    setResolver(null)
    setReq(null)
  }

  const confirmDialog = (
    <Dialog
      open={!!req}
      onOpenChange={(open) => {
        if (!open) close(false)
      }}
    >
      {req && (
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{req.title}</DialogTitle>
            {req.description != null && (
              <DialogDescription>{req.description}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {req.cancelLabel ?? 'Annuler'}
            </Button>
            <Button
              variant={req.destructive ? 'destructive' : 'default'}
              onClick={() => close(true)}
            >
              {req.confirmLabel ?? 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )

  return { confirm, confirmDialog }
}
