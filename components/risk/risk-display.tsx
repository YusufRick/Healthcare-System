import { AlertTriangle, CheckCircle, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { RiskAssessmentResult, ValidationIssue } from "@/lib/types"

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
  assessment: RiskAssessmentResult
  compact?: boolean
}

// Normalizes the raw assessment status into display levels.
// "unsafe" → "High", "review" → "Medium", "safe" → "Low"
function getNormalizedLevel(status: RiskAssessmentResult["status"]): keyof typeof levelConfig {
  if (status === "unsafe") return "High"
  if (status === "review") return "Medium"
  return "Low"
}

// Calculates a display score (0-100) based on the assessment status and number of issues.
// "unsafe" starts at 75 + 20 per issue, "review" starts at 40 + 15 per issue, "safe" is always 0.
function getDisplayScore(status: RiskAssessmentResult["status"], issues: ValidationIssue[]): number {
  if (status === "unsafe") return Math.max(75, issues.length * 20)
  if (status === "review") return Math.max(40, issues.length * 15)
  return 0
}

// Converts severity code to a user-friendly label and color.
// "high" → "CRITICAL" (red), "medium" → "WARNING" (orange), "low" → "INFO" (blue)
function getSeverityLabel(severity: ValidationIssue["severity"]) {
  if (severity === "high") return "CRITICAL"
  if (severity === "medium") return "WARNING"
  return "INFO"
}

// Determines the issue type label based on the issue code.
//e.g. if code contains "ALLERGY", it's a "Drug-Allergy" issue; if it contains "DOSAGE", it's a "Dosage" issue; otherwise, it's a "Drug-Drug Interaction".
function getIssueTypeLabel(code: string) {
  if (code.includes("ALLERGY")) return "Drug-Allergy"
  if (code.includes("DOSAGE")) return "Dosage"
  return "Drug-Drug Interaction"
}

export function RiskDisplay({ assessment, compact }: RiskDisplayProps) {
  const normalizedLevel = getNormalizedLevel(assessment.status)
  const config = levelConfig[normalizedLevel]
  const Icon = config.icon
  const displayScore = getDisplayScore(assessment.status, assessment.issues)

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Badge className={config.color}>
          {normalizedLevel} Risk ({displayScore}/100)
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
            Risk Assessment: {normalizedLevel} ({displayScore}/100)
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2">
        {assessment.issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No risk factors identified.</p>
        ) : (
          assessment.issues.map((issue, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-md border border-border bg-card p-3"
            >
              <AlertTriangle
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  issue.severity === "high"
                    ? "text-destructive"
                    : issue.severity === "medium"
                      ? "text-[hsl(37,90%,51%)]"
                      : "text-muted-foreground"
                }`}
              />
              <div>
                <Badge
                  variant="outline"
                  className="mb-1 text-xs capitalize"
                >
                  {getIssueTypeLabel(issue.code)} &middot; {getSeverityLabel(issue.severity)}
                </Badge>
                <p className="text-sm text-card-foreground">{issue.message}</p>
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