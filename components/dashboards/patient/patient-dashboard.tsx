"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { onAuthStateChanged } from "firebase/auth"
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  doc,
  updateDoc,
} from "firebase/firestore"
import { auth, db } from "@/src/config/firebase"
import {
  User,
  QrCode,
  Package,
  Clock,
  CheckCircle2,
  Lock,
  Unlock,
  XCircle,
  RefreshCw,
  Send,
  Loader2,
  CalendarClock,
  MapPin,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  Prescription,
  Booking,
  QRCode as QRCodeType,
  Locker,
  RefillRequest,
} from "@/lib/types"
import useSWR, { useSWRConfig } from "swr"

const PHARMACIES = [
  "Central Pharmacy - Main Building",
  "West Wing Pharmacy",
  "North Campus Pharmacy",
]

const TIME_SLOTS = [
  "09:00 - 10:00",
  "10:00 - 11:00",
  "11:00 - 12:00",
  "13:00 - 14:00",
  "14:00 - 15:00",
  "15:00 - 16:00",
  "16:00 - 17:00",
]

interface PatientItem {
  prescription: Prescription
  booking: Booking | null
  qr: QRCodeType | null
  locker: Locker | null
}

type PatientDashboardData = {
  items: PatientItem[]
  patientName: string
  patientEmail: string
}

function parseSlotStart(date: string, slot: string) {
  const [slotStart] = slot.split(" - ")
  return new Date(`${date}T${slotStart}:00`)
}

function parseSlotEnd(date: string, slot: string) {
  const [, slotEnd] = slot.split(" - ")
  return new Date(`${date}T${slotEnd}:00`)
}

function useCurrentPatient() {
  const [patientId, setPatientId] = useState<string | null>(null)
  const [patientName, setPatientName] = useState("")
  const [patientEmail, setPatientEmail] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setPatientId(null)
        setPatientName("")
        setPatientEmail("")
        setLoading(false)
        return
      }

      try {
        const userSnap = await getDoc(doc(db, "users", firebaseUser.uid))
        if (!userSnap.exists()) {
          setPatientId(null)
          setPatientName("")
          setPatientEmail("")
          setLoading(false)
          return
        }

        const user = userSnap.data() as {
          role?: string
          name?: string
          email?: string
        }

        if (user.role !== "patient") {
          setPatientId(null)
          setPatientName("")
          setPatientEmail("")
          setLoading(false)
          return
        }

        setPatientId(firebaseUser.uid)
        setPatientName(user.name || "")
        setPatientEmail(user.email || firebaseUser.email || "")
      } catch (error) {
        console.error("Failed to load patient session:", error)
        setPatientId(null)
        setPatientName("")
        setPatientEmail("")
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [])

  return { patientId, patientName, patientEmail, loading }
}

function usePatientData(
  patientId: string | null,
  patientName: string,
  patientEmail: string
) {
  return useSWR<PatientDashboardData>(
    patientId ? ["patient-dashboard", patientId] : null,
    async () => {
      const prescriptionQuery = query(
        collection(db, "prescriptions"),
        where("patientId", "==", patientId)
      )

      const prescriptionSnap = await getDocs(prescriptionQuery)

      const prescriptions = prescriptionSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Prescription, "id">),
      })) as Prescription[]

      const items = await Promise.all(
        prescriptions.map(async (prescription) => {
          const bookingQuery = query(
            collection(db, "bookings"),
            where("prescriptionId", "==", prescription.id)
          )
          const bookingSnap = await getDocs(bookingQuery)

          const allBookings = bookingSnap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<Booking, "id">),
          })) as Booking[]

          const sortedBookings = allBookings.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )

          const latestBooking = sortedBookings[0] ?? null

          const activeBooking =
            sortedBookings.find((b) =>
              ["pending", "locker_assigned", "ready"].includes(b.status)
            ) ?? null

          let qr: QRCodeType | null = null
          let locker: Locker | null = null

          if (activeBooking) {
            const qrQuery = query(
              collection(db, "qrCodes"),
              where("bookingId", "==", activeBooking.id)
            )
            const qrSnap = await getDocs(qrQuery)

            if (!qrSnap.empty) {
              qr = {
                id: qrSnap.docs[0].id,
                ...(qrSnap.docs[0].data() as Omit<QRCodeType, "id">),
              } as QRCodeType
            }

            const lockerQuery = query(
              collection(db, "lockers"),
              where("bookingId", "==", activeBooking.id)
            )
            const lockerSnap = await getDocs(lockerQuery)

            if (!lockerSnap.empty) {
              locker = {
                id: lockerSnap.docs[0].id,
                ...(lockerSnap.docs[0].data() as Omit<Locker, "id">),
              } as Locker
            }
          }

          return {
            prescription,
            booking: latestBooking,
            qr,
            locker,
          }
        })
      )

      return {
        items: items.sort(
          (a, b) =>
            new Date(b.prescription.createdAt).getTime() -
            new Date(a.prescription.createdAt).getTime()
        ),
        patientName,
        patientEmail,
      }
    }
  )
}

function useRefillRequests(patientId: string | null) {
  return useSWR<RefillRequest[]>(
    patientId ? ["patient-refill-requests", patientId] : null,
    async () => {
      const q = query(
        collection(db, "refillRequests"),
        where("patientId", "==", patientId)
      )
      const snap = await getDocs(q)

      return snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<RefillRequest, "id">),
      })) as RefillRequest[]
    }
  )
}

export function PatientDashboard() {
  const { mutate: globalMutate } = useSWRConfig()
  const { patientId, patientName, patientEmail, loading } = useCurrentPatient()
  const { data, mutate } = usePatientData(patientId, patientName, patientEmail)
  const { data: refillRequests = [], mutate: mutateRefills } = useRefillRequests(patientId)

  const items = data?.items || []

  const [scanToken, setScanToken] = useState("")
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{
    success?: boolean
    lockerLabel?: string
    bookingId?: string
    error?: string
  } | null>(null)

  const [showScanDialog, setShowScanDialog] = useState(false)
  const [showRefillDialog, setShowRefillDialog] = useState(false)
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null)
  const [refillReason, setRefillReason] = useState("")
  const [submittingRefill, setSubmittingRefill] = useState(false)

  const [showBookingDialog, setShowBookingDialog] = useState(false)
  const [bookingPrescription, setBookingPrescription] = useState<Prescription | null>(null)
  const [pickupDate, setPickupDate] = useState("")
  const [pickupTime, setPickupTime] = useState("")
  const [pharmacyName, setPharmacyName] = useState("")
  const [submittingBooking, setSubmittingBooking] = useState(false)

  const [showQrDialog, setShowQrDialog] = useState(false)
  const [selectedQrItem, setSelectedQrItem] = useState<PatientItem | null>(null)

  const todayString = useMemo(() => new Date().toISOString().split("T")[0], [])

  function openQrDialog(item: PatientItem) {
    setSelectedQrItem(item)
    setShowQrDialog(true)
  }

  async function handleScan() {
    if (!scanToken.trim()) {
      toast.error("Please enter a QR code token")
      return
    }

    if (!patientId) {
      toast.error("Not authenticated")
      return
    }

    setScanning(true)
    try {
      const qrQuery = query(
        collection(db, "qrCodes"),
        where("token", "==", scanToken.trim())
      )
      const qrSnap = await getDocs(qrQuery)

      if (qrSnap.empty) {
        setScanResult({ error: "Invalid QR code" })
        toast.error("Invalid QR code")
        return
      }

      const qrDoc = qrSnap.docs[0]
      const qr = {
        id: qrDoc.id,
        ...(qrDoc.data() as Omit<QRCodeType, "id">),
      } as QRCodeType

      if (qr.used) {
        setScanResult({ error: "This QR code has already been used" })
        toast.error("This QR code has already been used")
        return
      }

      if (new Date(qr.expiresAt) < new Date()) {
        const bookingRef = doc(db, "bookings", qr.bookingId)
        const bookingSnap = await getDoc(bookingRef)

        if (bookingSnap.exists()) {
          const booking = {
            id: bookingSnap.id,
            ...(bookingSnap.data() as Omit<Booking, "id">),
          } as Booking

          await updateDoc(bookingRef, { status: "expired" })

          if (booking.prescriptionId) {
            await updateDoc(doc(db, "prescriptions", booking.prescriptionId), {
              status: "confirmed",
            })
          }

          await addDoc(collection(db, "emailLogs"), {
            to: booking.patientEmail,
            bookingId: booking.id,
            prescriptionId: booking.prescriptionId,
            type: "expired",
            subject: "QR Code Expired - Rebooking Required",
            body: `Hello ${data?.patientName || "Patient"},

Your QR code for prescription pickup has expired.

Previous booking details:
- Pharmacy: ${booking.pharmacyName}
- Pickup time: ${booking.pickupTime}

Please book a new pickup slot from your patient dashboard to receive a new QR token.
`,
            status: "queued",
            deliveryMode: "prototype_firestore",
            createdAt: new Date().toISOString(),
            createdById: patientId,
            createdByRole: "patient",
          })
        }

        setScanResult({ error: "QR code has expired. Please rebook." })
        toast.error("QR code has expired. Please rebook.")
        mutate()
        globalMutate("email-logs")
        return
      }

      await updateDoc(doc(db, "qrCodes", qr.id), { used: true })

      const bookingSnap = await getDoc(doc(db, "bookings", qr.bookingId))
      if (!bookingSnap.exists()) {
        setScanResult({ error: "Booking not found" })
        toast.error("Booking not found")
        return
      }

      const booking = {
        id: bookingSnap.id,
        ...(bookingSnap.data() as Omit<Booking, "id">),
      } as Booking

      if (!["locker_assigned", "ready"].includes(booking.status)) {
        setScanResult({ error: "This booking is not ready for collection yet" })
        toast.error("This booking is not ready for collection yet")
        return
      }

      const lockerQuery = query(
        collection(db, "lockers"),
        where("bookingId", "==", booking.id)
      )
      const lockerSnap = await getDocs(lockerQuery)

      let lockerLabel = "Unknown"
      if (!lockerSnap.empty) {
        const lockerDoc = lockerSnap.docs[0]
        const locker = {
          id: lockerDoc.id,
          ...(lockerDoc.data() as Omit<Locker, "id">),
        } as Locker

        lockerLabel = locker.label

        await updateDoc(doc(db, "lockers", locker.id), {
          status: "unlocked",
        })

        await addDoc(collection(db, "auditLogs"), {
          userId: patientId,
          userName: data?.patientName || "Patient",
          action: "Locker Accessed",
          details: `Locker ${locker.label} unlocked for booking ${booking.id}`,
          timestamp: new Date().toISOString(),
        })
      }

      setScanResult({
        success: true,
        lockerLabel,
        bookingId: booking.id,
      })
      toast.success(`Locker ${lockerLabel} unlocked!`)
      mutate()
      globalMutate("audit-logs")
    } catch (error) {
      console.error("Scan failed:", error)
      toast.error("Failed to validate QR code")
    } finally {
      setScanning(false)
    }
  }

  async function handleCloseLocker(bookingId: string) {
    if (!patientId) {
      toast.error("Not authenticated")
      return
    }

    try {
      const bookingRef = doc(db, "bookings", bookingId)
      const bookingSnap = await getDoc(bookingRef)
      if (!bookingSnap.exists()) {
        toast.error("Booking not found")
        return
      }

      const booking = {
        id: bookingSnap.id,
        ...(bookingSnap.data() as Omit<Booking, "id">),
      } as Booking

      await updateDoc(bookingRef, {
        status: "collected",
      })

      if (booking.prescriptionId) {
        await updateDoc(doc(db, "prescriptions", booking.prescriptionId), {
          status: "collected",
        })
      }

      const lockerQuery = query(
        collection(db, "lockers"),
        where("bookingId", "==", bookingId)
      )
      const lockerSnap = await getDocs(lockerQuery)

      if (!lockerSnap.empty) {
        const lockerDoc = lockerSnap.docs[0]
        const locker = {
          id: lockerDoc.id,
          ...(lockerDoc.data() as Omit<Locker, "id">),
        } as Locker

        await updateDoc(doc(db, "lockers", locker.id), {
          status: "available",
          bookingId: null,
        })

        await addDoc(collection(db, "auditLogs"), {
          userId: patientId,
          userName: data?.patientName || "Patient",
          action: "Locker Closed",
          details: `Locker ${locker.label} released after collection for booking ${bookingId}`,
          timestamp: new Date().toISOString(),
        })
      }

      toast.success("Locker closed. Medication collected successfully!")
      setScanResult(null)
      setScanToken("")
      mutate()
      globalMutate("audit-logs")
    } catch (error) {
      console.error("Close locker failed:", error)
      toast.error("Failed to close locker")
    }
  }

  function openRefillDialog(prescription: Prescription) {
    setSelectedPrescription(prescription)
    setRefillReason("")
    setShowRefillDialog(true)
  }

  function openBookingDialog(prescription: Prescription) {
    setBookingPrescription(prescription)
    setPickupDate("")
    setPickupTime("")
    setPharmacyName("")
    setShowBookingDialog(true)
  }

  async function handleSubmitBooking() {
    if (!patientId) {
      toast.error("Not authenticated")
      return
    }

    if (!bookingPrescription || !pickupDate || !pickupTime || !pharmacyName) {
      toast.error("Please fill in all fields")
      return
    }

    const slotStart = parseSlotStart(pickupDate, pickupTime)

    if (slotStart.getTime() <= Date.now()) {
      toast.error("Please choose a pickup time slot that has not passed")
      return
    }

    const emailToUse = data?.patientEmail || patientEmail

    if (!emailToUse) {
      toast.error("Patient email is missing")
      return
    }

    setSubmittingBooking(true)
    try {
      const formattedPickup = `${pickupDate} ${pickupTime}`

      const existingBookingQuery = query(
        collection(db, "bookings"),
        where("prescriptionId", "==", bookingPrescription.id)
      )
      const existingBookingSnap = await getDocs(existingBookingQuery)

      const existingBookings = existingBookingSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Booking, "id">),
      })) as Booking[]

      const hasActiveBooking = existingBookings.some((b) =>
        ["pending", "locker_assigned", "ready"].includes(b.status)
      )

      if (hasActiveBooking) {
        toast.error("This prescription already has an active booking")
        return
      }

      const bookingRef = await addDoc(collection(db, "bookings"), {
        prescriptionId: bookingPrescription.id,
        patientEmail: emailToUse,
        pickupTime: formattedPickup,
        pharmacyName,
        createdById: patientId,
        createdByRole: "patient",
        status: "pending",
        createdAt: new Date().toISOString(),
      })

      const expiresAt = parseSlotEnd(pickupDate, pickupTime)
      expiresAt.setMinutes(expiresAt.getMinutes() + 30)

      const qrToken =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

      await addDoc(collection(db, "qrCodes"), {
        bookingId: bookingRef.id,
        token: qrToken,
        expiresAt: expiresAt.toISOString(),
        used: false,
        createdAt: new Date().toISOString(),
      })

      await updateDoc(doc(db, "prescriptions", bookingPrescription.id), {
        status: "booked",
      })

      const emailBody = `Hello ${data?.patientName || "Patient"},

Your prescription pickup booking has been created successfully.

Booking details:
- Pickup time: ${formattedPickup}
- Pharmacy: ${pharmacyName}
- Booking status: Booked

QR token to unlock locker:
${qrToken}

QR expiry:
${expiresAt.toLocaleString()}

Instructions:
Use this QR token when collecting your prescription to unlock the locker.
`

      await addDoc(collection(db, "emailLogs"), {
        to: emailToUse,
        patientName: data?.patientName || "",
        bookingId: bookingRef.id,
        prescriptionId: bookingPrescription.id,
        type: "booking_confirmation",
        subject: "Prescription Pickup Booking Confirmed",
        body: emailBody,
        qrToken,
        pickupTime: formattedPickup,
        pharmacyName,
        status: "queued",
        deliveryMode: "prototype_firestore",
        createdAt: new Date().toISOString(),
        createdById: patientId,
        createdByRole: "patient",
      })

      await addDoc(collection(db, "auditLogs"), {
        userId: patientId,
        userName: data?.patientName || "Patient",
        action: "Patient Booking",
        details: `Booked prescription ${bookingPrescription.id} at ${pharmacyName}`,
        timestamp: new Date().toISOString(),
      })

      toast.success("Pickup booked successfully!")
      setShowBookingDialog(false)
      setBookingPrescription(null)
      setPickupDate("")
      setPickupTime("")
      setPharmacyName("")
      mutate()
      globalMutate("email-logs")
      globalMutate("audit-logs")
    } catch (error) {
      console.error("Booking failed:", error)
      toast.error("Failed to book pickup")
    } finally {
      setSubmittingBooking(false)
    }
  }

  async function handleSubmitRefill() {
    if (!patientId) {
      toast.error("Not authenticated")
      return
    }

    if (!selectedPrescription || !refillReason.trim()) {
      toast.error("Please provide a reason for the refill request")
      return
    }

    setSubmittingRefill(true)
    try {
      const existingQuery = query(
        collection(db, "refillRequests"),
        where("patientId", "==", patientId),
        where("prescriptionId", "==", selectedPrescription.id),
        where("status", "==", "pending")
      )
      const existingSnap = await getDocs(existingQuery)

      if (!existingSnap.empty) {
        toast.error("A refill request is already pending for this prescription")
        return
      }

      await addDoc(collection(db, "refillRequests"), {
        prescriptionId: selectedPrescription.id,
        patientId,
        patientName: selectedPrescription.patientName,
        patientEmail: data?.patientEmail || patientEmail,
        doctorId: selectedPrescription.doctorId,
        medications: selectedPrescription.medications,
        reason: refillReason.trim(),
        status: "pending",
        createdAt: new Date().toISOString(),
      })

      await addDoc(collection(db, "auditLogs"), {
        userId: patientId,
        userName: data?.patientName || "Patient",
        action: "Refill Requested",
        details: `Refill request for prescription ${selectedPrescription.id}`,
        timestamp: new Date().toISOString(),
      })

      toast.success("Refill request submitted successfully!")
      setShowRefillDialog(false)
      setSelectedPrescription(null)
      setRefillReason("")
      mutateRefills()
      globalMutate("audit-logs")
    } catch (error) {
      console.error("Refill request failed:", error)
      toast.error("Failed to submit refill request")
    } finally {
      setSubmittingRefill(false)
    }
  }

  function hasPendingRefill(prescriptionId: string): boolean {
    return refillRequests.some(
      (r) => r.prescriptionId === prescriptionId && r.status === "pending"
    )
  }

  function getRefillRequestStatus(prescriptionId: string): RefillRequest | undefined {
    return refillRequests.find((r) => r.prescriptionId === prescriptionId)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="mb-3 h-10 w-10 animate-spin text-muted-foreground" />
            <p className="font-medium text-card-foreground">Loading patient dashboard...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <User className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold text-foreground">Patient Dashboard</h2>
            <p className="text-sm text-muted-foreground">
              View your prescriptions and collect medication
            </p>
          </div>
        </div>
        <Button onClick={() => setShowScanDialog(true)}>
          <QrCode className="mr-1.5 h-4 w-4" />
          Scan QR Code
        </Button>
      </div>

      <Dialog open={showScanDialog} onOpenChange={setShowScanDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan QR Code</DialogTitle>
            <DialogDescription>
              Enter the QR code token from your email to unlock the locker
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qr-token">QR Code Token</Label>
              <Input
                id="qr-token"
                placeholder="Paste your QR token here..."
                value={scanToken}
                onChange={(e) => setScanToken(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <Button onClick={handleScan} disabled={scanning} className="w-full">
              {scanning ? "Validating..." : "Validate & Unlock Locker"}
            </Button>

            {scanResult && (
              <div
                className={`rounded-lg p-4 ${
                  scanResult.success
                    ? "border border-[hsl(152,60%,40%)] bg-[hsl(152,40%,95%)]"
                    : "border border-destructive bg-[hsl(0,70%,97%)]"
                }`}
              >
                {scanResult.success ? (
                  <div className="space-y-3 text-center">
                    <Unlock className="mx-auto h-10 w-10 text-[hsl(152,60%,40%)]" />
                    <div>
                      <p className="font-medium text-[hsl(152,60%,25%)]">Locker Unlocked!</p>
                      <p className="text-sm text-[hsl(152,60%,30%)]">
                        {scanResult.lockerLabel} is now open. Please collect your medication.
                      </p>
                    </div>
                    {scanResult.bookingId && (
                      <Button
                        size="sm"
                        onClick={() => handleCloseLocker(scanResult.bookingId!)}
                        className="mt-2"
                      >
                        <Lock className="mr-1.5 h-4 w-4" />
                        Close Locker After Collection
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 text-center">
                    <XCircle className="mx-auto h-10 w-10 text-destructive" />
                    <p className="font-medium text-destructive">{scanResult.error}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pickup QR Token</DialogTitle>
            <DialogDescription>
              Show this QR token when collecting your medication.
            </DialogDescription>
          </DialogHeader>

          {selectedQrItem?.qr && selectedQrItem?.booking ? (
            <div className="space-y-4 text-center">
              <div className="rounded-xl border border-dashed bg-muted p-6">
                <QrCode className="mx-auto h-16 w-16 text-foreground" />
                <p className="mt-4 break-all font-mono text-sm text-foreground">
                  {selectedQrItem.qr.token}
                </p>
              </div>

              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">
                  Booking: <span className="font-medium text-foreground">{selectedQrItem.booking.id}</span>
                </p>
                <p className="text-muted-foreground">
                  Pharmacy:{" "}
                  <span className="font-medium text-foreground">
                    {selectedQrItem.booking.pharmacyName}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  Pickup Time:{" "}
                  <span className="font-medium text-foreground">
                    {selectedQrItem.booking.pickupTime}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  Expires:{" "}
                  <span className="font-medium text-foreground">
                    {new Date(selectedQrItem.qr.expiresAt).toLocaleString()}
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active QR code available.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showRefillDialog} onOpenChange={setShowRefillDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Prescription Refill</DialogTitle>
            <DialogDescription>
              Submit a refill request for your medication. Your doctor will review and approve or decline the request.
            </DialogDescription>
          </DialogHeader>
          {selectedPrescription && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm font-medium text-foreground">Medications to refill:</p>
                <ul className="mt-2 space-y-1">
                  {selectedPrescription.medications.map((med, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground">
                      {med.name} - {med.dosage}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <Label htmlFor="refill-reason">Reason for Refill</Label>
                <Textarea
                  id="refill-reason"
                  placeholder="Please explain why you need a refill"
                  value={refillReason}
                  onChange={(e) => setRefillReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRefillDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitRefill} disabled={submittingRefill || !refillReason.trim()}>
              {submittingRefill ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="mr-1.5 h-4 w-4" />
                  Submit Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Book Prescription Pickup</DialogTitle>
            <DialogDescription>
              Select a pharmacy and time slot for your medication pickup.
            </DialogDescription>
          </DialogHeader>
          {bookingPrescription && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm font-medium text-foreground">Medications:</p>
                <ul className="mt-2 space-y-1">
                  {bookingPrescription.medications.map((med, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground">
                      {med.name} - {med.dosage}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium text-foreground">
                  {data?.patientEmail || patientEmail || "No email found"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pharmacy">Pharmacy</Label>
                <Select value={pharmacyName} onValueChange={setPharmacyName}>
                  <SelectTrigger id="pharmacy">
                    <SelectValue placeholder="Select pharmacy" />
                  </SelectTrigger>
                  <SelectContent>
                    {PHARMACIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {p}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pickup-date">Pickup Date</Label>
                <Input
                  id="pickup-date"
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  min={todayString}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pickup-time">Time Slot</Label>
                <Select value={pickupTime} onValueChange={setPickupTime}>
                  <SelectTrigger id="pickup-time">
                    <SelectValue placeholder="Select time slot" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map((t) => (
                      <SelectItem key={t} value={t}>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {t}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBookingDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitBooking}
              disabled={submittingBooking || !pickupDate || !pickupTime || !pharmacyName}
            >
              {submittingBooking ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Booking...
                </>
              ) : (
                <>
                  <CalendarClock className="mr-1.5 h-4 w-4" />
                  Confirm Booking
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="prescriptions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="prescriptions">My Prescriptions</TabsTrigger>
          <TabsTrigger value="refill-requests">
            Refill Requests
            {refillRequests.filter((r) => r.status === "pending").length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {refillRequests.filter((r) => r.status === "pending").length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prescriptions" className="space-y-4">
          {items.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium text-card-foreground">No Prescriptions Yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  When your doctor creates a prescription, it will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <PatientPrescriptionCard
                  key={item.prescription.id}
                  item={item}
                  onCloseLocker={handleCloseLocker}
                  onRequestRefill={openRefillDialog}
                  onBookPrescription={openBookingDialog}
                  onViewQr={openQrDialog}
                  hasPendingRefill={hasPendingRefill(item.prescription.id)}
                  refillRequest={getRefillRequestStatus(item.prescription.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="refill-requests" className="space-y-4">
          {refillRequests.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <RefreshCw className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium text-card-foreground">No Refill Requests</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You can request refills for collected prescriptions.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {refillRequests.map((request) => (
                <RefillRequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PatientPrescriptionCard({
  item,
  onCloseLocker,
  onRequestRefill,
  onBookPrescription,
  onViewQr,
  hasPendingRefill,
  refillRequest,
}: {
  item: PatientItem
  onCloseLocker: (bookingId: string) => void
  onRequestRefill: (prescription: Prescription) => void
  onBookPrescription: (prescription: Prescription) => void
  onViewQr: (item: PatientItem) => void
  hasPendingRefill: boolean
  refillRequest?: RefillRequest
}) {
  const { prescription: rx, booking, locker, qr } = item
  const canRequestRefill = rx.status === "collected" && !hasPendingRefill
  const canBookPickup =
    rx.status === "confirmed" &&
    (!booking || ["expired", "collected"].includes(booking.status))

  const canViewQr =
    !!qr &&
    !!booking &&
    ["pending", "locker_assigned", "ready"].includes(booking.status) &&
    !qr.used &&
    new Date(qr.expiresAt) > new Date()

  const statusSteps = [
    { key: "confirmed", label: "Prescribed", icon: CheckCircle2, done: true },
    {
      key: "booked",
      label: "Booked",
      icon: Clock,
      done: ["booked", "ready", "collected"].includes(rx.status),
    },
    {
      key: "ready",
      label: "Ready",
      icon: Package,
      done: ["ready", "collected"].includes(rx.status),
    },
    {
      key: "collected",
      label: "Collected",
      icon: CheckCircle2,
      done: rx.status === "collected",
    },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">
              {rx.medications.map((m) => m.name).join(", ")}
            </CardTitle>
            <CardDescription>
              {rx.medications.map((m) => `${m.name}: ${m.dosage}`).join(" | ")}
            </CardDescription>
          </div>
          <PrescriptionStatusBadge status={rx.status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          {statusSteps.map((step, i) => {
            const Icon = step.icon
            return (
              <div key={step.key} className="flex items-center gap-1">
                <div
                  className={`flex items-center gap-1.5 ${
                    step.done ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-xs font-medium">{step.label}</span>
                </div>
                {i < statusSteps.length - 1 && (
                  <div
                    className={`ml-2 h-px w-8 ${
                      step.done ? "bg-primary" : "bg-border"
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>

        {booking && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Pharmacy</p>
                <p className="font-medium text-foreground">{booking.pharmacyName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pickup Time</p>
                <p className="font-medium text-foreground">{booking.pickupTime}</p>
              </div>
            </div>
          </div>
        )}

        {booking?.status === "expired" && (
          <div className="rounded-lg border border-destructive bg-[hsl(0,70%,97%)] p-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <p className="text-sm font-medium text-destructive">
                Your previous QR code expired. Please book a new pickup slot.
              </p>
            </div>
          </div>
        )}

        {locker && locker.status === "unlocked" && booking && (
          <div className="rounded-lg border border-[hsl(152,60%,40%)] bg-[hsl(152,40%,95%)] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Unlock className="h-6 w-6 text-[hsl(152,60%,40%)]" />
                <div>
                  <p className="font-medium text-[hsl(152,60%,25%)]">
                    Locker {locker.label} is Open
                  </p>
                  <p className="text-sm text-[hsl(152,60%,30%)]">
                    Please collect your medication
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => onCloseLocker(booking.id)}>
                <Lock className="mr-1.5 h-4 w-4" />
                Close Locker
              </Button>
            </div>
          </div>
        )}

        {canViewQr && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onViewQr(item)}
          >
            <QrCode className="mr-1.5 h-4 w-4" />
            View QR
          </Button>
        )}

        {canBookPickup && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onBookPrescription(rx)}
          >
            <CalendarClock className="mr-1.5 h-4 w-4" />
            Book Pickup
          </Button>
        )}

        {canRequestRefill && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onRequestRefill(rx)}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Request Refill
          </Button>
        )}

        {refillRequest && refillRequest.status === "pending" && (
          <div className="rounded-lg border border-[hsl(37,80%,60%)] bg-[hsl(37,80%,95%)] p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[hsl(37,90%,30%)]" />
              <p className="text-sm font-medium text-[hsl(37,90%,25%)]">
                Refill request pending doctor approval
              </p>
            </div>
          </div>
        )}

        {refillRequest && refillRequest.status === "rejected" && (
          <div className="rounded-lg border border-destructive bg-[hsl(0,70%,97%)] p-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">
                  Refill request declined
                </p>
                {refillRequest.rejectionReason && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reason: {refillRequest.rejectionReason}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PrescriptionStatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    confirmed: "bg-[hsl(200,80%,92%)] text-[hsl(200,80%,30%)]",
    booked: "bg-[hsl(173,40%,92%)] text-[hsl(173,58%,22%)]",
    ready: "bg-[hsl(37,80%,92%)] text-[hsl(37,90%,30%)]",
    collected: "bg-[hsl(152,50%,92%)] text-[hsl(152,60%,25%)]",
    expired: "bg-[hsl(0,70%,95%)] text-destructive",
  }

  const labels: Record<string, string> = {
    confirmed: "Awaiting Booking",
    booked: "Booked",
    ready: "Ready for Pickup",
    collected: "Collected",
    expired: "Expired",
  }

  return <Badge className={variants[status] || ""}>{labels[status] || status}</Badge>
}

function RefillRequestCard({ request }: { request: RefillRequest }) {
  const statusVariants: Record<string, string> = {
    pending: "bg-[hsl(37,80%,92%)] text-[hsl(37,90%,30%)]",
    approved: "bg-[hsl(152,50%,92%)] text-[hsl(152,60%,25%)]",
    rejected: "bg-[hsl(0,70%,95%)] text-destructive",
  }

  const statusLabels: Record<string, string> = {
    pending: "Pending Review",
    approved: "Approved",
    rejected: "Declined",
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              {request.medications.map((m) => m.name).join(", ")}
            </p>
            <p className="text-sm text-muted-foreground">
              Requested: {new Date(request.createdAt).toLocaleDateString()}
            </p>
            <p className="text-sm text-muted-foreground">Reason: {request.reason}</p>
          </div>
          <Badge className={statusVariants[request.status]}>
            {statusLabels[request.status]}
          </Badge>
        </div>

        {request.status === "rejected" && request.rejectionReason && (
          <div className="mt-3 rounded-lg border border-destructive bg-[hsl(0,70%,97%)] p-2">
            <p className="text-sm text-destructive">
              <span className="font-medium">Reason:</span> {request.rejectionReason}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}