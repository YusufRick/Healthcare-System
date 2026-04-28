"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
} from "firebase/firestore"
import { db } from "@/src/config/firebase"
import { Pill, Lock, QrCode, CheckCircle2, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RiskDisplay } from "@/components/risk/risk-display"
import type {
  Prescription,
  Booking,
  Locker,
  QRCode as QRCodeType,
} from "@/lib/types"
import useSWR, { useSWRConfig } from "swr"

interface PharmacyItem {
  prescription: Prescription | null
  booking: Booking
  locker: Locker | null
  qr: QRCodeType | null
}

function usePharmacyData() {
  return useSWR<PharmacyItem[]>("pharmacy-bookings", async () => {
    const bookingSnap = await getDocs(collection(db, "bookings"))

    const bookings = bookingSnap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<Booking, "id">),
    })) as Booking[]

    const items = await Promise.all(
      bookings.map(async (booking) => {
        let prescription: Prescription | null = null
        let locker: Locker | null = null
        let qr: QRCodeType | null = null

        if (booking.prescriptionId) {
          const prescriptionSnap = await getDoc(doc(db, "prescriptions", booking.prescriptionId))
          if (prescriptionSnap.exists()) {
            prescription = {
              id: prescriptionSnap.id,
              ...(prescriptionSnap.data() as Omit<Prescription, "id">),
            } as Prescription
          }
          console.log("bookings snapshot size:", bookingSnap.size)
console.log(
  "bookings data:",
  bookingSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
)
        }

        const lockerQuery = query(
          collection(db, "lockers"),
          where("bookingId", "==", booking.id)
        )
        const lockerSnap = await getDocs(lockerQuery)
        if (!lockerSnap.empty) {
          locker = {
            id: lockerSnap.docs[0].id,
            ...(lockerSnap.docs[0].data() as Omit<Locker, "id">),
          } as Locker
        }

        const qrQuery = query(
          collection(db, "qrCodes"),
          where("bookingId", "==", booking.id)
        )
        const qrSnap = await getDocs(qrQuery)
        if (!qrSnap.empty) {
          qr = {
            id: qrSnap.docs[0].id,
            ...(qrSnap.docs[0].data() as Omit<QRCodeType, "id">),
          } as QRCodeType
        }

        return {
          prescription,
          booking,
          locker,
          qr,
        }
      })
    )

    return items.sort(
      (a, b) =>
        new Date(b.booking.createdAt).getTime() -
        new Date(a.booking.createdAt).getTime()
    )
  })
}

function useLockers() {
  return useSWR<Locker[]>("available-lockers", async () => {
    const q = query(
      collection(db, "lockers"),
      where("status", "==", "available")
    )

    const snap = await getDocs(q)

    return snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<Locker, "id">),
    })) as Locker[]
  })
}

export function PharmacyDashboard() {
  const { data: items = [], mutate } = usePharmacyData()
  const { data: lockers = [], mutate: mutateLockers } = useLockers()

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Pill className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-semibold text-foreground">Pharmacy Staff Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Manage locker allocation, medication placement, and dispensing
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-card-foreground">No Bookings Yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Waiting for clinic staff to create bookings. They will appear here for dispensing.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <PharmacyCard
              key={item.booking.id}
              item={item}
              lockers={lockers}
              onUpdate={() => {
                mutate()
                mutateLockers()
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PharmacyCard({
  item,
  lockers,
  onUpdate,
}: {
  item: PharmacyItem
  lockers: Locker[]
  onUpdate: () => void
}) {
  const { mutate: globalMutate } = useSWRConfig()
  const { prescription: rx, booking, locker, qr } = item

  const [selectedLockerId, setSelectedLockerId] = useState("")
  const [assigning, setAssigning] = useState(false)
  const [marking, setMarking] = useState(false)
  const [showQR, setShowQR] = useState(false)


  //handles assigning a locker to the booking.
  //  It checks if the locker is still available,
  //  updates the locker and booking status in Firestore,
  //  creates an audit log entry, and shows success/error toasts.
  async function handleAssignLocker() {
    if (!booking || !selectedLockerId) return

    setAssigning(true)


    try {
      const lockerRef = doc(db, "lockers", selectedLockerId)
      const lockerSnap = await getDoc(lockerRef)

      if (!lockerSnap.exists()) {
        toast.error("Locker not found")
        return
      }

      //check if locker is still available before assigning
      //by fetching the latest locker data from Firestore and verifying its status.
      //if locker is no longer available, 
      // show an error toast and prevent assignment to avoid conflicts
      //  in a concurrent environment.
      const lockerData = lockerSnap.data() as Omit<Locker, "id">
      if (lockerData.status !== "available") {
        toast.error("Locker is no longer available")
        return
      }
      //if locker is available,
      //  proceed with assignment 
      // by updating locker and booking records in Firestore,

      await updateDoc(lockerRef, {
        status: "occupied",
        bookingId: booking.id,
      })

      //update the booking status to "locker_assigned" 
      await updateDoc(doc(db, "bookings", booking.id), {
        status: "locker_assigned",
      })

      await addDoc(collection(db, "auditLogs"), {
        userId: booking.createdById,
        userName: "Pharmacy Staff",
        action: "Locker Assigned",
        details: `Locker ${lockerData.label} assigned to booking ${booking.id}`,
        timestamp: new Date().toISOString(),
      })

      toast.success("Locker assigned successfully")
      setSelectedLockerId("")
      onUpdate()
      globalMutate("pharmacy-bookings")
      globalMutate("available-lockers")
      globalMutate("audit-logs")
    } catch (error) {
      console.error("Assign locker failed:", error)
      toast.error("Failed to assign locker")
    } finally {
      setAssigning(false)
    }
  }


  // handles the "Mark as Ready" action, 
  // which updates the booking and prescription status,
  //  generates a QR code if needed,
  //  logs an email to be sent to the patient, and creates an audit log entry.
  async function handleMarkReady() {
    if (!booking) return

    setMarking(true)
    try {
      await updateDoc(doc(db, "bookings", booking.id), {
        status: "ready",
      })

      if (booking.prescriptionId) {
        await updateDoc(doc(db, "prescriptions", booking.prescriptionId), {
          status: "ready",
        })
      }


      //let's check if a QR code already exists for this booking.
      //  If it does, we can reuse it,
      //  if not, we generate a new one.
      //  This allows us to avoid creating multiple QR codes
  
      let finalQr = qr

      if (!finalQr) {
        const expiresAt = new Date()
        expiresAt.setMinutes(expiresAt.getMinutes() + 60)

        //create a unique token for the QR code.
        //  In a production system,
        //  we would want to ensure this token is truly unique and secure,
        const qrToken =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

        const qrRef = await addDoc(collection(db, "qrCodes"), {
          bookingId: booking.id,
          token: qrToken,
          expiresAt: expiresAt.toISOString(),
          used: false,
          createdAt: new Date().toISOString(),
        })

        finalQr = {
          id: qrRef.id,
          bookingId: booking.id,
          token: qrToken,
          expiresAt: expiresAt.toISOString(),
          used: false,
          createdAt: new Date().toISOString(),
        } as QRCodeType
      }

      const patientName = rx?.patientName || booking.patientEmail || "Patient"
      const lockerLabel = locker?.label || "Assigned Locker"

      const readyEmailBody = `Hello ${patientName},

Your prescription is now ready for pickup.

Pickup details:
- Pickup time: ${booking.pickupTime}
- Pharmacy: ${booking.pharmacyName}
- Locker: ${lockerLabel}
- Booking status: Ready

QR token to unlock locker:
${finalQr.token}

Instructions:
Use this QR token when collecting your prescription to unlock the locker.

This is a prototype email record stored in Firestore.
`

      await addDoc(collection(db, "emailLogs"), {
        to: booking.patientEmail,
        patientName,
        bookingId: booking.id,
        prescriptionId: booking.prescriptionId,
        type: "pickup_ready",
        subject: "Your Prescription is Ready for Pickup",
        body: readyEmailBody,
        qrToken: finalQr.token,
        pickupTime: booking.pickupTime,
        pharmacyName: booking.pharmacyName,
        lockerLabel,
        status: "queued",
        deliveryMode: "prototype_firestore",
        createdAt: new Date().toISOString(),
        createdById: booking.createdById,
        createdByRole: "pharmacy_staff",
      })

      await addDoc(collection(db, "auditLogs"), {
        userId: booking.createdById,
        userName: "Pharmacy Staff",
        action: "Booking Ready",
        details: `Booking ${booking.id} marked ready. Locker: ${lockerLabel}. QR token available.`,
        timestamp: new Date().toISOString(),
      })

      toast.success("Booking marked as ready")
      onUpdate()
      globalMutate("pharmacy-bookings")
      globalMutate("available-lockers")
      globalMutate("audit-logs")
      globalMutate("email-logs")
    } catch (error) {
      console.error("Mark ready failed:", error)
      toast.error("Failed to mark booking as ready")
    } finally {
      setMarking(false)
    }
  }

  const bookingStatus = booking?.status || "pending"
  const patientLabel = rx?.patientName || booking.patientEmail || "Unknown Patient"
  const medsLabel =
    rx?.medications?.map((m) => `${m.name} (${m.dosage})`).join(", ") || "No medication details"

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{patientLabel}</CardTitle>
            <CardDescription>{medsLabel}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <BookingStatusBadge status={bookingStatus} />
            {rx?.riskAssessment && <RiskDisplay assessment={rx.riskAssessment} compact />}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted p-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Pickup Time</p>
            <p className="font-medium text-foreground">{booking.pickupTime}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pharmacy</p>
            <p className="font-medium text-foreground">{booking.pharmacyName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Patient Email</p>
            <p className="font-medium text-foreground">{booking.patientEmail}</p>
          </div>
        </div>

        {locker && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="text-xs text-muted-foreground">Assigned Locker</p>
            <p className="font-medium text-foreground">{locker.label}</p>
          </div>
        )}

        {bookingStatus === "pending" && (
          <div className="flex items-end gap-3 rounded-lg border border-border p-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium text-foreground">Step 1: Assign Locker</p>
              </div>

              <Select value={selectedLockerId} onValueChange={setSelectedLockerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select available locker" />
                </SelectTrigger>
                <SelectContent>
                  {lockers.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleAssignLocker}
              disabled={assigning || !selectedLockerId}
              size="sm"
            >
              {assigning ? "Assigning..." : "Assign"}
            </Button>
          </div>
        )}

        {bookingStatus === "locker_assigned" && locker && (
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Step 2: Place medication in {locker.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  Once placed, mark as ready for patient pickup
                </p>
              </div>
            </div>

            <Button onClick={handleMarkReady} disabled={marking} size="sm">
              {marking ? "Processing..." : "Mark as Ready"}
            </Button>
          </div>
        )}

        {bookingStatus === "ready" && qr && (
          <div className="space-y-3 rounded-lg border border-[hsl(152,60%,40%)] bg-[hsl(152,40%,95%)] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-[hsl(152,60%,30%)]" />
                <p className="text-sm font-medium text-[hsl(152,60%,25%)]">
                  Ready for Patient Pickup
                </p>
              </div>

              <Button variant="outline" size="sm" onClick={() => setShowQR(true)}>
                <QrCode className="mr-1.5 h-4 w-4" />
                View QR Token
              </Button>
            </div>

            <div className="text-xs text-[hsl(152,60%,30%)]">
              <p>Locker: {locker?.label || "Assigned Locker"}</p>
              <p>QR token available for pickup</p>
              <p>Expires: {new Date(qr.expiresAt).toLocaleString()}</p>
            </div>
          </div>
        )}

        {bookingStatus === "collected" && (
          <div className="rounded-lg bg-muted p-4 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-[hsl(152,60%,40%)]" />
            <p className="text-sm font-medium text-foreground">Medication Collected</p>
          </div>
        )}

        <Dialog open={showQR} onOpenChange={setShowQR}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pickup QR Token</DialogTitle>
            </DialogHeader>

            {qr && (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted">
                  <div className="space-y-2">
                    <QrCode className="mx-auto h-16 w-16 text-foreground" />
                    <p className="break-all px-2 font-mono text-xs text-muted-foreground">
                      {qr.token}
                    </p>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  <p>Booking: {qr.bookingId}</p>
                  <p>Locker: {locker?.label || "Assigned Locker"}</p>
                  <p>Expires: {new Date(qr.expiresAt).toLocaleString()}</p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

function BookingStatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-[hsl(37,80%,92%)] text-[hsl(37,90%,30%)]",
    locker_assigned: "bg-[hsl(200,80%,92%)] text-[hsl(200,80%,30%)]",
    ready: "bg-[hsl(152,50%,92%)] text-[hsl(152,60%,25%)]",
    collected: "bg-muted text-muted-foreground",
    expired: "bg-[hsl(0,70%,95%)] text-destructive",
  }

  const labels: Record<string, string> = {
    pending: "Pending Locker",
    locker_assigned: "Locker Assigned",
    ready: "Ready",
    collected: "Collected",
    expired: "Expired",
  }

  return (
    <Badge className={`text-xs ${variants[status] || ""}`}>
      {labels[status] || status}
    </Badge>
  )
}