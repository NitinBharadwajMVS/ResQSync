export type TriageLevel = 'critical' | 'urgent' | 'stable';

export interface Vitals {
  spo2: number;
  heartRate: number;
  bloodPressureSys: number;
  bloodPressureDia: number;
  temperature: number;
  gcs: number;
  respiratoryRate?: number;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  contact: string;
  vitals: Vitals;
  complaint: string;
  triageLevel: TriageLevel;
  medicalHistory?: string[];
  previousVisits?: {
    date: string;
    hospital: string;
    diagnosis: string;
  }[];
  timestamp: string;
}

export interface Hospital {
  id: string;
  name: string;
  distance: number;
  address: string;
  contact?: string;
  equipment?: string[];
  specialties?: string[];
  unavailableForAlert?: string; // alertId if hospital is unavailable for this specific alert
  latitude: number;
  longitude: number;
  eta?: number; // Estimated time of arrival in minutes
  isExternal?: boolean; // Flag to identify Mapbox results
}

export interface AuditLog {
  timestamp: string;
  action: string;
  actor: string;
  details: string;
}

export interface Alert {
  id: string;
  patient: Patient;
  ambulanceId: string;
  eta: number;
  status: 'pending' | 'acknowledged' | 'accepted' | 'completed' | 'declined' | 'cancelled';
  hospitalId: string;
  timestamp: string;
  completedAt?: string;
  declineReason?: string;
  requiredEquipment?: string[];
  auditLog: AuditLog[];
  previousHospitalIds?: string[]; // Track hospital changes
}
