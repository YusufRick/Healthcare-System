export type UserRole = "doctor" | "clinic_staff" | "pharmacy_staff" | "patient"

export type PrescriptionStatus =
  | "draft"
  | "confirmed"
  | "booked"
  | "ready"
  | "collected"
  | "expired"

export type BookingStatus =
  | "pending"
  | "locker_assigned"
  | "ready"
  | "collected"
  | "expired"

export type RefillRequestStatus = "pending" | "approved" | "rejected"

export type LockerStatus = "available" | "occupied" | "unlocked"

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH"

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO"

export type AlertType = "allergy" | "interaction" | "dosage" | "age"

export type BookingCreatorRole = "clinic_staff" | "patient"

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  allergies?: string[]
  status?: "active" | "disabled"
  createdAt: string
  updatedAt?: string
}

// Master medication data
export interface Medication {
  id: string
  name: string
  category: string
  standardDosages: string[]
  form: string
  contraindications: string[]
  interactions: string[]
  sideEffects: string[]
}

// Medication inside a prescription
export interface PrescribedMedication {
  medId: string
  name: string
  dosage: string

}

// Legacy type for older risk-check code
export interface MedicationItem {
  name: string
  dosage: string
}

export interface RiskAlert {
  type: AlertType
  severity: AlertSeverity
  message: string
}

export interface RiskAssessment {
  score: number
  level: RiskLevel
  alerts: RiskAlert[]
}

export interface Prescription {
  id: string
  doctorId: string
  patientId: string
  patientName: string
  clinicId?: string
  medications: PrescribedMedication[]
  notes: string
  riskAssessment: RiskAssessmentResult | null
  status: PrescriptionStatus
  createdAt: string
}

export interface Booking {
  id: string
  prescriptionId: string
  patientEmail: string
  pickupTime: string
  pharmacyName: string
  createdById: string
  createdByRole: BookingCreatorRole
  status: BookingStatus
  createdAt: string
}

export interface Locker {
  id: string
  label: string
  status: LockerStatus
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
  createdAt: string
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
  status: RefillRequestStatus
  rejectionReason?: string
  createdAt: string
  respondedAt?: string
}

/* =========================
   Validation / OpenFDA types
   ========================= */

export type ValidationSeverity = "low" | "medium" | "high"

export interface ValidationIssue {
  code: string
  severity: ValidationSeverity
  message: string
  medicationName?: string
}

export interface MedicationInput {
  name: string
  dosage: string
}

export interface PrescriptionInput {
  medications: MedicationInput[]
  patientAllergies?: string[]
}

export interface RiskAssessmentResult {
  issues: ValidationIssue[]
  status: "safe" | "review" | "unsafe"
}