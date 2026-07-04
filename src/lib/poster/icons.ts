/**
 * icons.ts — Collection d'icônes SVG pour le générateur d'affiches A3
 *
 * Portage fidèle de `assets/js/icons.js` (fork JS vanilla) :
 * chaque icône est un SVG inline en chaîne, viewBox "0 0 24 24",
 * stroke="currentColor" (la couleur est pilotée par le thème appliqué en amont),
 * et le stroke-width d'origine (1.2 ou 2 selon l'icône) est conservé.
 *
 * Le SVG reste une CHAÎNE : il sera injecté via `dangerouslySetInnerHTML`
 * par le composant Poster (contenu statique interne, pas de saisie utilisateur).
 * Les chaînes SVG sont recopiées à l'identique du fork (paths et stroke-width inchangés).
 */

/** Collection complète des icônes, clé → { nom lisible, SVG en chaîne }. */
export const ICONS: Record<string, { name: string; svg: string }> = {
  none: {
    name: "Pas d'icône",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"></path>
                <path d="m6 6 12 12"></path>
            </svg>`,
  },

  alert: {
    name: 'Alerte',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>`,
  },

  droplet: {
    name: 'Goutte',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
            </svg>`,
  },

  zap: {
    name: 'Éclair',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>`,
  },

  key: {
    name: 'Clé de porte',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"></path>
                <circle cx="16.5" cy="7.5" r=".5" fill="currentColor"></circle>
            </svg>`,
  },

  fire_alarm: {
    name: 'Alarme incendie',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18.518 17.347A7 7 0 0 1 14 19"></path>
                <path d="M18.8 4A11 11 0 0 1 20 9"></path>
                <path d="M9 9h.01"></path>
                <circle cx="20" cy="16" r="2"></circle>
                <circle cx="9" cy="9" r="7"></circle>
                <rect x="4" y="16" width="10" height="6" rx="2"></rect>
            </svg>`,
  },

  power_outage: {
    name: 'Coupure de courant',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m19 5 3-3"></path>
                <path d="m2 22 3-3"></path>
                <path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"></path>
                <path d="M7.5 13.5 10 11"></path>
                <path d="M10.5 16.5 13 14"></path>
                <path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"></path>
            </svg>`,
  },

  wet_paint: {
    name: 'Peinture fraîche',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m14.622 17.897-10.68-2.913"></path>
                <path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"></path>
                <path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15"></path>
            </svg>`,
  },

  toilet_out: {
    name: 'WC hors service',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18"></path>
                <path d="M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8"></path>
            </svg>`,
  },

  phone_out: {
    name: 'Téléphone hors service',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.1 13.9a14 14 0 0 0 3.732 2.668 1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2 18 18 0 0 1-12.728-5.272"></path>
                <path d="M22 2 2 22"></path>
                <path d="M4.76 13.582A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 .244.473"></path>
            </svg>`,
  },

  coffee: {
    name: 'Machine à café',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 22V12a2 2 0 0 0-2-2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v18H2"></path>
                <path d="M10 2v2a2 2 0 1 1-4 0V2"></path>
                <path d="M22 6h-4"></path>
                <path d="M22 10h-4"></path>
                <path d="M18 22v-6a2 2 0 0 1 2-2h2"></path>
                <path d="M7 10v2"></path>
                <path d="M7 22c-1.7 0-3-1.3-3-3v-3h6v3c0 1.7-1.3 3-3 3"></path>
                <path d="M2 18a2 2 0 0 1 2-2"></path>
            </svg>`,
  },

  iron: {
    name: 'Fer à repasser',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 7h.01"></path>
                <path d="M6 11h.01"></path>
                <path d="M10 11h.01"></path>
                <path d="M6 15h.01"></path>
                <path d="M10 15h.01"></path>
                <path d="M14 19v-7C14 6 9 2 8 2S2 6 2 12v7h14a2 2 0 0 0 2-2V8a2 2 0 0 1 4 0v9"></path>
                <path d="M3 22h10"></path>
            </svg>`,
  },

  kettle: {
    name: 'Bouilloire',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 6v1"></path>
                <path d="M2 22h16"></path>
                <path d="M3 18c-.6 0-1-.4-1-1v-2a8 8 0 0 1 16 0v2c0 .6-.4 1-1 1Z"></path>
                <path d="M5 8.8V7a5 5 0 0 1 10 0v1.8"></path>
                <path d="M18 14.5A9.06 9.06 0 0 0 22 7l-3-1c-1 2-3.5 5-9 5-2.5 0-4.4-.6-5.8-1.5"></path>
            </svg>`,
  },

  no_smoking: {
    name: 'Interdiction de fumer',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 12H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h13"></path>
                <path d="M18 8c0-2.5-2-2.5-2-5"></path>
                <path d="m2 2 20 20"></path>
                <path d="M21 12a1 1 0 0 1 1 1v2a1 1 0 0 1-.5.866"></path>
                <path d="M22 8c0-2.5-2-2.5-2-5"></path>
                <path d="M7 12v4"></path>
            </svg>`,
  },

  door_closed: {
    name: 'Porte fermée',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 12h.01"></path>
                <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"></path>
                <path d="M2 20h20"></path>
            </svg>`,
  },

  fire_extinguisher: {
    name: 'Extincteur',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 6.5V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3.5"></path>
                <path d="M9 18h8"></path>
                <path d="M18 3h-3"></path>
                <path d="M11 3a6 6 0 0 0-6 6v11"></path>
                <path d="M5 13h4"></path>
                <path d="M17 10a4 4 0 0 0-8 0v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2Z"></path>
            </svg>`,
  },

  flame: {
    name: 'Flamme',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"></path>
            </svg>`,
  },

  flood: {
    name: 'Inondation',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path>
                <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path>
                <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path>
            </svg>`,
  },

  elevator: {
    name: 'Ascenseur',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m6 9 3-3 3 3"></path>
                <path d="M9 6v6"></path>
                <rect width="20" height="20" x="2" y="2" rx="2"></rect>
                <path d="M15 18v-6"></path>
                <path d="m18 15-3 3-3-3"></path>
            </svg>`,
  },

  cleaning: {
    name: 'Nettoyage',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v4"/>
                <path d="M6 10h4"/>
                <path d="M10 8a2 2 0 0 1 2-2h3c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1H5C3.3 2 2 3.3 2 5c0 .6.4 1 1 1h1a2 2 0 0 1 2 2v2l-2.3 2.3c-.4.4-.7 1.1-.7 1.7v6a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-6c0-.6-.3-1.3-.7-1.7L10 10Z"/>
                <path d="M14 6c0 2 0 3 2 4"/>
                <path d="M3 16.5a6 6 0 0 1 5 0s2 1.25 5 0"/>
                <path d="M22 2h.01"/>
                <path d="M20 5.5h.01"/>
                <path d="M22 9h.01"/>
            </svg>`,
  },

  tv: {
    name: 'TV',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m14.5 12.5-5-5"/>
                <path d="m9.5 12.5 5-5"/>
                <rect width="20" height="14" x="2" y="3" rx="2"/>
                <path d="M12 17v4"/>
                <path d="M8 21h8"/>
            </svg>`,
  },

  table: {
    name: 'Table',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 6V5"/>
                <path d="M8 10a4 4 0 0 1 8 0"/>
                <path d="M6 10h12"/>
                <path d="M12 10v9"/>
                <path d="M8 19v-4c0-.6-.4-1-1-1H2"/>
                <path d="M2 8v11"/>
                <path d="M16 19v-4a1 1 0 0 1 1-1h5"/>
                <path d="M22 8v11"/>
            </svg>`,
  },

  dumbbell: {
    name: 'Fitness',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z"/>
                <path d="m2.5 21.5 1.4-1.4"/>
                <path d="m20.1 3.9 1.4-1.4"/>
                <path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z"/>
                <path d="m9.6 14.4 4.8-4.8"/>
            </svg>`,
  },

  stairs: {
    name: 'Escalier',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="10" height="4" x="2" y="16"/>
                <rect width="10" height="4" x="4" y="12"/>
                <rect width="10" height="4" x="6" y="8"/>
                <rect width="10" height="4" x="8" y="4"/>
                <path d="M12 20h10V4h-4"/>
            </svg>`,
  },

  parking: {
    name: 'Parking',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2"/>
                <path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>
            </svg>`,
  },

  bus: {
    name: 'Bus',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 6v6"/>
                <path d="M15 6v6"/>
                <path d="M2 12h19.6"/>
                <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>
                <circle cx="7" cy="18" r="2"/>
                <path d="M9 18h5"/>
                <circle cx="16" cy="18" r="2"/>
            </svg>`,
  },

  bike: {
    name: 'Vélo',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18.5" cy="17.5" r="3.5"/>
                <circle cx="5.5" cy="17.5" r="3.5"/>
                <circle cx="15" cy="5" r="1"/>
                <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
            </svg>`,
  },

  briefcase: {
    name: 'Bagage',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                <rect width="20" height="14" x="2" y="6" rx="2"/>
            </svg>`,
  },

  calendar: {
    name: 'Calendrier',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 2v4"/>
                <path d="M16 2v4"/>
                <rect width="18" height="18" x="3" y="4" rx="2"/>
                <path d="M3 10h18"/>
                <path d="M8 14h.01"/>
                <path d="M12 14h.01"/>
                <path d="M16 14h.01"/>
                <path d="M8 18h.01"/>
                <path d="M12 18h.01"/>
                <path d="M16 18h.01"/>
            </svg>`,
  },

  wine: {
    name: 'Vin',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 13h8"/>
                <path d="M5 7s-2 3-2 6a4 4 0 0 0 8 0c0-3-2-6-2-6Z"/>
                <path d="M7 17v5"/>
                <path d="M4 22h6"/>
                <path d="M18 4c0 3-3 3-3 6v11c0 .6.4 1 1 1h4c.6 0 1-.4 1-1V10c0-3-3-3-3-6"/>
                <path d="M18 4V2"/>
            </svg>`,
  },

  glass_water: {
    name: "Verre d'eau",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5.116 4.104A1 1 0 0 1 6.11 3h11.78a1 1 0 0 1 .994 1.105L17.19 20.21A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.79z"/>
                <path d="M6 12a5 5 0 0 1 6 0 5 5 0 0 0 6 0"/>
            </svg>`,
  },

  shower: {
    name: 'Douche',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 10V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/>
                <path d="M7 10h14"/>
                <path d="M3 22V4a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2"/>
                <path d="M10 14h.01"/>
                <path d="M14 14h.01"/>
                <path d="M18 14h.01"/>
                <path d="M9 18h.01"/>
                <path d="M14 18h.01"/>
                <path d="M19 18h.01"/>
                <path d="M8 22h.01"/>
                <path d="M14 22h.01"/>
                <path d="M20 22h.01"/>
            </svg>`,
  },

  tea: {
    name: 'Thé',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 8h1a4 4 0 1 1 0 8h-1"/>
                <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>
                <path d="M4 4a1 1 0 0 1 1-1 1 1 0 0 0 1-1"/>
                <path d="M10 4a1 1 0 0 1 1-1 1 1 0 0 0 1-1"/>
                <path d="M16 4a1 1 0 0 1 1-1 1 1 0 0 0 1-1"/>
                <path d="M9 8v3"/>
                <path d="M11 16v-3.5L9 11l-2 1.5V16Z"/>
            </svg>`,
  },

  martini: {
    name: 'Cocktail',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 22h8"/>
                <path d="M12 11v11"/>
                <path d="m19 3-7 8-7-8Z"/>
            </svg>`,
  },

  fork_knife: {
    name: 'Couvert',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/>
                <path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/>
                <path d="m2.1 21.8 6.4-6.3"/>
                <path d="m19 5-7 7"/>
            </svg>`,
  },

  cup_saucer: {
    name: 'Café',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 18a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4Z"/>
                <path d="M6 8h12v6a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4Z"/>
                <path d="M18 8h1a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3h-1"/>
                <path d="M6 4a1 1 0 0 1 1-1 1 1 0 0 0 1-1"/>
                <path d="M12 4a1 1 0 0 1 1-1 1 1 0 0 0 1-1"/>
                <path d="M18 4a1 1 0 0 1 1-1 1 1 0 0 0 1-1"/>
            </svg>`,
  },

  bottle: {
    name: 'Bouteille',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 2h.01"/>
                <path d="M12 3h.01"/>
                <path d="m19 8-3-3"/>
                <path d="M9.7 21.3a2.4 2.4 0 0 1-3.4 0l-3.6-3.6a2.41 2.41 0 0 1 0-3.4l6.27-6.27A3.5 3.5 0 0 1 11.45 7h1.1a3.5 3.5 0 0 0 2.47-1.03l3.62-3.61a1.21 1.21 0 0 1 1.72 0l1.28 1.28a1.2 1.2 0 0 1 0 1.72l-3.62 3.61A3.5 3.5 0 0 0 17 11.45v1.1a3.5 3.5 0 0 1-1.03 2.48Z"/>
                <path d="m9.06 8 3.23 3.24a1 1 0 0 1 0 1.41L8.65 16.3a1 1 0 0 1-1.41 0L4 13.06"/>
                <path d="M21 12h.01"/>
                <path d="M22 16h.01"/>
            </svg>`,
  },

  salad: {
    name: 'Végé',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 21h10"/>
                <path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"/>
                <path d="M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1"/>
                <path d="m13 12 4-4"/>
                <path d="M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2"/>
            </svg>`,
  },

  concierge_bell: {
    name: 'Sonnette conciergerie',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 20a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1Z"/>
                <path d="M20 16a8 8 0 1 0-16 0"/>
                <path d="M12 4v4"/>
                <path d="M10 4h4"/>
            </svg>`,
  },
}

/**
 * Retourne le SVG d'une icône (chaîne), avec repli sur `alert` si la clé est inconnue.
 * Équivalent de `Icons.getSVG` du fork.
 */
export function getIconSvg(key: string): string {
  const icon = ICONS[key]
  return icon ? icon.svg : ICONS.alert.svg
}

/**
 * Retourne le nom lisible d'une icône, avec repli sur « Alerte » si la clé est inconnue.
 * Équivalent de `Icons.getName` du fork.
 */
export function getIconName(key: string): string {
  const icon = ICONS[key]
  return icon ? icon.name : 'Alerte'
}

/**
 * Retourne la liste complète des clés d'icônes disponibles.
 * Équivalent de `Icons.getAvailableIcons` du fork.
 */
export function getAvailableIcons(): string[] {
  return Object.keys(ICONS)
}
