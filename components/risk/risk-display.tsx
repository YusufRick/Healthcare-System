import { AlertTriangle, CheckCircle, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { RiskAssessment } from "@/lib/types"

const levelConfig = {
  Low: {
    color: "bg-[hsl(152,60%,40%)] text-[hsl(0,0%,100%)]",
    bgColor: "bg-[hsl(152,40%,95%)] border-[hsl(152,60%,40%)]",
    textColor: "text-[hsl(152,60%,30%)]",
    icon: CheckCircle,
  },
  Medium: {
    color: "bg-[hsl(37,90%,51%)] text-[hsl(37,90%,12%)]",
    bgColor: "bg-[hsl(37,80%,95%)] border-[hsl(37,90%,51%)]",
    textColor: "text-[hsl(37,90%,35%)]",
    icon: Info,
  },
  High: {
    color: "bg-destructive text-destructive-foreground",
    bgColor: "bg-[hsl(0,70%,97%)] border-destructive",
    textColor: "text-destructive",
    icon: AlertTriangle,
  },
}

interface RiskDisplayProps {
  assessment: RiskAssessment
  compact?: boolean
}

export function RiskDisplay({ assessment, compact }: RiskDisplayProps) {
  const normalizedLevel = (assessment.level?.charAt(0).toUpperCase() + assessment.level?.slice(1).toLowerCase()) as keyof typeof levelConfig
  const config = levelConfig[normalizedLevel] ?? levelConfig.Low
  const Icon = config.icon

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Badge className={config.color}>
          {normalizedLevel} Risk ({assessment.score}/100)
        </Badge>
      </div>
    )
  }

  return (
    <Card className={`border ${config.bgColor}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className={`h-5 w-5 ${config.textColor}`} />
          <span className={config.textColor}>
            Risk Assessment: {normalizedLevel} ({assessment.score}/100)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {assessment.alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No risk factors identified.</p>
        ) : (
          assessment.alerts.map((alert, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-md border border-border bg-card p-3"
            >
              <AlertTriangle
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  alert.severity === "CRITICAL"
                    ? "text-destructive"
                    : alert.severity === "WARNING"
                      ? "text-[hsl(37,90%,51%)]"
                      : "text-muted-foreground"
                }`}
              />
              <div>
                <Badge
                  variant="outline"
                  className="mb-1 text-xs capitalize"
                >
                  {alert.type === "allergy" ? "Drug-Allergy" : alert.type === "dosage" ? "Dosage" : alert.type === "age" ? "Age" : "Drug-Drug Interaction"} &middot; {alert.severity}
                </Badge>
                <p className="text-sm text-card-foreground">{alert.message}</p>
              </div>
            </div>
          ))
        )}
        <p className="text-xs text-muted-foreground italic">
          This assessment is advisory only. Clinical judgment should always be applied.
        </p>
      </CardContent>
    </Card>
  )
}
