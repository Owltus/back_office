export type UserRole = 'utilisateur' | 'super_utilisateur' | 'admin';

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  created_at: string;
}

export interface HotelConfig {
  id: number;
  name: string;
  code: string;
  total_rooms: number;
  updated_at: string;
}

export interface KPIBlock {
  nuitees: number;
  to: number;
  pm: number;
  revpar: number;
  roomRevenue: number;
}

export interface DailyReport {
  id: number;
  date: string;
  month: number;
  year: number;
  day_of_month: number;
  days_in_month: number;
  rj_nuitees: number;
  rj_to: number;
  rj_pm: number;
  rj_revpar: number;
  rj_room_revenue: number;
  rmtd_nuitees: number;
  rmtd_to: number;
  rmtd_pm: number;
  rmtd_revpar: number;
  rmtd_room_revenue: number;
  pm_nuitees: number;
  pm_to: number;
  pm_pm: number;
  pm_revpar: number;
  pm_room_revenue: number;
  imported_at: string;
  imported_by: string;
  alerts: Alert[];
}

export interface Alert {
  type: 'error' | 'warning';
  message: string;
}

export interface MonthBudget {
  id: number;
  year: number;
  month: number;
  nuitees: number;
  taux_occupation: number;
  prix_moyen: number;
  revpar: number;
  room_revenue: number;
}

export interface ForecastDay {
  id: number;
  date: string;
  month: number;
  year: number;
  occ: number;
  rev_ht: number;
  rev_ttc: number;
  adr_ttc: number;
  occ_percent: number;
}

export interface Ecart {
  nuitees: number;
  to: number;
  pm: number;
  revpar: number;
  roomRevenue: number;
}

export interface ReportDate {
  date: Date;
  dayOfMonth: number;
  month: number;
  year: number;
  daysInMonth: number;
}

export interface ComparisonData {
  today: {
    occupiedRoomsExclComp: number;
    totalRevenueHT: number;
    totalRevenueTTC: number;
    vat: number;
  };
  mtd: {
    occupiedRoomsExclComp: number;
    totalRevenueHT: number;
    totalRevenueTTC: number;
  };
}

export interface ForecastRow {
  date: string;
  month: number;
  year: number;
  occ: number;
  revHT: number;
  revTTC: number;
}
