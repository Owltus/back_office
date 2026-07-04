import { validatePassword } from '#/lib/repjour/password.ts'
import { Input } from '#/components/ui/input.tsx'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  optional?: boolean
}

/*
 * Champ mot de passe + checklist de validation en direct — porté de la source
 * PasswordInput. La checklist s'appuie sur `validatePassword`
 * (#/lib/repjour/password.ts, politique 12 caractères + classes). Restylé du
 * thème CLAIR source vers le thème DARK du Back Office (Input shadcn, tokens
 * muted/emerald). Le `type="text"` de la source est conservé : c'est un outil
 * d'admin/profil où l'utilisateur doit VOIR le mot de passe qu'il saisit.
 */
export function PasswordInput({
  value,
  onChange,
  placeholder,
  optional = false,
}: Props) {
  const checks = validatePassword(value)
  const showChecks = value.length > 0

  return (
    <div>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Mot de passe'}
      />
      {!showChecks && !optional && (
        <p className="mt-1 text-xs text-muted-foreground">
          Min. 12 caractères, 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère
          spécial.
        </p>
      )}
      {showChecks && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          {checks.map((c) => (
            <div key={c.label} className="flex items-center gap-1.5 text-xs">
              <span
                className={
                  c.valid ? 'text-emerald-500' : 'text-muted-foreground'
                }
              >
                {c.valid ? '✓' : '•'}
              </span>
              <span
                className={
                  c.valid ? 'text-emerald-500' : 'text-muted-foreground'
                }
              >
                {c.label}
              </span>
            </div>
          ))}
        </div>
      )}
      {optional && !showChecks && (
        <p className="mt-1 text-xs text-muted-foreground">
          Laisser vide pour ne pas changer.
        </p>
      )}
    </div>
  )
}
