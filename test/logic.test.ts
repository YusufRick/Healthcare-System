import { describe, it, expect, beforeEach, vi } from "vitest"
 
// ─────────────────────────────────────────────────────────────────────────────
// TYPES (mirrors lib/types.ts)
// ─────────────────────────────────────────────────────────────────────────────
 
type UserRole = "doctor" | "clinic_staff" | "pharmacy_staff" | "patient"
type PrescriptionStatus = "confirmed" | "booked" | "ready" | "collected" | "expired"
type BookingStatus = "pending" | "locker_assigned" | "ready" | "collected" | "expired"
type RefillStatus = "pending" | "approved" | "rejected"
 
interface User {
  id: string; name: string; email: string; role: UserRole
  allergies?: string[]; status?: "active" | "disabled"
}
 
interface PrescribedMedication {
  medId: string; name: string; dosage: string; frequency: string
  duration: string; quantity: number; instructions: string
}
 
interface RiskAssessmentResult {
  status: "safe" | "review" | "unsafe"
  issues: { code: string; severity: string; message: string; medicationName: string }[]
}
 
interface Prescription {
  id: string; doctorId: string; patientId: string; patientName: string
  medications: PrescribedMedication[]; notes: string
  riskAssessment: RiskAssessmentResult | null; status: PrescriptionStatus; createdAt: string
}
 
interface Booking {
  id: string; prescriptionId: string; patientEmail: string
  pickupTime: string; pharmacyName: string; status: BookingStatus
  createdById: string; createdByRole: string; createdAt: string
}
 
interface Locker {
  id: string; label: string; status: "available" | "occupied" | "unlocked"; bookingId?: string
}
 
interface QRCode {
  id: string; bookingId: string; token: string
  expiresAt: string; used: boolean
}
 
interface RefillRequest {
  id: string; prescriptionId: string; patientId: string; patientName: string
  patientEmail: string; doctorId: string
  medications: PrescribedMedication[]; reason: string
  status: RefillStatus; createdAt: string
}
 
// ─────────────────────────────────────────────────────────────────────────────
// IN-MEMORY STORE  (replaces Firestore for testing)
// ─────────────────────────────────────────────────────────────────────────────
 
function createStore() {
  const users: Record<string, User> = {
    "doc-1":    { id: "doc-1",    name: "Dr. Sarah Wilson", email: "doctor@demo.com",   role: "doctor",          status: "active" },
    "clinic-1": { id: "clinic-1", name: "John Smith",        email: "clinic@demo.com",   role: "clinic_staff",    status: "active" },
    "pharm-1":  { id: "pharm-1",  name: "Mary Johnson",      email: "pharmacy@demo.com", role: "pharmacy_staff",  status: "active" },
    "pat-1":    { id: "pat-1",    name: "Emily Thompson",    email: "patient@demo.com",  role: "patient",         status: "active", allergies: ["Penicillin"] },
  }
 
  const prescriptions: Record<string, Prescription> = {}
  const bookings:      Record<string, Booking>      = {}
  const lockers:       Record<string, Locker>       = {
    "locker-A": { id: "locker-A", label: "A1", status: "available" },
    "locker-B": { id: "locker-B", label: "B2", status: "occupied",  bookingId: "existing-booking" },
  }
  const qrCodes:       Record<string, QRCode>       = {}
  const refillRequests: Record<string, RefillRequest> = {}
  const auditLogs:     { action: string; details: string }[] = []
  const emailsSent:    { to: string; subject: string }[] = []
 
  let idCounter = 1
  const newId = () => `id-${idCounter++}`
 
  return { users, prescriptions, bookings, lockers, qrCodes, refillRequests, auditLogs, emailsSent, newId }
}
 
// ─────────────────────────────────────────────────────────────────────────────
// REIMPLEMENTED ACTION FUNCTIONS  (logic mirrors lib/actions.ts, Firestore replaced)
// ─────────────────────────────────────────────────────────────────────────────
 
function buildActions(store: ReturnType<typeof createStore>, session: User | null) {
 
  function getSession() { return session }
 
  async function getUserById(id: string): Promise<User | null> {
    return store.users[id] ?? null
  }
 
  async function addAuditLog(userId: string, userName: string, action: string, details: string) {
    store.auditLogs.push({ action, details })
  }
 
  async function sendEmail(opts: { to: string; subject: string; html: string }) {
    store.emailsSent.push({ to: opts.to, subject: opts.subject })
    return { success: true }
  }
 
  // ── submitPrescription ────────────────────────────────────────────────────
  async function submitPrescription(
    doctorId: string,
    doctorName: string,
    patientId: string,
    medications: PrescribedMedication[],
    notes: string,
    riskAssessment: RiskAssessmentResult | null
  ) {
    if (!doctorId || !doctorName) return { error: "Missing doctor details" }
 
    const patient = await getUserById(patientId)
    if (!patient) return { error: "Patient not found" }
 
    const id = store.newId()
    const prescription: Prescription = {
      id, doctorId, patientId, patientName: patient.name,
      medications, notes, riskAssessment, status: "confirmed",
      createdAt: new Date().toISOString(),
    }
    store.prescriptions[id] = prescription
 
    const medSummary = medications.map(m => `${m.name} ${m.dosage}`).join(", ")
    await addAuditLog(doctorId, doctorName, "Prescription Confirmed",
      `Prescription ${id} for ${patient.name}: ${medSummary}`)
 
    if (riskAssessment) {
      await addAuditLog(doctorId, doctorName, "Risk Assessment",
        `Risk: ${riskAssessment.status} for ${medSummary} - ${patient.name}`)
    }
 
    return { prescriptionId: id }
  }
 
  // ── submitBooking (clinic staff) ──────────────────────────────────────────
  async function submitBooking(
    prescriptionId: string,
    patientEmail: string,
    pickupTime: string,
    pharmacyName: string
  ) {
    const s = getSession()
    if (!s || s.role !== "clinic_staff") return { error: "Unauthorized" }
 
    const rx = store.prescriptions[prescriptionId]
    if (!rx) return { error: "Prescription not found" }
 
    const id = store.newId()
    const booking: Booking = {
      id, prescriptionId, patientEmail, pickupTime, pharmacyName,
      status: "pending", createdById: s.id, createdByRole: "clinic_staff",
      createdAt: new Date().toISOString(),
    }
    store.bookings[id] = booking
    store.prescriptions[prescriptionId] = { ...rx, status: "booked" }
 
    await addAuditLog(s.id, s.name, "Booking Created",
      `Booking ${id} for prescription ${prescriptionId} at ${pharmacyName}`)
 
    return { bookingId: id }
  }
 
  // ── assignLockerToBooking (pharmacy staff) ────────────────────────────────
  async function assignLockerToBooking(bookingId: string, lockerId: string) {
    const s = getSession()
    if (!s || s.role !== "pharmacy_staff") return { error: "Unauthorized" }
 
    const booking = store.bookings[bookingId]
    if (!booking) return { error: "Booking not found" }
 
    const locker = store.lockers[lockerId]
    if (!locker || locker.status !== "available") return { error: "Locker not found or not available" }
 
    store.lockers[lockerId] = { ...locker, status: "occupied", bookingId }
    store.bookings[bookingId] = { ...booking, status: "locker_assigned" }
 
    await addAuditLog(s.id, s.name, "Locker Assigned",
      `Locker ${locker.label} assigned to booking ${bookingId}`)
 
    return { locker: { ...locker, status: "occupied", bookingId } }
  }
 
  // ── markBookingReady (pharmacy staff) ─────────────────────────────────────
  async function markBookingReady(bookingId: string) {
    const s = getSession()
    if (!s || s.role !== "pharmacy_staff") return { error: "Unauthorized" }
 
    const booking = store.bookings[bookingId]
    if (!booking) return { error: "Booking not found" }
 
    store.bookings[bookingId] = { ...booking, status: "ready" }
 
    const rx = store.prescriptions[booking.prescriptionId]
    if (rx) store.prescriptions[rx.id] = { ...rx, status: "ready" }
 
    const token = `QR-${store.newId()}`
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const qrId = store.newId()
    const qr: QRCode = { id: qrId, bookingId, token, expiresAt, used: false }
    store.qrCodes[qrId] = qr
 
    if (rx) {
      await sendEmail({
        to: booking.patientEmail,
        subject: "Your Prescription is Ready for Pickup",
        html: `QR: ${token}`,
      })
    }
 
    await addAuditLog(s.id, s.name, "Booking Ready",
      `Booking ${bookingId} marked as ready. QR code generated.`)
 
    return { qr }
  }
 
  // ── scanQRCode (patient) ──────────────────────────────────────────────────
  async function scanQRCode(token: string) {
    const s = getSession()
    if (!s || s.role !== "patient") return { error: "Unauthorized" }
 
    const qr = Object.values(store.qrCodes).find(q => q.token === token)
    if (!qr) return { error: "Invalid QR code" }
    if (qr.used) return { error: "This QR code has already been used" }
    if (new Date(qr.expiresAt) < new Date()) {
      return { error: "QR code has expired. A rebooking email has been sent." }
    }
 
    store.qrCodes[qr.id] = { ...qr, used: true }
 
    const booking = store.bookings[qr.bookingId]
    if (!booking) return { error: "Booking not found" }
 
    const locker = Object.values(store.lockers).find(l => l.bookingId === booking.id)
    if (locker) {
      store.lockers[locker.id] = { ...locker, status: "unlocked" }
      await addAuditLog(s.id, s.name, "Locker Accessed",
        `Locker ${locker.label} unlocked for booking ${booking.id}`)
    }
 
    return { success: true, lockerLabel: locker?.label ?? "Unknown" }
  }
 
  // ── closeLocker (patient) ─────────────────────────────────────────────────
  async function closeLocker(bookingId: string) {
    const s = getSession()
    if (!s || s.role !== "patient") return { error: "Unauthorized" }
 
    const booking = store.bookings[bookingId]
    if (!booking) return { error: "Booking not found" }
 
    store.bookings[bookingId] = { ...booking, status: "collected" }
 
    const rx = store.prescriptions[booking.prescriptionId]
    if (rx) store.prescriptions[rx.id] = { ...rx, status: "collected" }
 
    const locker = Object.values(store.lockers).find(l => l.bookingId === bookingId)
    if (locker) {
      store.lockers[locker.id] = { ...locker, status: "available", bookingId: undefined }
      await addAuditLog(s.id, s.name, "Locker Closed",
        `Locker ${locker.label} released after collection for booking ${bookingId}`)
    }
 
    return { success: true }
  }
 
  // ── requestPrescriptionRefill (patient) ───────────────────────────────────
  async function requestPrescriptionRefill(prescriptionId: string, reason: string) {
    const s = getSession()
    if (!s || s.role !== "patient") return { error: "Unauthorized" }
 
    const rx = store.prescriptions[prescriptionId]
    if (!rx) return { error: "Prescription not found" }
    if (rx.patientId !== s.id) return { error: "Unauthorized" }
 
    const alreadyPending = Object.values(store.refillRequests).some(
      r => r.prescriptionId === prescriptionId && r.patientId === s.id && r.status === "pending"
    )
    if (alreadyPending) return { error: "A refill request is already pending for this prescription" }
 
    const id = store.newId()
    const request: RefillRequest = {
      id, prescriptionId, patientId: s.id, patientName: rx.patientName,
      patientEmail: s.email, doctorId: rx.doctorId,
      medications: rx.medications, reason, status: "pending",
      createdAt: new Date().toISOString(),
    }
    store.refillRequests[id] = request
 
    await addAuditLog(s.id, s.name, "Refill Requested",
      `Refill request ${id} for ${rx.medications.map(m => m.name).join(", ")}`)
 
    return { request }
  }
 
  // ── approveRefillRequest (doctor) ─────────────────────────────────────────
  async function approveRefillRequest(doctorId: string, doctorName: string, requestId: string) {
    if (!doctorId || !doctorName) return { error: "Missing doctor details" }
 
    const request = store.refillRequests[requestId]
    if (!request) return { error: "Refill request not found" }
    if (request.doctorId !== doctorId) return { error: "Unauthorized" }
 
    const id = store.newId()
    const rx: Prescription = {
      id, doctorId, patientId: request.patientId, patientName: request.patientName,
      medications: request.medications,
      notes: `Refill of previous prescription. Reason: ${request.reason}`,
      riskAssessment: null, status: "confirmed", createdAt: new Date().toISOString(),
    }
    store.prescriptions[id] = rx
    store.refillRequests[requestId] = { ...request, status: "approved" }
 
    await sendEmail({
      to: request.patientEmail,
      subject: "Your Prescription Refill Has Been Approved",
      html: "approved",
    })
 
    await addAuditLog(doctorId, doctorName, "Refill Approved",
      `Approved refill request ${requestId} for ${request.patientName}`)
 
    return { prescriptionId: id }
  }
 
  // ── rejectRefillRequest (doctor) ──────────────────────────────────────────
  async function rejectRefillRequest(
    doctorId: string, doctorName: string, requestId: string, rejectionReason: string
  ) {
    if (!doctorId || !doctorName) return { error: "Missing doctor details" }
 
    const request = store.refillRequests[requestId]
    if (!request) return { error: "Refill request not found" }
    if (request.doctorId !== doctorId) return { error: "Unauthorized" }
 
    store.refillRequests[requestId] = { ...request, status: "rejected" }
 
    await sendEmail({
      to: request.patientEmail,
      subject: "Your Prescription Refill Request Was Declined",
      html: "rejected",
    })
 
    await addAuditLog(doctorId, doctorName, "Refill Rejected",
      `Rejected refill request ${requestId} for ${request.patientName}`)
 
    return { success: true }
  }
 
  return {
    submitPrescription, submitBooking, assignLockerToBooking,
    markBookingReady, scanQRCode, closeLocker,
    requestPrescriptionRefill, approveRefillRequest, rejectRefillRequest,
  }
}
 
// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────
 
const sampleMeds: PrescribedMedication[] = [
  { medId: "med-001", name: "Ibuprofen", dosage: "400mg", frequency: "3x daily",
    duration: "7 days", quantity: 21, instructions: "Take with food" },
]
 
const safeRisk: RiskAssessmentResult = { status: "safe", issues: [] }
 
const reviewRisk: RiskAssessmentResult = {
  status: "review",
  issues: [{ code: "DRUG_INTERACTION", severity: "medium",
    message: "Ibuprofen may interact with Warfarin.", medicationName: "Ibuprofen" }],
}
 
// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────
 
describe("submitPrescription", () => {
  let store: ReturnType<typeof createStore>
  let doctorActions: ReturnType<typeof buildActions>
 
  beforeEach(() => {
    store = createStore()
    doctorActions = buildActions(store, store.users["doc-1"])
  })
 
  describe("TC-P1: happy path", () => {
    it("creates a prescription with status 'confirmed'", async () => {
      const result = await doctorActions.submitPrescription(
        "doc-1", "Dr. Sarah Wilson", "pat-1", sampleMeds, "Take with food", safeRisk
      )
      expect(result.error).toBeUndefined()
      expect(result.prescriptionId).toBeDefined()
      const rx = store.prescriptions[result.prescriptionId!]
      expect(rx.status).toBe("confirmed")
      expect(rx.patientName).toBe("Emily Thompson")
    })
 
    it("stores all medication details correctly", async () => {
      const result = await doctorActions.submitPrescription(
        "doc-1", "Dr. Sarah Wilson", "pat-1", sampleMeds, "notes", safeRisk
      )
      const rx = store.prescriptions[result.prescriptionId!]
      expect(rx.medications).toHaveLength(1)
      expect(rx.medications[0].name).toBe("Ibuprofen")
      expect(rx.medications[0].dosage).toBe("400mg")
    })
 
    it("stores the risk assessment on the prescription", async () => {
      const result = await doctorActions.submitPrescription(
        "doc-1", "Dr. Sarah Wilson", "pat-1", sampleMeds, "notes", reviewRisk
      )
      const rx = store.prescriptions[result.prescriptionId!]
      expect(rx.riskAssessment?.status).toBe("review")
    })
 
    it("stores null risk assessment when not provided", async () => {
      const result = await doctorActions.submitPrescription(
        "doc-1", "Dr. Sarah Wilson", "pat-1", sampleMeds, "notes", null
      )
      expect(store.prescriptions[result.prescriptionId!].riskAssessment).toBeNull()
    })
  })
 
  describe("TC-P2: audit logging", () => {
    it("writes a Prescription Confirmed audit log", async () => {
      await doctorActions.submitPrescription(
        "doc-1", "Dr. Sarah Wilson", "pat-1", sampleMeds, "notes", safeRisk
      )
      const log = store.auditLogs.find(l => l.action === "Prescription Confirmed")
      expect(log).toBeDefined()
      expect(log?.details).toContain("Ibuprofen")
    })
 
    it("writes a Risk Assessment audit log when risk assessment is provided", async () => {
      await doctorActions.submitPrescription(
        "doc-1", "Dr. Sarah Wilson", "pat-1", sampleMeds, "notes", reviewRisk
      )
      const riskLog = store.auditLogs.find(l => l.action === "Risk Assessment")
      expect(riskLog).toBeDefined()
      expect(riskLog?.details).toContain("review")
    })
 
    it("does not write a Risk Assessment log when risk is null", async () => {
      await doctorActions.submitPrescription(
        "doc-1", "Dr. Sarah Wilson", "pat-1", sampleMeds, "notes", null
      )
      const riskLog = store.auditLogs.find(l => l.action === "Risk Assessment")
      expect(riskLog).toBeUndefined()
    })
  })
 
  describe("TC-P3: validation errors", () => {
    it("returns error when doctorId is empty", async () => {
      const result = await doctorActions.submitPrescription(
        "", "Dr. Sarah Wilson", "pat-1", sampleMeds, "notes", null
      )
      expect(result.error).toBe("Missing doctor details")
    })
 
    it("returns error when doctorName is empty", async () => {
      const result = await doctorActions.submitPrescription(
        "doc-1", "", "pat-1", sampleMeds, "notes", null
      )
      expect(result.error).toBe("Missing doctor details")
    })
 
    it("returns error when patient does not exist", async () => {
      const result = await doctorActions.submitPrescription(
        "doc-1", "Dr. Sarah Wilson", "nonexistent-patient", sampleMeds, "notes", null
      )
      expect(result.error).toBe("Patient not found")
    })
 
    it("does not create a prescription when validation fails", async () => {
      await doctorActions.submitPrescription("", "", "pat-1", sampleMeds, "notes", null)
      expect(Object.keys(store.prescriptions)).toHaveLength(0)
    })
  })
})
 
// ─────────────────────────────────────────────────────────────────────────────
describe("submitBooking (clinic staff)", () => {
  let store: ReturnType<typeof createStore>
  let rxId: string
 
  beforeEach(async () => {
    store = createStore()
    const doctorActions = buildActions(store, store.users["doc-1"])
    const r = await doctorActions.submitPrescription(
      "doc-1", "Dr. Sarah Wilson", "pat-1", sampleMeds, "notes", safeRisk
    )
    rxId = r.prescriptionId!
  })
 
  describe("TC-B1: successful booking", () => {
    it("creates a booking and returns a bookingId", async () => {
      const actions = buildActions(store, store.users["clinic-1"])
      const result = await actions.submitBooking(rxId, "patient@demo.com", "09:00 - 10:00", "Central Pharmacy")
      expect(result.error).toBeUndefined()
      expect(result.bookingId).toBeDefined()
    })
 
    it("sets booking status to 'pending'", async () => {
      const actions = buildActions(store, store.users["clinic-1"])
      const result = await actions.submitBooking(rxId, "patient@demo.com", "09:00 - 10:00", "Central Pharmacy")
      expect(store.bookings[result.bookingId!].status).toBe("pending")
    })
 
    it("updates prescription status to 'booked'", async () => {
      const actions = buildActions(store, store.users["clinic-1"])
      await actions.submitBooking(rxId, "patient@demo.com", "09:00 - 10:00", "Central Pharmacy")
      expect(store.prescriptions[rxId].status).toBe("booked")
    })
 
    it("stores pharmacy name and pickup time correctly", async () => {
      const actions = buildActions(store, store.users["clinic-1"])
      const result = await actions.submitBooking(rxId, "patient@demo.com", "14:00 - 15:00", "West Wing Pharmacy")
      const booking = store.bookings[result.bookingId!]
      expect(booking.pharmacyName).toBe("West Wing Pharmacy")
      expect(booking.pickupTime).toBe("14:00 - 15:00")
    })
 
    it("writes a Booking Created audit log", async () => {
      const actions = buildActions(store, store.users["clinic-1"])
      await actions.submitBooking(rxId, "patient@demo.com", "09:00 - 10:00", "Central Pharmacy")
      expect(store.auditLogs.find(l => l.action === "Booking Created")).toBeDefined()
    })
  })
 
  describe("TC-B2: access control", () => {
    it("rejects doctor trying to create a booking", async () => {
      const actions = buildActions(store, store.users["doc-1"])
      const result = await actions.submitBooking(rxId, "patient@demo.com", "09:00 - 10:00", "Pharmacy")
      expect(result.error).toBe("Unauthorized")
    })
 
    it("rejects patient trying to create a booking", async () => {
      const actions = buildActions(store, store.users["pat-1"])
      const result = await actions.submitBooking(rxId, "patient@demo.com", "09:00 - 10:00", "Pharmacy")
      expect(result.error).toBe("Unauthorized")
    })
 
    it("rejects unauthenticated call", async () => {
      const actions = buildActions(store, null)
      const result = await actions.submitBooking(rxId, "patient@demo.com", "09:00 - 10:00", "Pharmacy")
      expect(result.error).toBe("Unauthorized")
    })
  })
 
  describe("TC-B3: not found", () => {
    it("returns error for non-existent prescription", async () => {
      const actions = buildActions(store, store.users["clinic-1"])
      const result = await actions.submitBooking("bad-id", "patient@demo.com", "09:00", "Pharmacy")
      expect(result.error).toBe("Prescription not found")
    })
  })
})
 
// ─────────────────────────────────────────────────────────────────────────────
describe("assignLockerToBooking (pharmacy staff)", () => {
  let store: ReturnType<typeof createStore>
  let bookingId: string
 
  beforeEach(async () => {
    store = createStore()
    const doctorActions = buildActions(store, store.users["doc-1"])
    const rx = await doctorActions.submitPrescription("doc-1", "Dr. Sarah Wilson", "pat-1", sampleMeds, "", safeRisk)
    const clinicActions = buildActions(store, store.users["clinic-1"])
    const booking = await clinicActions.submitBooking(rx.prescriptionId!, "patient@demo.com", "09:00", "Pharmacy")
    bookingId = booking.bookingId!
  })
 
  describe("TC-L1: successful locker assignment", () => {
    it("assigns an available locker to a booking", async () => {
      const actions = buildActions(store, store.users["pharm-1"])
      const result = await actions.assignLockerToBooking(bookingId, "locker-A")
      expect(result.error).toBeUndefined()
      expect(result.locker?.label).toBe("A1")
    })
 
    it("sets locker status to 'occupied'", async () => {
      const actions = buildActions(store, store.users["pharm-1"])
      await actions.assignLockerToBooking(bookingId, "locker-A")
      expect(store.lockers["locker-A"].status).toBe("occupied")
    })
 
    it("updates booking status to 'locker_assigned'", async () => {
      const actions = buildActions(store, store.users["pharm-1"])
      await actions.assignLockerToBooking(bookingId, "locker-A")
      expect(store.bookings[bookingId].status).toBe("locker_assigned")
    })
 
    it("writes a Locker Assigned audit log", async () => {
      const actions = buildActions(store, store.users["pharm-1"])
      await actions.assignLockerToBooking(bookingId, "locker-A")
      expect(store.auditLogs.find(l => l.action === "Locker Assigned")).toBeDefined()
    })
  })
 
  describe("TC-L2: unavailable locker", () => {
    it("rejects an already occupied locker", async () => {
      const actions = buildActions(store, store.users["pharm-1"])
      const result = await actions.assignLockerToBooking(bookingId, "locker-B")
      expect(result.error).toBe("Locker not found or not available")
    })
 
    it("rejects a non-existent locker id", async () => {
      const actions = buildActions(store, store.users["pharm-1"])
      const result = await actions.assignLockerToBooking(bookingId, "locker-ZZZZ")
      expect(result.error).toBe("Locker not found or not available")
    })
  })
 
  describe("TC-L3: access control", () => {
    it("rejects clinic staff trying to assign locker", async () => {
      const actions = buildActions(store, store.users["clinic-1"])
      const result = await actions.assignLockerToBooking(bookingId, "locker-A")
      expect(result.error).toBe("Unauthorized")
    })
  })
})
 
// ─────────────────────────────────────────────────────────────────────────────
describe("markBookingReady + scanQRCode + closeLocker (full pickup flow)", () => {
  let store: ReturnType<typeof createStore>
  let bookingId: string
  let prescriptionId: string
 
  beforeEach(async () => {
    store = createStore()
    const rx = await buildActions(store, store.users["doc-1"])
      .submitPrescription("doc-1", "Dr. Sarah Wilson", "pat-1", sampleMeds, "", safeRisk)
    prescriptionId = rx.prescriptionId!
 
    const booking = await buildActions(store, store.users["clinic-1"])
      .submitBooking(prescriptionId, "patient@demo.com", "09:00", "Central Pharmacy")
    bookingId = booking.bookingId!
 
    await buildActions(store, store.users["pharm-1"])
      .assignLockerToBooking(bookingId, "locker-A")
  })
 
  describe("TC-R1: markBookingReady", () => {
    it("sets booking status to 'ready'", async () => {
      await buildActions(store, store.users["pharm-1"]).markBookingReady(bookingId)
      expect(store.bookings[bookingId].status).toBe("ready")
    })
 
    it("sets prescription status to 'ready'", async () => {
      await buildActions(store, store.users["pharm-1"]).markBookingReady(bookingId)
      expect(store.prescriptions[prescriptionId].status).toBe("ready")
    })
 
    it("generates a QR code", async () => {
      const result = await buildActions(store, store.users["pharm-1"]).markBookingReady(bookingId)
      expect(result.qr?.token).toBeDefined()
      expect(result.qr?.used).toBe(false)
    })
 
    it("sends a pickup ready email to patient", async () => {
      await buildActions(store, store.users["pharm-1"]).markBookingReady(bookingId)
      const email = store.emailsSent.find(e => e.subject.includes("Ready for Pickup"))
      expect(email?.to).toBe("patient@demo.com")
    })
 
    it("rejects non-pharmacy staff", async () => {
      const result = await buildActions(store, store.users["clinic-1"]).markBookingReady(bookingId)
      expect(result.error).toBe("Unauthorized")
    })
  })
 
  describe("TC-Q1: scanQRCode", () => {
    let qrToken: string
 
    beforeEach(async () => {
      const result = await buildActions(store, store.users["pharm-1"]).markBookingReady(bookingId)
      qrToken = result.qr!.token
    })
 
    it("successfully scans a valid QR and unlocks the locker", async () => {
      const result = await buildActions(store, store.users["pat-1"]).scanQRCode(qrToken)
      expect(result.error).toBeUndefined()
      expect((result as any).success).toBe(true)
      expect((result as any).lockerLabel).toBe("A1")
    })
 
    it("sets locker status to 'unlocked' after scan", async () => {
      await buildActions(store, store.users["pat-1"]).scanQRCode(qrToken)
      expect(store.lockers["locker-A"].status).toBe("unlocked")
    })
 
    it("marks QR as used after scan", async () => {
      await buildActions(store, store.users["pat-1"]).scanQRCode(qrToken)
      const qr = Object.values(store.qrCodes).find(q => q.token === qrToken)
      expect(qr?.used).toBe(true)
    })
 
    it("rejects an already used QR token", async () => {
      await buildActions(store, store.users["pat-1"]).scanQRCode(qrToken)
      const result = await buildActions(store, store.users["pat-1"]).scanQRCode(qrToken)
      expect(result.error).toBe("This QR code has already been used")
    })
 
    it("rejects an invalid QR token", async () => {
      const result = await buildActions(store, store.users["pat-1"]).scanQRCode("FAKE-TOKEN")
      expect(result.error).toBe("Invalid QR code")
    })
 
    it("rejects an expired QR token", async () => {
      const qr = Object.values(store.qrCodes).find(q => q.token === qrToken)!
      store.qrCodes[qr.id] = { ...qr, expiresAt: new Date(Date.now() - 1000).toISOString() }
      const result = await buildActions(store, store.users["pat-1"]).scanQRCode(qrToken)
      expect(result.error).toContain("expired")
    })
 
    it("rejects non-patient role scanning QR", async () => {
      const result = await buildActions(store, store.users["pharm-1"]).scanQRCode(qrToken)
      expect(result.error).toBe("Unauthorized")
    })
 
    it("writes a Locker Accessed audit log on success", async () => {
      await buildActions(store, store.users["pat-1"]).scanQRCode(qrToken)
      expect(store.auditLogs.find(l => l.action === "Locker Accessed")).toBeDefined()
    })
  })
 
  describe("TC-C1: closeLocker (collection)", () => {
    let qrToken: string
 
    beforeEach(async () => {
      const result = await buildActions(store, store.users["pharm-1"]).markBookingReady(bookingId)
      qrToken = result.qr!.token
      await buildActions(store, store.users["pat-1"]).scanQRCode(qrToken)
    })
 
    it("sets booking status to 'collected'", async () => {
      await buildActions(store, store.users["pat-1"]).closeLocker(bookingId)
      expect(store.bookings[bookingId].status).toBe("collected")
    })
 
    it("sets prescription status to 'collected'", async () => {
      await buildActions(store, store.users["pat-1"]).closeLocker(bookingId)
      expect(store.prescriptions[prescriptionId].status).toBe("collected")
    })
 
    it("releases locker back to 'available'", async () => {
      await buildActions(store, store.users["pat-1"]).closeLocker(bookingId)
      expect(store.lockers["locker-A"].status).toBe("available")
    })
 
    it("rejects non-patient trying to close locker", async () => {
      const result = await buildActions(store, store.users["pharm-1"]).closeLocker(bookingId)
      expect(result.error).toBe("Unauthorized")
    })
  })
})
 
// ─────────────────────────────────────────────────────────────────────────────
describe("requestPrescriptionRefill + approveRefillRequest + rejectRefillRequest", () => {
  let store: ReturnType<typeof createStore>
  let prescriptionId: string
 
  beforeEach(async () => {
    store = createStore()
    const rx = await buildActions(store, store.users["doc-1"])
      .submitPrescription("doc-1", "Dr. Sarah Wilson", "pat-1", sampleMeds, "", safeRisk)
    prescriptionId = rx.prescriptionId!
  })
 
  describe("TC-RF1: requestPrescriptionRefill", () => {
    it("creates a pending refill request", async () => {
      const result = await buildActions(store, store.users["pat-1"])
        .requestPrescriptionRefill(prescriptionId, "Running low")
      expect(result.error).toBeUndefined()
      expect(result.request?.status).toBe("pending")
      expect(result.request?.reason).toBe("Running low")
    })
 
    it("stores the correct doctorId and medications on the request", async () => {
      const result = await buildActions(store, store.users["pat-1"])
        .requestPrescriptionRefill(prescriptionId, "Running low")
      expect(result.request?.doctorId).toBe("doc-1")
      expect(result.request?.medications[0].name).toBe("Ibuprofen")
    })
 
    it("rejects a duplicate pending refill request", async () => {
      await buildActions(store, store.users["pat-1"])
        .requestPrescriptionRefill(prescriptionId, "First request")
      const second = await buildActions(store, store.users["pat-1"])
        .requestPrescriptionRefill(prescriptionId, "Second request")
      expect(second.error).toBe("A refill request is already pending for this prescription")
    })
 
    it("rejects non-patient role", async () => {
      const result = await buildActions(store, store.users["doc-1"])
        .requestPrescriptionRefill(prescriptionId, "reason")
      expect(result.error).toBe("Unauthorized")
    })
 
    it("rejects refill for another patient's prescription", async () => {
      store.users["pat-2"] = { id: "pat-2", name: "Other Patient", email: "other@demo.com", role: "patient" }
      const result = await buildActions(store, store.users["pat-2"])
        .requestPrescriptionRefill(prescriptionId, "reason")
      expect(result.error).toBe("Unauthorized")
    })
 
    it("rejects refill for non-existent prescription", async () => {
      const result = await buildActions(store, store.users["pat-1"])
        .requestPrescriptionRefill("bad-rx-id", "reason")
      expect(result.error).toBe("Prescription not found")
    })
 
    it("writes a Refill Requested audit log", async () => {
      await buildActions(store, store.users["pat-1"])
        .requestPrescriptionRefill(prescriptionId, "Running low")
      expect(store.auditLogs.find(l => l.action === "Refill Requested")).toBeDefined()
    })
  })
 
  describe("TC-RF2: approveRefillRequest", () => {
    let requestId: string
 
    beforeEach(async () => {
      const r = await buildActions(store, store.users["pat-1"])
        .requestPrescriptionRefill(prescriptionId, "Running low")
      requestId = r.request!.id
    })
 
    it("creates a new confirmed prescription", async () => {
      const result = await buildActions(store, store.users["doc-1"])
        .approveRefillRequest("doc-1", "Dr. Sarah Wilson", requestId)
      expect(result.error).toBeUndefined()
      expect(result.prescriptionId).toBeDefined()
      expect(store.prescriptions[result.prescriptionId!].status).toBe("confirmed")
    })
 
    it("marks refill request as approved", async () => {
      await buildActions(store, store.users["doc-1"])
        .approveRefillRequest("doc-1", "Dr. Sarah Wilson", requestId)
      expect(store.refillRequests[requestId].status).toBe("approved")
    })
 
    it("sends approval email to patient", async () => {
      await buildActions(store, store.users["doc-1"])
        .approveRefillRequest("doc-1", "Dr. Sarah Wilson", requestId)
      const email = store.emailsSent.find(e => e.subject.includes("Approved"))
      expect(email?.to).toBe("patient@demo.com")
    })
 
    it("rejects approval from a different doctor", async () => {
      store.users["doc-2"] = { id: "doc-2", name: "Dr. Other", email: "other@doc.com", role: "doctor" }
      const result = await buildActions(store, store.users["doc-2"])
        .approveRefillRequest("doc-2", "Dr. Other", requestId)
      expect(result.error).toBe("Unauthorized")
    })
 
    it("returns error for non-existent request", async () => {
      const result = await buildActions(store, store.users["doc-1"])
        .approveRefillRequest("doc-1", "Dr. Sarah Wilson", "bad-request-id")
      expect(result.error).toBe("Refill request not found")
    })
  })
 
  describe("TC-RF3: rejectRefillRequest", () => {
    let requestId: string
 
    beforeEach(async () => {
      const r = await buildActions(store, store.users["pat-1"])
        .requestPrescriptionRefill(prescriptionId, "Running low")
      requestId = r.request!.id
    })
 
    it("marks refill request as rejected", async () => {
      await buildActions(store, store.users["doc-1"])
        .rejectRefillRequest("doc-1", "Dr. Sarah Wilson", requestId, "Not appropriate")
      expect(store.refillRequests[requestId].status).toBe("rejected")
    })
 
    it("sends rejection email to patient", async () => {
      await buildActions(store, store.users["doc-1"])
        .rejectRefillRequest("doc-1", "Dr. Sarah Wilson", requestId, "Not appropriate")
      const email = store.emailsSent.find(e => e.subject.includes("Declined"))
      expect(email?.to).toBe("patient@demo.com")
    })
 
    it("does not create a new prescription on rejection", async () => {
      const before = Object.keys(store.prescriptions).length
      await buildActions(store, store.users["doc-1"])
        .rejectRefillRequest("doc-1", "Dr. Sarah Wilson", requestId, "Not appropriate")
      expect(Object.keys(store.prescriptions).length).toBe(before)
    })
 
    it("rejects rejection from a different doctor", async () => {
      store.users["doc-2"] = { id: "doc-2", name: "Dr. Other", email: "other@doc.com", role: "doctor" }
      const result = await buildActions(store, store.users["doc-2"])
        .rejectRefillRequest("doc-2", "Dr. Other", requestId, "reason")
      expect(result.error).toBe("Unauthorized")
    })
  })
})