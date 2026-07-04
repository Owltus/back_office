export interface PasswordCheck {
  label: string;
  valid: boolean;
}

export function validatePassword(password: string): PasswordCheck[] {
  return [
    { label: '12 caractères minimum', valid: password.length >= 12 },
    { label: 'Une majuscule', valid: /[A-Z]/.test(password) },
    { label: 'Une minuscule', valid: /[a-z]/.test(password) },
    { label: 'Un chiffre', valid: /[0-9]/.test(password) },
    { label: 'Un caractère spécial (!@#$%...)', valid: /[^a-zA-Z0-9]/.test(password) },
  ];
}

export function isPasswordValid(password: string): boolean {
  return validatePassword(password).every((c) => c.valid);
}
