const nuitees = (n: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);

const pct = (n: number) =>
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n) + '%';

const eur = (n: number) =>
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n) + ' €';

const eurInt = (n: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) +
  ' €';

const ecartNuitees = (n: number) =>
  (n >= 0 ? '+' : '') +
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);

const ecartPts = (n: number) =>
  (n >= 0 ? '+' : '') +
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n) +
  ' pts';

const ecartEur = (n: number) =>
  (n >= 0 ? '+' : '') +
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n) +
  ' €';

const ecartEurInt = (n: number) =>
  (n >= 0 ? '+' : '') +
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) +
  ' €';

const dateFr = (isoDate: string) => {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const dayName = (isoDate: string) => {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'short' });
};

// Formatters compacts sans unités (mobile)
const compact = (n: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);

const compactDec = (n: number) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

const compactEcart = (n: number) =>
  (n >= 0 ? '+' : '') + compact(n);

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
};
