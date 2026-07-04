/**
 * templates.ts — Templates pré-remplis pour situations d'hôtel
 * Collection de messages types avec humour et professionnalisme.
 * Porté du fork (assets/js/templates.js).
 *
 * Note de portage : les `<br><br>` des messages du fork sont remplacés par
 * des sauts de ligne normaux `\n\n` (le rendu React contrôle \n → <br>).
 * La fonction applyTemplate du fork (qui mutait le DOM) n'est PAS portée :
 * elle est remplacée par un setter d'état React côté composant.
 */

import type { ColorKey } from './config.ts'

/** Un template d'affiche prédéfini */
export interface Template {
  name: string
  icon: string
  color: ColorKey
  titleFr: string
  messageFr: string
  titleEn: string
  messageEn: string
}

/** Entrée de la liste des templates disponibles */
export interface TemplateListItem {
  key: string
  name: string
  icon: string
}

/** Collection des templates prédéfinis */
export const collection = {
  // ===== MAINTENANCE & PANNES =====
  coffee_broken: {
    name: 'Machine à café en panne',
    icon: 'coffee',
    color: 'okko',
    titleFr: 'MACHINE À CAFÉ TEMPORAIREMENT INDISPONIBLE',
    messageFr: 'Notre machine à café a besoin d\'un petit repos ! Bonne nouvelle : sa jumelle vous accueille juste à côté pour vous servir un excellent café. Pendant ce temps, notre équipe s\'active pour ramener celle-ci en service.\n\nMerci de votre compréhension !',
    titleEn: 'COFFEE MACHINE TEMPORARILY UNAVAILABLE',
    messageEn: 'Our coffee machine needs a little rest! Good news: its twin is waiting right next door to serve you an excellent coffee. In the meantime, our team is working hard to get this one back in service.\n\nThank you for your understanding!',
  },

  elevator_maintenance: {
    name: 'Maintenance ascenseur',
    icon: 'elevator',
    color: 'okko',
    titleFr: 'MAINTENANCE ASCENSEUR',
    messageFr: 'Notre ascenseur bénéficie d\'une maintenance essentielle pour garantir son bon fonctionnement tout au long de l\'année. Pendant cette courte période, les escaliers restent à votre disposition. Notre équipe travaille activement pour rétablir le service au plus vite.\n\nMerci de votre compréhension et de votre patience !',
    titleEn: 'ELEVATOR MAINTENANCE',
    messageEn: 'Our elevator is undergoing essential maintenance to ensure its smooth operation throughout the year. During this short period, the stairs remain at your disposal. Our team is working actively to restore service as quickly as possible.\n\nThank you for your understanding and patience!',
  },

  water_outage: {
    name: 'Coupure d\'eau',
    icon: 'droplet',
    color: 'blue',
    titleFr: 'COUPURE D\'EAU PROGRAMMÉE',
    messageFr: 'En raison d\'une maintenance nécessaire sur notre réseau d\'eau, le service sera temporairement indisponible. Nos équipes œuvrent pour rétablir l\'eau courante dans les meilleurs délais.\n\nNous nous excusons sincèrement pour ce désagrément et vous remercions de votre patience !',
    titleEn: 'SCHEDULED WATER OUTAGE',
    messageEn: 'Due to necessary maintenance on our water network, the service will be temporarily unavailable. Our teams are working to restore running water as soon as possible.\n\nWe sincerely apologize for this inconvenience and thank you for your patience!',
  },

  power_outage: {
    name: 'Coupure électrique',
    icon: 'power_outage',
    color: 'yellow',
    titleFr: 'COUPURE ÉLECTRIQUE PLANIFIÉE',
    messageFr: 'Dans le cadre d\'un contrôle de sécurité sur nos installations électriques, une brève coupure de courant est programmée et ne durera que quelques instants. Cette vérification est essentielle pour assurer le bon fonctionnement de nos équipements. Nos équipes œuvrent pour rétablir le service dans les meilleurs délais.\n\nNous nous excusons sincèrement pour ce désagrément et vous remercions de votre patience !',
    titleEn: 'PLANNED POWER OUTAGE',
    messageEn: 'As part of a safety inspection of our electrical installations, a brief power outage is scheduled and will last only a few moments. This inspection is essential to ensure the proper functioning of our equipment. Our teams are working to restore service as soon as possible.\n\nWe sincerely apologize for this inconvenience and thank you for your patience!',
  },

  // ===== SÉCURITÉ & TESTS =====
  fire_alarm_test: {
    name: 'Test alarme incendie',
    icon: 'fire_alarm',
    color: 'red',
    titleFr: 'TEST D\'ALARME INCENDIE',
    messageFr: 'Un test de notre système d\'alarme incendie sera effectué aujourd\'hui. Vous entendrez une sonnerie pendant 5 minutes, mais ne vous inquiétez pas : c\'est juste un exercice ! Aucune évacuation n\'est nécessaire. Continuez vos activités normalement.\n\nNous nous excusons sincèrement pour cette gêne et vous remercions de votre compréhension !',
    titleEn: 'FIRE ALARM TEST',
    messageEn: 'A test of our fire alarm system will be conducted today. You will hear an alarm for 5 minutes, but don\'t worry: it\'s just a drill! No evacuation is necessary. Continue your activities normally.\n\nWe sincerely apologize for this inconvenience and thank you for your understanding!',
  },

  // ===== TRAVAUX & RÉNOVATIONS =====
  wet_paint: {
    name: 'Peinture fraîche',
    icon: 'wet_paint',
    color: 'okko',
    titleFr: 'ATTENTION PEINTURE FRAÎCHE',
    messageFr: 'Nous embellissons votre hôtel ! Attention à ne pas toucher les murs fraîchement peints. Nous vous remercions de votre patience pendant cette période d\'amélioration. Le résultat en vaudra la chandelle !',
    titleEn: 'CAUTION WET PAINT',
    messageEn: 'We are beautifying your hotel! Please be careful not to touch freshly painted walls. We thank you for your patience during this improvement period. The result will be worth it!',
  },

  // ===== SERVICES & COMMODITÉS =====
  toilet_out: {
    name: 'Toilettes indisponibles',
    icon: 'toilet_out',
    color: 'okko',
    titleFr: 'TOILETTES TEMPORAIREMENT FERMÉES',
    messageFr: 'Ces toilettes sont temporairement indisponibles. Nous vous invitons à utiliser les toilettes de votre chambre. Notre équipe technique travaille à résoudre le problème dans les meilleurs délais.\n\nNous nous excusons sincèrement pour ce désagrément et vous remercions de votre compréhension !',
    titleEn: 'RESTROOMS TEMPORARILY CLOSED',
    messageEn: 'These restrooms are temporarily unavailable. We invite you to use the restrooms in your room. Our technical team is working to resolve the issue as soon as possible.\n\nWe sincerely apologize for this inconvenience and thank you for your understanding!',
  },
} as const satisfies Record<string, Template>

/** Clé d'un template de la collection */
export type TemplateKey = keyof typeof collection

/**
 * Retourne la liste des templates disponibles
 */
export function getTemplatesList(): TemplateListItem[] {
  return Object.entries(collection).map(([key, template]) => ({
    key,
    name: template.name,
    icon: template.icon,
  }))
}

/**
 * Récupère un template par sa clé
 */
export function getTemplate(key: string): Template | null {
  return (collection as Record<string, Template>)[key] || null
}
