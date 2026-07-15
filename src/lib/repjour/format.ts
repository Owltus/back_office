// Instances Intl créées UNE fois au niveau module et réutilisées : construire un
// `Intl.NumberFormat` est coûteux (résolution locale + options), et ces
// formatters sont appelés des centaines de fois par render (tableaux analytique,
// KPI). `nf0` = entier, `nf1` = 1 décimale.
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const sign = (n: number) => (n >= 0 ? '+' : '');

const nuitees = (n: number) => nf0.format(n);

const pct = (n: number) => nf1.format(n) + '%';

const eur = (n: number) => nf1.format(n) + ' €';

const eurInt = (n: number) => nf0.format(n) + ' €';

const ecartNuitees = (n: number) => sign(n) + nf0.format(n);

const ecartPts = (n: number) => sign(n) + nf1.format(n) + ' pts';

const ecartEur = (n: number) => sign(n) + nf1.format(n) + ' €';

const ecartEurInt = (n: number) => sign(n) + nf0.format(n) + ' €';

const dateFr = (isoDate: string) => {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const dayName = (isoDate: string) => {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'short' });
};

// Formatters compacts sans unités (mobile)
const compact = (n: number) => nf0.format(n);

const compactDec = (n: number) => nf1.format(n);

const compactEcart = (n: number) => sign(n) + nf0.format(n);

// Écart compact à 1 décimale, signé et sans unité (TO / RevPAR mobile).
const compactEcartDec = (n: number) => sign(n) + nf1.format(n);

export const fmt = {
  nuitees,
  pct,
  eur,
  eurInt,
  ecartNuitees,
  ecartPts,
  ecartEur,
  ecartEurInt,
  dateFr,
  dayName,
  compact,
  compactDec,
  compactEcart,
  compactEcartDec,
};
