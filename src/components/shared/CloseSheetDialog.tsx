import { Check } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { titleCaseName } from '#/lib/utils.ts'

/**
 * Une anomalie présentée au moment de clôturer : un titre court (avec le chiffre
 * en jeu) et une explication accessible à un débutant — le « pourquoi », et quoi
 * faire. Le board affiche déjà le détail ; ici on ne garde que l'essentiel.
 */
export interface CloseIssue {
  title: string
  detail: string
}

interface CloseSheetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Titre du modal (ex. « Clôturer la caisse »). */
  title: string
  /** Contexte sous le titre (ex. « Lundi 21 juillet 2026 — Matin »). */
  subtitle: string
  /** Anomalies à vérifier. Liste VIDE = tout va bien (verdict vert). */
  issues: CloseIssue[]
  /** Verdict positif (aucune anomalie) : titre court + raison didactique. */
  okTitle: string
  okReason: string
  /** Conseil optionnel affiché sous la liste d'anomalies (ex. « à justifier »). */
  hint?: string
  hotelierName: string
  onHotelierNameChange: (value: string) => void
  onConfirm: () => void
  /** Clôture en cours (bloque le bouton, en plus du nom requis). */
  busy?: boolean
}

/**
 * Modal de clôture PARTAGÉ (caisse + rapprochement), volontairement SIMPLE : le
 * board affiche déjà toutes les données, le modal ne les redit pas. Sa seule
 * valeur = un VERDICT clair au moment de figer le rapport — soit « tout va bien »
 * avec le pourquoi, soit la liste des anomalies, chacune expliquée pour qu'un
 * débutant comprenne ce qui cloche. NON bloquant : seul le nom de l'hôtelier est
 * requis (on peut clôturer un écart, à condition de le justifier).
 */
export function CloseSheetDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  issues,
  okTitle,
  okReason,
  hint,
  hotelierName,
  onHotelierNameChange,
  onConfirm,
  busy = false,
}: CloseSheetDialogProps) {
  const allGood = issues.length === 0
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {allGood ? (
            <div className="flex gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-emerald-500">
              <Check className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-0.5">
                <div className="font-medium">{okTitle}</div>
                <p className="text-emerald-500/80">{okReason}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-md bg-amber-500/10 px-3 py-2 text-amber-500">
              <div className="font-medium">
                {issues.length} point{issues.length > 1 ? 's' : ''} à vérifier
                avant de clôturer
              </div>
              <ul className="space-y-2">
                {issues.map((issue) => (
                  <li key={issue.title} className="space-y-0.5">
                    <div className="font-medium">{issue.title}</div>
                    <p className="text-amber-500/80">{issue.detail}</p>
                  </li>
                ))}
              </ul>
              {hint ? (
                <p className="text-xs text-amber-500/70">{hint}</p>
              ) : null}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="close-hotelier">Nom de l'hôtelier</Label>
            <Input
              id="close-hotelier"
              value={hotelierName}
              // Casse forcée à chaque frappe (input contrôlé) : « MARTIN » →
              // « Martin », « JEAN-MICHEL » → « Jean-Michel » — impossible d'y
              // laisser une majuscule intempestive, Shift/Verr. Maj. compris.
              onChange={(e) => onHotelierNameChange(titleCaseName(e.target.value))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={onConfirm} disabled={busy || !hotelierName.trim()}>
            Clôturer définitivement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
