"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Pill, Lock, QrCode, CheckCircle2, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RiskDisplay } from "@/components/risk/risk-display"
import {
  getPharmacyBookings,
  getAvailableLockerList,
  assignLockerToBooking,
  markBookingReady,
  generateStaffQR,
} from "@/lib/actions"
import type { Prescription, Booking, Locker, QRCode as QRCodeType } from "@/lib/types"
import useSWR, { useSWRConfig } from "swr"

function usePharmacyData() {
  return useSWR("pharmacy-bookings", async () => {
    const res = await getPharmacyBookings()
    if (res.error) throw new Error(res.error)
    return res.items || []
  })
}

function useLockers() {
  return useSWR("available-lockers", async () => {
    const res = await getAvailableLockerList()
    if (res.error) throw new Error(res.error)
    return res.lockers || []
  })
}

interface PharmacyItem {
  prescription: Prescription
  booking: Booking | null
  locker: Locker | null
  qr: QRCodeType | null
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
          {items.map((item: PharmacyItem) => (
            <PharmacyCard
              key={item.prescription.id}
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
  const [staffQR, setStaffQR] = useState<QRCodeType | null>(null)

  async function handleAssignLocker() {
    if (!booking || !selectedLockerId) return
    setAssigning(true)
    try {
      const res = await assignLockerToBooking(booking.id, selectedLockerId)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success("Locker assigned successfully")
        onUpdate()
        globalMutate("audit-logs")
        globalMutate("email-logs")
      }
    } finally {
      setAssigning(false)
    }
  }

  async function handleMarkReady() {
    if (!booking) return
    setMarking(true)
    try {
      const res = await markBookingReady(booking.id)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success("Booking marked as ready. QR code generated and email sent.")
        onUpdate()
        globalMutate("audit-logs")
        globalMutate("email-logs")
      }
    } finally {
      setMarking(false)
    }
  }

  async function handleGenerateStaffQR() {
    if (!booking) return
    try {
      const res = await generateStaffQR(booking.id)
      if (res.error) {
        toast.error(res.error)
      } else if (res.qr) {
        setStaffQR(res.qr)
        setShowQR(true)
      }
    } catch {
      toast.error("Failed to generate staff QR")
    }
  }

  const bookingStatus = booking?.status || "pending"

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{rx.patientName}</CardTitle>
            <CardDescription>
              {rx.medications.map((m) => `${m.name} (${m.dosage})`).join(", ")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <BookingStatusBadge status={bookingStatus} />
            {rx.riskAssessment && <RiskDisplay assessment={rx.riskAssessment} compact />}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {booking && (
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
        )}

        {/* Step 1: Assign Locker */}
        {booking && bookingStatus === "pending" && (
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
            <Button onClick={handleAssignLocker} disabled={assigning || !selectedLockerId} size="sm">
              {assigning ? "Assigning..." : "Assign"}
            </Button>
          </div>
        )}

        {/* Step 2: Place Medication & Mark Ready */}
        {booking && bookingStatus === "locker_assigned" && locker && (
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">Step 2: Place medication in {locker.label}</p>
                <p className="text-xs text-muted-foreground">Once placed, mark as ready to generate QR and notify patient</p>
              </div>
            </div>
            <Button onClick={handleMarkReady} disabled={marking} size="sm">
              {marking ? "Processing..." : "Mark as Ready"}
            </Button>
          </div>
        )}

        {/* Step 3: Ready - Show QR Info */}
        {booking && bookingStatus === "ready" && qr && (
          <div className="space-y-3 rounded-lg border border-[hsl(152,60%,40%)] bg-[hsl(152,40%,95%)] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-[hsl(152,60%,30%)]" />
                <p className="text-sm font-medium text-[hsl(152,60%,25%)]">Ready for Patient Pickup</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleGenerateStaffQR}>
                <QrCode className="mr-1.5 h-4 w-4" />
                Staff QR
              </Button>
            </div>
            <div className="text-xs text-[hsl(152,60%,30%)]">
              <p>QR token sent to patient. Locker: {locker?.label}</p>
              <p>Expires: {new Date(qr.expiresAt).toLocaleString()}</p>
            </div>
          </div>
        )}

        {/* Collected */}
        {booking && bookingStatus === "collected" && (
          <div className="rounded-lg bg-muted p-4 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-[hsl(152,60%,40%)]" />
            <p className="text-sm font-medium text-foreground">Medication Collected</p>
          </div>
        )}

        {/* Staff QR Dialog */}
        <Dialog open={showQR} onOpenChange={setShowQR}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Staff QR Code</DialogTitle>
            </DialogHeader>
            {staffQR && (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted">
                  <div className="space-y-2">
                    <QrCode className="mx-auto h-16 w-16 text-foreground" />
                    <p className="font-mono text-xs text-muted-foreground break-all px-2">
                      {staffQR.token.slice(0, 20)}...
                    </p>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>Booking: {staffQR.bookingId}</p>
                  <p>Expires: {new Date(staffQR.expiresAt).toLocaleString()}</p>
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
