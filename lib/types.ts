export type UserRole = "doctor" | "clinic_staff" | "pharmacy_staff" | "patient"

export interface User {
  id: string
  name: string
  email: string
  password: string
  role: UserRole
  allergies?: string[]
  createdAt: string
}

// Master medication data (separate collection)
export interface Medication {
  medId: string
  name: string
  category: string
  standardDosages: string[]       // e.g., ["100mg", "250mg", "500mg"]
  form: string                    // e.g., "tablet", "capsule", "injection"
  contraindications: string[]
  interactions: string[]
  sideEffects: string[]
}

// Prescribed medication (embedded in prescription)
export interface PrescribedMedication {
  medId: string
  name: string                    // Denormalized for display
  dosage: string                  // e.g., "500mg"
  frequency: string               // e.g., "twice daily"
  duration: string                // e.g., "7 days"
  quantity: number                // e.g., 14 tablets
  instructions: string            // e.g., "take with food"
}

// Legacy type for backward compatibility
export interface MedicationItem {
  name: string
  dosage: string
}

export interface Prescription {
  id: string
  doctorId: string
  patientId: string
  patientName: string
  clinicId: string
  medications: PrescribedMedication[]
  notes: string                   // General prescription notes from doctor
  riskAssessment: RiskAssessment | null
  status: "draft" | "confirmed" | "booked" | "ready" | "collected" | "expired"
  createdAt: string
}

export interface RiskAssessment {
  score: number
  level: "LOW" | "MEDIUM" | "HIGH" | "Low" | "Medium" | "High"
  alerts: RiskAlert[]
}

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO"

export type AlertType =
  | "allergy"
  | "interaction"
  | "dosage"
  | "age"

export interface RiskAlert {
  type: AlertType
  severity: AlertSeverity
  message: string
}

export interface Booking {
  id: string
  prescriptionId: string
  patientEmail: string
  pickupTime: string
  pharmacyName: string
  clinicStaffId: string
  status: "pending" | "locker_assigned" | "ready" | "collected" | "expired"
  createdAt: string
}

export interface Locker {
  id: string
  label: string
  status: "available" | "occupied" | "unlocked"
  bookingId: string | null
}

export interface QRCode {
  id: string
  bookingId: string
  token: string
  expiresAt: string
  used: boolean
  createdAt: string
}

export interface AuditLog {
  id: string
  userId: string
  userName: string
  action: string
  details: string
  timestamp: string
}

export interface EmailLog {
  id: string
  to: string
  subject: string
  body: string
  sentAt: string
}

export interface RefillRequest {
  id: string
  prescriptionId: string
  patientId: string
  patientName: string
  patientEmail: string
  doctorId: string
  medications: PrescribedMedication[]
  reason: string
  status: "pending" | "approved" | "rejected"
  rejectionReason?: string
  createdAt: string
  respondedAt?: string
}
