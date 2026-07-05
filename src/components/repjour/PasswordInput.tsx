import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { validatePassword } from '#/lib/repjour/password.ts'
import { Input } from '#/components/ui/input.tsx'

interface Props {
  value: string
  onChange: (v: string) => void
  /** Active un second champ de confirmation (double saisie) si fourni. */
  confirmValue?: string
  onConfirmChange?: (v: string) => void
  placeholder?: string
  optional?: boolean
}

/*
 * Champ mot de passe MASQUÉ (points) avec bouton œil pour révéler/masquer,
 * checklist de validation en direct (validatePassword — politique 12 caractères
 * + classes) et, si `onConfirmChange` est fourni, une SECONDE saisie de
 * confirmation avec contrôle d'égalité (« ne correspondent pas »). Thème dark du
 * Back Office (Input shadcn, tokens muted/emerald/destructive).
 */
function MaskedInput({
  value,
  onChange,
  placeholder,
  reveal,
  onToggleReveal,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  reveal: boolean
  onToggleReveal: () => void
}) {
  return (
    <div className="relative">
      <Input
        type={reveal ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        className="pr-10"
      />
      <button
        type="button"
        onClick={onToggleReveal}
        aria-label={
          reveal ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
        }
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export function PasswordInput({
  value,
  onChange,
  confirmValue,
  onConfirmChange,
  placeholder,
  optional = false,
}: Props) {
  const [reveal, setReveal] = useState(false)
  const toggleReveal = () => setReveal((r) => !r)

  const checks = validatePassword(value)
  const isEmpty = value.length === 0
  const confirm = confirmValue ?? ''
  const mismatch =
    onConfirmChange !== undefined && confirm.length > 0 && confirm !== value

  return (
    <div className="space-y-2">
      <MaskedInput
        value={value}
        onChange={onChange}
        placeholder={placeholder || 'Mot de passe'}
        reveal={reveal}
        onToggleReveal={toggleReveal}
      />

      {onConfirmChange !== undefined && (
        <MaskedInput
          value={confirm}
          onChange={onConfirmChange}
          placeholder="Confirmer le mot de passe"
          reveal={reveal}
          onToggleReveal={toggleReveal}
        />
      )}

      {mismatch && (
        <p className="text-xs text-destructive">
          Les mots de passe ne correspondent pas.
        </p>
      )}

      {optional && isEmpty && (
        <p className="text-xs text-muted-foreground">
          Laisser vide pour ne pas changer.
        </p>
      )}

      {/* Règles du mot de passe : TOUJOURS visibles (rappel des critères, en gris
          puis vert à mesure qu'ils sont respectés). */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-1.5 text-xs">
            <span
              className={c.valid ? 'text-emerald-500' : 'text-muted-foreground'}
            >
              {c.valid ? '✓' : '•'}
            </span>
            <span
              className={c.valid ? 'text-emerald-500' : 'text-muted-foreground'}
            >
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
