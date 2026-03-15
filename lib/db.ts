import type {
  User,
  Medication,
  Prescription,
  Booking,
  Locker,
  QRCode,
  AuditLog,
  EmailLog,
  RefillRequest,
} from "./types"

// --- Mock Drug & Allergy Data ---

export const DRUG_DATABASE: Record<string, { name: string; class: string; interactions: string[] }> = {
  amoxicillin: { name: "Amoxicillin", class: "Penicillin", interactions: ["methotrexate", "warfarin"] },
  penicillin: { name: "Penicillin V", class: "Penicillin", interactions: ["methotrexate"] },
  ibuprofen: { name: "Ibuprofen", class: "NSAID", interactions: ["aspirin", "warfarin", "lisinopril"] },
  aspirin: { name: "Aspirin", class: "NSAID", interactions: ["ibuprofen", "warfarin", "methotrexate"] },
  metformin: { name: "Metformin", class: "Biguanide", interactions: ["alcohol"] },
  lisinopril: { name: "Lisinopril", class: "ACE Inhibitor", interactions: ["ibuprofen", "potassium"] },
  warfarin: { name: "Warfarin", class: "Anticoagulant", interactions: ["aspirin", "ibuprofen", "amoxicillin"] },
  methotrexate: { name: "Methotrexate", class: "Antimetabolite", interactions: ["aspirin", "penicillin", "amoxicillin"] },
  atorvastatin: { name: "Atorvastatin", class: "Statin", interactions: ["erythromycin"] },
  omeprazole: { name: "Omeprazole", class: "PPI", interactions: ["clopidogrel"] },
  ciprofloxacin: { name: "Ciprofloxacin", class: "Fluoroquinolone", interactions: ["theophylline", "warfarin"] },
  prednisone: { name: "Prednisone", class: "Corticosteroid", interactions: ["aspirin", "ibuprofen"] },
}

export const ALLERGY_DRUG_CLASS_MAP: Record<string, string[]> = {
  Penicillin: ["amoxicillin", "penicillin"],
  NSAID: ["ibuprofen", "aspirin"],
  Sulfa: [],
  Latex: [],
  Codeine: [],
}

// --- Medications Master Collection ---

const medications: Medication[] = [
  {
    id: "med-001",
    name: "Amoxicillin",
    category: "Antibiotic",
    standardDosages: ["250mg", "500mg", "875mg"],
    form: "Capsule",
    contraindications: ["Penicillin allergy"],
    interactions: ["Methotrexate", "Warfarin"],
    sideEffects: ["Nausea", "Diarrhea", "Rash"],
  },
  {
    id: "med-002",
    name: "Ibuprofen",
    category: "NSAID",
    standardDosages: ["200mg", "400mg", "600mg", "800mg"],
    form: "Tablet",
    contraindications: ["NSAID allergy", "GI bleeding", "Kidney disease"],
    interactions: ["Aspirin", "Warfarin", "Lisinopril"],
    sideEffects: ["Stomach upset", "Dizziness", "Headache"],
  },
  {
    id: "med-003",
    name: "Metformin",
    category: "Antidiabetic",
    standardDosages: ["500mg", "850mg", "1000mg"],
    form: "Tablet",
    contraindications: ["Kidney disease", "Liver disease"],
    interactions: ["Alcohol", "Contrast dye"],
    sideEffects: ["Nausea", "Diarrhea", "Metallic taste"],
  },
  {
    id: "med-004",
    name: "Lisinopril",
    category: "ACE Inhibitor",
    standardDosages: ["2.5mg", "5mg", "10mg", "20mg", "40mg"],
    form: "Tablet",
    contraindications: ["Pregnancy", "Angioedema history"],
    interactions: ["Ibuprofen", "Potassium supplements", "Spironolactone"],
    sideEffects: ["Dry cough", "Dizziness", "Hyperkalemia"],
  },
  {
    id: "med-005",
    name: "Atorvastatin",
    category: "Statin",
    standardDosages: ["10mg", "20mg", "40mg", "80mg"],
    form: "Tablet",
    contraindications: ["Liver disease", "Pregnancy"],
    interactions: ["Erythromycin", "Grapefruit juice"],
    sideEffects: ["Muscle pain", "Headache", "Nausea"],
  },
  {
    id: "med-006",
    name: "Omeprazole",
    category: "Proton Pump Inhibitor",
    standardDosages: ["10mg", "20mg", "40mg"],
    form: "Capsule",
    contraindications: [],
    interactions: ["Clopidogrel", "Methotrexate"],
    sideEffects: ["Headache", "Nausea", "Abdominal pain"],
  },
  {
    id: "med-007",
    name: "Aspirin",
    category: "NSAID/Antiplatelet",
    standardDosages: ["81mg", "325mg", "500mg"],
    form: "Tablet",
    contraindications: ["NSAID allergy", "Bleeding disorders"],
    interactions: ["Ibuprofen", "Warfarin", "Methotrexate"],
    sideEffects: ["GI bleeding", "Bruising", "Tinnitus"],
  },
  {
    id: "med-008",
    name: "Warfarin",
    category: "Anticoagulant",
    standardDosages: ["1mg", "2mg", "2.5mg", "5mg", "7.5mg", "10mg"],
    form: "Tablet",
    contraindications: ["Active bleeding", "Pregnancy"],
    interactions: ["Aspirin", "Ibuprofen", "Amoxicillin", "Vitamin K"],
    sideEffects: ["Bleeding", "Bruising", "Hair loss"],
  },
  {
    id: "med-009",
    name: "Prednisone",
    category: "Corticosteroid",
    standardDosages: ["5mg", "10mg", "20mg", "50mg"],
    form: "Tablet",
    contraindications: ["Systemic fungal infections"],
    interactions: ["NSAIDs", "Diabetes medications"],
    sideEffects: ["Weight gain", "Mood changes", "Insomnia"],
  },
  {
    id: "med-010",
    name: "Ciprofloxacin",
    category: "Antibiotic",
    standardDosages: ["250mg", "500mg", "750mg"],
    form: "Tablet",
    contraindications: ["Tendon disorders", "Myasthenia gravis"],
    interactions: ["Theophylline", "Warfarin", "Antacids"],
    sideEffects: ["Nausea", "Diarrhea", "Tendon pain"],
  },
]

// --- In-memory data stores ---

const users: User[] = [
  {
    id: "doc-1",
    name: "Dr. Sarah Chen",
    email: "doctor@demo.com",
    role: "doctor",
    createdAt: new Date().toISOString(),
  },
  {
    id: "clinic-1",
    name: "Maria Garcia",
    email: "clinic@demo.com",

    role: "clinic_staff",
    createdAt: new Date().toISOString(),
  },
  {
    id: "pharm-1",
    name: "James Wilson",
    email: "pharmacy@demo.com",
    role: "pharmacy_staff",
    createdAt: new Date().toISOString(),
  },
  {
    id: "pat-1",
    name: "Emily Thompson",
    email: "patient@demo.com",
    role: "patient",
    allergies: ["Penicillin"],
    createdAt: new Date().toISOString(),
  },
  {
    id: "pat-2",
    name: "Robert Davis",
    email: "robert@demo.com",
    role: "patient",
    allergies: ["NSAID"],
    createdAt: new Date().toISOString(),
  },
  {
    id: "pat-3",
    name: "Lisa Park",
    email: "lisa@demo.com",
    role: "patient",
    allergies: [],
    createdAt: new Date().toISOString(),
  },
]

const prescriptions: Prescription[] = []
const bookings: Booking[] = []
const lockers: Locker[] = [
  { id: "locker-1", label: "Locker A-1", status: "available", bookingId: null },
]
const qrCodes: QRCode[] = []
const auditLogs: AuditLog[] = []
const emailLogs: EmailLog[] = []
const refillRequests: RefillRequest[] = []

// --- Helper: generate IDs ---
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// --- User Operations ---

export function getUsers(): User[] {
  return users
}

export function getPatients(): User[] {
  return users.filter((u) => u.role === "patient")
}

export function getUserById(id: string): User | undefined {
  return users.find((u) => u.id === id)
}

export function getUserByEmail(email: string): User | undefined {
  return users.find((u) => u.email === email)
}

export function createUser(data: Omit<User, "id" | "createdAt">): User {
  const user: User = {
    ...data,
    id: genId(data.role === "patient" ? "pat" : data.role.slice(0, 3)),
    createdAt: new Date().toISOString(),
  }
  users.push(user)
  return user
}

// --- Prescription Operations ---

export function getPrescriptions(): Prescription[] {
  return prescriptions
}

export function getPrescriptionById(id: string): Prescription | undefined {
  return prescriptions.find((p) => p.id === id)
}

export function getPrescriptionsByDoctor(doctorId: string): Prescription[] {
  return prescriptions.filter((p) => p.doctorId === doctorId)
}

export function getPrescriptionsByPatient(patientId: string): Prescription[] {
  return prescriptions.filter((p) => p.patientId === patientId)
}

export function getConfirmedPrescriptions(): Prescription[] {
  return prescriptions.filter((p) => p.status === "confirmed")
}

export function getBookedPrescriptions(): Prescription[] {
  return prescriptions.filter((p) => p.status === "booked" || p.status === "ready")
}

export function createPrescription(data: Omit<Prescription, "id" | "createdAt">): Prescription {
  const rx: Prescription = {
    ...data,
    id: genId("rx"),
    createdAt: new Date().toISOString(),
  }
  prescriptions.push(rx)
  return rx
}

export function updatePrescriptionStatus(id: string, status: Prescription["status"]): Prescription | undefined {
  const rx = prescriptions.find((p) => p.id === id)
  if (rx) rx.status = status
  return rx
}

// --- Booking Operations ---

export function getBookings(): Booking[] {
  return bookings
}

export function getBookingById(id: string): Booking | undefined {
  return bookings.find((b) => b.id === id)
}

export function getBookingByPrescription(prescriptionId: string): Booking | undefined {
  return bookings.find((b) => b.prescriptionId === prescriptionId)
}

export function createBooking(data: Omit<Booking, "id" | "createdAt">): Booking {
  const booking: Booking = {
    ...data,
    id: genId("bk"),
    createdAt: new Date().toISOString(),
  }
  bookings.push(booking)
  return booking
}

export function updateBookingStatus(id: string, status: Booking["status"]): Booking | undefined {
  const b = bookings.find((bk) => bk.id === id)
  if (b) b.status = status
  return b
}

// --- Locker Operations ---

export function getLockers(): Locker[] {
  return lockers
}

export function getAvailableLockers(): Locker[] {
  return lockers.filter((l) => l.status === "available")
}

export function getLockerByBooking(bookingId: string): Locker | undefined {
  return lockers.find((l) => l.bookingId === bookingId)
}

export function assignLocker(lockerId: string, bookingId: string): Locker | undefined {
  const locker = lockers.find((l) => l.id === lockerId)
  if (locker) {
    locker.status = "occupied"
    locker.bookingId = bookingId
  }
  return locker
}

export function unlockLocker(lockerId: string): Locker | undefined {
  const locker = lockers.find((l) => l.id === lockerId)
  if (locker) {
    locker.status = "unlocked"
  }
  return locker
}

export function releaseLocker(lockerId: string): Locker | undefined {
  const locker = lockers.find((l) => l.id === lockerId)
  if (locker) {
    locker.status = "available"
    locker.bookingId = null
  }
  return locker
}

// --- QR Code Operations ---

export function getQRCodes(): QRCode[] {
  return qrCodes
}

export function getQRByBooking(bookingId: string): QRCode | undefined {
  return qrCodes.find((q) => q.bookingId === bookingId && !q.used)
}

export function getQRByToken(token: string): QRCode | undefined {
  return qrCodes.find((q) => q.token === token)
}

export function createQRCode(bookingId: string, expiryMinutes: number = 60): QRCode {
  const qr: QRCode = {
    id: genId("qr"),
    bookingId,
    token: genId("tkn") + "-" + Math.random().toString(36).slice(2, 12),
    expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString(),
    used: false,
    createdAt: new Date().toISOString(),
  }
  qrCodes.push(qr)
  return qr
}

export function markQRUsed(id: string): QRCode | undefined {
  const qr = qrCodes.find((q) => q.id === id)
  if (qr) qr.used = true
  return qr
}

// --- Audit Log Operations ---

export function getAuditLogs(): AuditLog[] {
  return auditLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export function addAuditLog(userId: string, userName: string, action: string, details: string): AuditLog {
  const log: AuditLog = {
    id: genId("audit"),
    userId,
    userName,
    action,
    details,
    timestamp: new Date().toISOString(),
  }
  auditLogs.push(log)
  return log
}

// --- Email Log Operations ---

export function getEmailLogs(): EmailLog[] {
  return emailLogs.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
}

export function addEmailLog(to: string, subject: string, body: string): EmailLog {
  const log: EmailLog = {
    id: genId("email"),
    to,
    subject,
    body,
    sentAt: new Date().toISOString(),
  }
  emailLogs.push(log)
  return log
}

// --- Refill Request Operations ---

export function getRefillRequests(): RefillRequest[] {
  return refillRequests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getRefillRequestById(id: string): RefillRequest | undefined {
  return refillRequests.find((r) => r.id === id)
}

export function getRefillRequestsByDoctor(doctorId: string): RefillRequest[] {
  return refillRequests.filter((r) => r.doctorId === doctorId)
}

export function getRefillRequestsByPatient(patientId: string): RefillRequest[] {
  return refillRequests.filter((r) => r.patientId === patientId)
}

export function getPendingRefillRequestsByDoctor(doctorId: string): RefillRequest[] {
  return refillRequests.filter((r) => r.doctorId === doctorId && r.status === "pending")
}

export function createRefillRequest(data: Omit<RefillRequest, "id" | "createdAt">): RefillRequest {
  const request: RefillRequest = {
    ...data,
    id: genId("refill"),
    createdAt: new Date().toISOString(),
  }
  refillRequests.push(request)
  return request
}

export function updateRefillRequestStatus(
  id: string,
  status: RefillRequest["status"],
  rejectionReason?: string
): RefillRequest | undefined {
  const request = refillRequests.find((r) => r.id === id)
  if (request) {
    request.status = status
    request.respondedAt = new Date().toISOString()
    if (rejectionReason) {
      request.rejectionReason = rejectionReason
    }
  }
  return request
}
