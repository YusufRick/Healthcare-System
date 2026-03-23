"use server"

import { randomUUID } from "crypto"
import { db } from "../src/config/firebase"
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore"
import { getSession } from "./auth"
import {
  sendEmail,
  generatePickupReadyEmail,
  generateExpiredEmail as generateExpiredEmailTemplate,
  generateRefillApprovedEmail as generateRefillApprovedEmailTemplate,
  generateRefillRejectedEmail as generateRefillRejectedEmailTemplate,
  generateBookingConfirmationEmail,
} from "@/src/services/emailService"
import { runRiskAssessment as runStructuredRiskAssessment } from "./validation"
import type {
  AuditLog,
  Booking,
  EmailLog,
  Locker,
  PrescribedMedication,
  Prescription,
  QRCode,
  RefillRequest,
  RiskAssessmentResult,
  User,
} from "./types"

type SessionUser = {
  id: string
  name: string
  email: string
  role: "doctor" | "clinic_staff" | "pharmacy_staff" | "patient"
}

function toSessionUser(session: unknown): SessionUser | null {
  if (!session || typeof session !== "object") return null
  const s = session as Record<string, unknown>

  if (
    typeof s.id !== "string" ||
    typeof s.name !== "string" ||
    typeof s.role !== "string"
  ) {
    return null
  }

  return {
    id: s.id,
    name: s.name,
    email: typeof s.email === "string" ? s.email : "",
    role: s.role as SessionUser["role"],
  }
}

function mapDoc<T>(snap: { id: string; data: () => unknown }): T {
  return {
    id: snap.id,
    ...(snap.data() as object),
  } as T
}

async function addAuditLog(
  userId: string,
  userName: string,
  action: string,
  details: string
) {
  await addDoc(collection(db, "auditLogs"), {
    userId,
    userName,
    action,
    details,
    timestamp: new Date().toISOString(),
  })
}

async function addEmailLog(to: string, subject: string, body: string) {
  await addDoc(collection(db, "emailLogs"), {
    to,
    subject,
    body,
    sentAt: new Date().toISOString(),
  })
}

async function getUserById(id: string): Promise<User | null> {
  const ref = doc(db, "users", id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return mapDoc<User>(snap)
}

async function getPrescriptionById(id: string): Promise<Prescription | null> {
  const ref = doc(db, "prescriptions", id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return mapDoc<Prescription>(snap)
}

async function getBookingById(id: string): Promise<Booking | null> {
  const ref = doc(db, "bookings", id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return mapDoc<Booking>(snap)
}

async function getBookingByPrescription(
  prescriptionId: string
): Promise<Booking | null> {
  const q = query(
    collection(db, "bookings"),
    where("prescriptionId", "==", prescriptionId)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return mapDoc<Booking>(snap.docs[0])
}

async function getLockerByBooking(bookingId: string): Promise<Locker | null> {
  const q = query(
    collection(db, "lockers"),
    where("bookingId", "==", bookingId)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return mapDoc<Locker>(snap.docs[0])
}

async function getQRByBooking(bookingId: string): Promise<QRCode | null> {
  const q = query(
    collection(db, "qrCodes"),
    where("bookingId", "==", bookingId)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return mapDoc<QRCode>(snap.docs[0])
}

async function getQRByToken(token: string): Promise<QRCode | null> {
  const q = query(collection(db, "qrCodes"), where("token", "==", token))
  const snap = await getDocs(q)
  if (snap.empty) return null
  return mapDoc<QRCode>(snap.docs[0])
}

async function updatePrescriptionStatus(
  prescriptionId: string,
  status: Prescription["status"]
) {
  await updateDoc(doc(db, "prescriptions", prescriptionId), { status })
}

async function updateBookingStatus(
  bookingId: string,
  status: Booking["status"]
) {
  await updateDoc(doc(db, "bookings", bookingId), { status })
}

async function markQRUsed(qrId: string) {
  await updateDoc(doc(db, "qrCodes", qrId), { used: true })
}

async function unlockLocker(lockerId: string) {
  await updateDoc(doc(db, "lockers", lockerId), {
    status: "unlocked",
  })
}

async function releaseLocker(lockerId: string) {
  await updateDoc(doc(db, "lockers", lockerId), {
    status: "available",
    bookingId: null,
  })
}

async function assignLocker(lockerId: string, bookingId: string): Promise<Locker | null> {
  const lockerRef = doc(db, "lockers", lockerId)
  const lockerSnap = await getDoc(lockerRef)

  if (!lockerSnap.exists()) return null

  const locker = mapDoc<Locker>(lockerSnap)
  if (locker.status !== "available") return null

  await updateDoc(lockerRef, {
    status: "occupied",
    bookingId,
  })

  const updatedSnap = await getDoc(lockerRef)
  if (!updatedSnap.exists()) return null

  return mapDoc<Locker>(updatedSnap)
}

async function createQRCodeRecord(
  bookingId: string,
  expiryMinutes: number
): Promise<{ id: string; token: string }> {
  const expires = new Date()
  expires.setMinutes(expires.getMinutes() + expiryMinutes)

  const token = randomUUID()

  const qrRef = await addDoc(collection(db, "qrCodes"), {
    bookingId,
    token,
    expiresAt: expires.toISOString(),
    used: false,
    createdAt: new Date().toISOString(),
  })

  return {
    id: qrRef.id,
    token,
  }
}

async function getRefillRequestById(id: string): Promise<RefillRequest | null> {
  const ref = doc(db, "refillRequests", id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return mapDoc<RefillRequest>(snap)
}

async function updateRefillRequestStatus(
  requestId: string,
  status: RefillRequest["status"],
  rejectionReason?: string
) {
  await updateDoc(doc(db, "refillRequests", requestId), {
    status,
    rejectionReason: rejectionReason ?? null,
    respondedAt: new Date().toISOString(),
  })
}

// --- Doctor Actions ---

export async function getPatientList() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "doctor") {
    return { error: "Unauthorized" }
  }

  const q = query(collection(db, "users"), where("role", "==", "patient"))
  const snapshot = await getDocs(q)

  const patients = snapshot.docs.map((d) => {
    const user = mapDoc<User>(d)
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      allergies: user.allergies ?? [],
    }
  })

  return { patients }
}

export async function runRiskAssessment(
  medications: string[],
  patientId: string
): Promise<{ assessment?: RiskAssessmentResult; error?: string }> {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "doctor") {
    return { error: "Unauthorized" }
  }

  const patient = await getUserById(patientId)
  if (!patient) return { error: "Patient not found" }

  const assessment = await runStructuredRiskAssessment({
    medications: medications.map((name) => ({ name, dosage: "" })),
    patientAllergies: patient.allergies || [],
  })

  return { assessment }
}

export async function submitPrescription(
  patientId: string,
  medications: PrescribedMedication[],
  notes: string,
  riskAssessment: RiskAssessmentResult | null
) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "doctor") {
    return { error: "Unauthorized" }
  }

  const patient = await getUserById(patientId)
  if (!patient) {
    return { error: "Patient not found" }
  }

  const prescriptionRef = await addDoc(collection(db, "prescriptions"), {
    doctorId: session.id,
    patientId,
    patientName: patient.name,
    medications,
    notes,
    riskAssessment,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  })

  const medSummary = medications.map((m) => `${m.name} ${m.dosage}`).join(", ")

  await addAuditLog(
    session.id,
    session.name,
    "Prescription Confirmed",
    `Prescription ${prescriptionRef.id} for ${patient.name}: ${medSummary}`
  )

  if (riskAssessment) {
    await addAuditLog(
      session.id,
      session.name,
      "Risk Assessment",
      `Risk: ${riskAssessment.status} for ${medSummary} - ${patient.name}`
    )
  }

  return {
    prescriptionId: prescriptionRef.id,
  }
}

export async function getDoctorPrescriptions() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "doctor") {
    return { error: "Unauthorized" }
  }

  const q = query(
    collection(db, "prescriptions"),
    where("doctorId", "==", session.id)
  )

  const snapshot = await getDocs(q)
  const prescriptions = snapshot.docs.map((d) => mapDoc<Prescription>(d))

  return { prescriptions }
}

export async function getDoctorRefillRequests() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "doctor") {
    return { error: "Unauthorized" }
  }

  const q = query(
    collection(db, "refillRequests"),
    where("doctorId", "==", session.id),
    where("status", "==", "pending")
  )

  const snap = await getDocs(q)
  const requests = snap.docs.map((d) => mapDoc<RefillRequest>(d))

  return { requests }
}

export async function approveRefillRequest(requestId: string) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "doctor") {
    return { error: "Unauthorized" }
  }

  const request = await getRefillRequestById(requestId)
  if (!request) return { error: "Refill request not found" }
  if (request.doctorId !== session.id) return { error: "Unauthorized" }

  const rxRef = await addDoc(collection(db, "prescriptions"), {
    doctorId: session.id,
    patientId: request.patientId,
    patientName: request.patientName,
    clinicId: "",
    medications: request.medications,
    notes: `Refill of previous prescription. Reason: ${request.reason}`,
    riskAssessment: null,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  })

  await updateRefillRequestStatus(requestId, "approved")

  const medSummary = request.medications.map((m) => m.name).join(", ")

  await addAuditLog(
    session.id,
    session.name,
    "Refill Approved",
    `Approved refill request ${requestId} for ${request.patientName}: ${medSummary}`
  )

  const emailBody = generateRefillApprovedEmailTemplate(
    request.patientName,
    medSummary
  )

  const emailResult = await sendEmail({
    to: request.patientEmail,
    subject: "Your Prescription Refill Has Been Approved",
    html: emailBody,
  })

  await addEmailLog(
    request.patientEmail,
    "Your Prescription Refill Has Been Approved",
    emailBody
  )

  if (!emailResult.success) {
    console.error("[Actions] Failed to send refill approved email:", emailResult.error)
  }

  return { prescriptionId: rxRef.id }
}

export async function rejectRefillRequest(
  requestId: string,
  rejectionReason: string
) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "doctor") {
    return { error: "Unauthorized" }
  }

  const request = await getRefillRequestById(requestId)
  if (!request) return { error: "Refill request not found" }
  if (request.doctorId !== session.id) return { error: "Unauthorized" }

  await updateRefillRequestStatus(requestId, "rejected", rejectionReason)

  const medSummary = request.medications.map((m) => m.name).join(", ")

  await addAuditLog(
    session.id,
    session.name,
    "Refill Rejected",
    `Rejected refill request ${requestId} for ${request.patientName}: ${medSummary}. Reason: ${rejectionReason}`
  )

  const emailBody = generateRefillRejectedEmailTemplate(
    request.patientName,
    medSummary,
    rejectionReason
  )

  const emailResult = await sendEmail({
    to: request.patientEmail,
    subject: "Your Prescription Refill Request Was Declined",
    html: emailBody,
  })

  await addEmailLog(
    request.patientEmail,
    "Your Prescription Refill Request Was Declined",
    emailBody
  )

  if (!emailResult.success) {
    console.error("[Actions] Failed to send refill rejected email:", emailResult.error)
  }

  return { success: true }
}

// --- Clinic Staff Actions ---

export async function getClinicPrescriptions() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "clinic_staff") {
    return { error: "Unauthorized" }
  }

  const q = query(
    collection(db, "prescriptions"),
    where("status", "==", "confirmed")
  )

  const snap = await getDocs(q)
  const prescriptions = snap.docs.map((d) => mapDoc<Prescription>(d))

  return { prescriptions }
}

export async function getClinicPrescriptionHistory() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "clinic_staff") {
    return { error: "Unauthorized" }
  }

  const snap = await getDocs(collection(db, "prescriptions"))
  const prescriptions = snap.docs.map((d) => mapDoc<Prescription>(d))

  const history = await Promise.all(
    prescriptions.map(async (rx) => {
      const booking = await getBookingByPrescription(rx.id)
      return { prescription: rx, booking }
    })
  )

  return { history }
}

export async function submitBooking(
  prescriptionId: string,
  patientEmail: string,
  pickupTime: string,
  pharmacyName: string
) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "clinic_staff") {
    return { error: "Unauthorized" }
  }

  const rx = await getPrescriptionById(prescriptionId)
  if (!rx) return { error: "Prescription not found" }

  const bookingRef = await addDoc(collection(db, "bookings"), {
    prescriptionId,
    patientEmail,
    pickupTime,
    pharmacyName,
    createdById: session.id,
    createdByRole: "clinic_staff",
    status: "pending",
    createdAt: new Date().toISOString(),
  })

  await updatePrescriptionStatus(prescriptionId, "booked")

  await addAuditLog(
    session.id,
    session.name,
    "Booking Created",
    `Booking ${bookingRef.id} for prescription ${prescriptionId} at ${pharmacyName}`
  )

  return {
    bookingId: bookingRef.id,
  }
}

// --- Pharmacy Staff Actions ---

export async function getPharmacyBookings() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "pharmacy_staff") {
    return { error: "Unauthorized" }
  }

  const q = query(
    collection(db, "prescriptions"),
    where("status", "==", "booked")
  )

  const bookedSnap = await getDocs(q)
  const prescriptions = bookedSnap.docs.map((d) => mapDoc<Prescription>(d))

  const items = await Promise.all(
    prescriptions.map(async (rx) => {
      const booking = await getBookingByPrescription(rx.id)
      const locker = booking ? await getLockerByBooking(booking.id) : null
      const qr = booking ? await getQRByBooking(booking.id) : null
      return { prescription: rx, booking, locker, qr }
    })
  )

  return { items }
}

export async function getAvailableLockerList() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "pharmacy_staff") {
    return { error: "Unauthorized" }
  }

  const q = query(
    collection(db, "lockers"),
    where("status", "==", "available")
  )

  const snap = await getDocs(q)
  const lockers = snap.docs.map((d) => mapDoc<Locker>(d))

  return { lockers }
}

export async function assignLockerToBooking(bookingId: string, lockerId: string) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "pharmacy_staff") {
    return { error: "Unauthorized" }
  }

  const booking = await getBookingById(bookingId)
  if (!booking) return { error: "Booking not found" }

  const locker = await assignLocker(lockerId, bookingId)
  if (!locker) return { error: "Locker not found or not available" }

  await updateBookingStatus(bookingId, "locker_assigned")

  await addAuditLog(
    session.id,
    session.name,
    "Locker Assigned",
    `Locker ${locker.label} assigned to booking ${bookingId}`
  )

  return { locker }
}

export async function markBookingReady(bookingId: string) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "pharmacy_staff") {
    return { error: "Unauthorized" }
  }

  const booking = await getBookingById(bookingId)
  if (!booking) return { error: "Booking not found" }

  await updateBookingStatus(bookingId, "ready")

  const rx = await getPrescriptionById(booking.prescriptionId)
  if (rx) {
    await updatePrescriptionStatus(rx.id, "ready")
  }

  const qr = await createQRCodeRecord(bookingId, 60)

  if (rx) {
    const emailBody = generatePickupReadyEmail(
      rx.patientName,
      rx.medications,
      booking.pickupTime,
      booking.pharmacyName,
      qr.token
    )

    const emailResult = await sendEmail({
      to: booking.patientEmail,
      subject: "Your Prescription is Ready for Pickup",
      html: emailBody,
    })

    await addEmailLog(
      booking.patientEmail,
      "Your Prescription is Ready for Pickup",
      emailBody
    )

    if (!emailResult.success) {
      console.error("[Actions] Failed to send pickup email:", emailResult.error)
    }
  }

  await addAuditLog(
    session.id,
    session.name,
    "Booking Ready",
    `Booking ${bookingId} marked as ready. QR code generated.`
  )

  return { qr }
}

export async function generateStaffQR(bookingId: string) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "pharmacy_staff") {
    return { error: "Unauthorized" }
  }

  const qr = await createQRCodeRecord(bookingId, 30)

  await addAuditLog(
    session.id,
    session.name,
    "Staff QR Generated",
    `Staff QR code for booking ${bookingId}`
  )

  return { qr }
}

// --- Patient Actions ---

export async function getPatientDashboard() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "patient") {
    return { error: "Unauthorized" }
  }

  const q = query(
    collection(db, "prescriptions"),
    where("patientId", "==", session.id)
  )

  const snap = await getDocs(q)
  const prescriptions = snap.docs.map((d) => mapDoc<Prescription>(d))

  const items = await Promise.all(
    prescriptions.map(async (rx) => {
      const booking = await getBookingByPrescription(rx.id)
      const qr = booking ? await getQRByBooking(booking.id) : null
      const locker = booking ? await getLockerByBooking(booking.id) : null
      return { prescription: rx, booking, qr, locker }
    })
  )

  return { items, patientName: session.name }
}

export async function scanQRCode(token: string) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "patient") {
    return { error: "Unauthorized" }
  }

  const qr = await getQRByToken(token)
  if (!qr) return { error: "Invalid QR code" }
  if (qr.used) return { error: "This QR code has already been used" }

  if (new Date(qr.expiresAt) < new Date()) {
    const booking = await getBookingById(qr.bookingId)

    if (booking) {
      await updateBookingStatus(booking.id, "expired")

      const rx = await getPrescriptionById(booking.prescriptionId)
      if (rx) {
        await updatePrescriptionStatus(rx.id, "expired")
      }

      const medNames = rx?.medications.map((m) => m.name).join(", ") || ""
      const emailBody = generateExpiredEmailTemplate(
        rx?.patientName || "Patient",
        medNames
      )

      await sendEmail({
        to: booking.patientEmail,
        subject: "QR Code Expired - Rebooking Required",
        html: emailBody,
      })

      await addEmailLog(
        booking.patientEmail,
        "QR Code Expired - Rebooking Required",
        emailBody
      )
    }

    return { error: "QR code has expired. A rebooking email has been sent." }
  }

  await markQRUsed(qr.id)

  const booking = await getBookingById(qr.bookingId)
  if (!booking) return { error: "Booking not found" }

  const locker = await getLockerByBooking(booking.id)
  if (locker) {
    await unlockLocker(locker.id)

    await addAuditLog(
      session.id,
      session.name,
      "Locker Accessed",
      `Locker ${locker.label} unlocked for booking ${booking.id}`
    )
  }

  return { success: true, lockerLabel: locker?.label || "Unknown" }
}

export async function closeLocker(bookingId: string) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "patient") {
    return { error: "Unauthorized" }
  }

  const booking = await getBookingById(bookingId)
  if (!booking) return { error: "Booking not found" }

  await updateBookingStatus(bookingId, "collected")

  const rx = await getPrescriptionById(booking.prescriptionId)
  if (rx) {
    await updatePrescriptionStatus(rx.id, "collected")
  }

  const locker = await getLockerByBooking(bookingId)
  if (locker) {
    await releaseLocker(locker.id)

    await addAuditLog(
      session.id,
      session.name,
      "Locker Closed",
      `Locker ${locker.label} released after collection for booking ${bookingId}`
    )
  }

  return { success: true }
}

// --- Audit & Email Logs ---

export async function fetchAuditLogs() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session) return { error: "Unauthorized" }

  const snap = await getDocs(collection(db, "auditLogs"))
  const logs = snap.docs.map((d) => mapDoc<AuditLog>(d))

  return { logs }
}

export async function fetchEmailLogs() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session) return { error: "Unauthorized" }

  const snap = await getDocs(collection(db, "emailLogs"))
  const logs = snap.docs.map((d) => mapDoc<EmailLog>(d))

  return { logs }
}

// --- Patient Refill Request Action ---

export async function requestPrescriptionRefill(
  prescriptionId: string,
  reason: string
) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "patient") {
    return { error: "Unauthorized" }
  }

  const prescription = await getPrescriptionById(prescriptionId)
  if (!prescription) return { error: "Prescription not found" }
  if (prescription.patientId !== session.id) return { error: "Unauthorized" }

  const q = query(
    collection(db, "refillRequests"),
    where("patientId", "==", session.id),
    where("prescriptionId", "==", prescriptionId),
    where("status", "==", "pending")
  )

  const existing = await getDocs(q)
  if (!existing.empty) {
    return { error: "A refill request is already pending for this prescription" }
  }

  const requestRef = await addDoc(collection(db, "refillRequests"), {
    prescriptionId,
    patientId: session.id,
    patientName: prescription.patientName,
    patientEmail: session.email,
    doctorId: prescription.doctorId,
    medications: prescription.medications,
    reason,
    status: "pending",
    createdAt: new Date().toISOString(),
  })

  const medSummary = prescription.medications.map((m) => m.name).join(", ")

  await addAuditLog(
    session.id,
    session.name,
    "Refill Requested",
    `Refill request ${requestRef.id} for ${medSummary}`
  )

  return {
    request: {
      id: requestRef.id,
      prescriptionId,
      patientId: session.id,
      patientName: prescription.patientName,
      patientEmail: session.email,
      doctorId: prescription.doctorId,
      medications: prescription.medications,
      reason,
      status: "pending",
      createdAt: new Date().toISOString(),
    },
  }
}

export async function getPatientRefillRequests() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "patient") {
    return { error: "Unauthorized" }
  }

  const q = query(
    collection(db, "refillRequests"),
    where("patientId", "==", session.id)
  )

  const snap = await getDocs(q)
  const requests = snap.docs.map((d) => mapDoc<RefillRequest>(d))

  return { requests }
}

export async function patientBookPrescription(
  prescriptionId: string,
  pickupTime: string,
  pharmacyName: string
) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "patient") {
    return { error: "Unauthorized" }
  }

  const rx = await getPrescriptionById(prescriptionId)
  if (!rx) return { error: "Prescription not found" }
  if (rx.patientId !== session.id) return { error: "Unauthorized" }
  if (rx.status !== "confirmed") {
    return { error: "Prescription is not available for booking" }
  }

  const bookingRef = await addDoc(collection(db, "bookings"), {
    prescriptionId,
    patientEmail: session.email,
    pickupTime,
    pharmacyName,
    createdById: session.id,
    createdByRole: "patient",
    status: "pending",
    createdAt: new Date().toISOString(),
  })

  await updatePrescriptionStatus(prescriptionId, "booked")

  const medSummary = rx.medications.map((m) => m.name).join(", ")

  await addAuditLog(
    session.id,
    session.name,
    "Patient Booking",
    `Booked prescription ${prescriptionId} for ${medSummary} at ${pharmacyName}`
  )

  const emailBody = generateBookingConfirmationEmail(
    session.name,
    medSummary,
    pickupTime,
    pharmacyName
  )

  const emailResult = await sendEmail({
    to: session.email,
    subject: "Prescription Pickup Booking Confirmed",
    html: emailBody,
  })

  await addEmailLog(
    session.email,
    "Prescription Pickup Booking Confirmed",
    emailBody
  )

  if (!emailResult.success) {
    console.error("[Actions] Failed to send booking confirmation email:", emailResult.error)
  }

  return {
    booking: {
      id: bookingRef.id,
      prescriptionId,
      patientEmail: session.email,
      pickupTime,
      pharmacyName,
      createdById: session.id,
      createdByRole: "patient",
      status: "pending",
      createdAt: new Date().toISOString(),
    },
  }
}