import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code,
  DollarSign,
  Flame,
  Gift,
  Lightbulb,
  Sparkles,
  Star,
  TrendingUp,
  Wrench,
  Zap,
} from "lucide-react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../../components/ui/button";
import { useUsageData } from "../../hooks";

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

export function WrappedPanel() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Available years (current year and previous years with data)
  const availableYears = [currentYear, currentYear - 1, currentYear - 2].filter((y) => y >= 2024);

  const canGoPrev = selectedYear > Math.min(...availableYears);
  const canGoNext = selectedYear < Math.max(...availableYears);

  // Always fetch month data for wrapped - it represents cumulative annual data
  const { data, isLoading, error } = useUsageData("month");

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t("usage.errorLoading")}
      </div>
    );
  }

  const { wrapped } = data;
  const hasMeaningfulData = wrapped !== null && wrapped.totalSessions > 0;

  // Year selector component
  const YearSelector = () => (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={!canGoPrev}
        onClick={() => setSelectedYear((y) => y - 1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <div className="flex min-w-[100px] items-center justify-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-sm font-medium">
        <Calendar className="size-4 text-muted-foreground" />
        <span>{selectedYear}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={!canGoNext}
        onClick={() => setSelectedYear((y) => y + 1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );

  if (!hasMeaningfulData) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-3 text-xl font-semibold text-foreground">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
              <Gift className="size-5 text-primary" />
            </span>
            {t("usage.wrapped")}
          </h1>
          <YearSelector />
        </div>

        {/* Empty State */}
        <div className="rounded-xl border border-border/50 bg-muted/30">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5">
              <Gift className="size-10 text-primary/60" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">{t("usage.noWrappedData")}</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {t("usage.noWrappedDataHint")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-3 text-xl font-semibold text-foreground">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
            <Gift className="size-5 text-primary" />
          </span>
          {t("usage.wrapped")}
        </h1>
        <YearSelector />
      </div>

      {/* Hero Card - Persona */}
      <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
        <div className="absolute -right-20 -top-20 size-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 size-48 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative px-8 py-10">
          <div className="flex flex-col items-center text-center">
            <p className="mb-4 text-xs font-medium uppercase tracking-widest text-primary/80">
              {t("usage.yourWrapped")}
            </p>

            <div className="mb-5 flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 shadow-lg shadow-primary/10">
              <Sparkles className="size-10 text-primary" />
            </div>

            <h2 className="text-3xl font-bold text-foreground">{wrapped.persona}</h2>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              {wrapped.personaDescription}
            </p>

            {/* Hero Stats Row */}
            <div className="mt-8 flex items-center gap-12">
              <div className="text-center">
                <p className="text-4xl font-bold text-primary">{wrapped.totalSessions}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("usage.sessionsLabel")}</p>
              </div>
              <div className="h-10 w-px bg-border" />
              <div className="text-center">
                <p className="text-4xl font-bold text-foreground">
                  {wrapped.totalHours.toFixed(0)}
                  <span className="text-lg font-normal text-muted-foreground">h</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("usage.totalTimeLabel")}</p>
              </div>
              <div className="h-10 w-px bg-border" />
              <div className="text-center">
                <p className="text-4xl font-bold text-foreground">
                  ${wrapped.totalCost.toFixed(0)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("usage.totalCostLabel")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Stats - 2 Column Layout */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Code Output Card */}
        <div className="rounded-xl border border-border/50 bg-muted/30 p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/10">
              <Code className="size-5 text-violet-500" />
            </div>
            <h3 className="font-medium text-foreground">{t("usage.codeOutput")}</h3>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold text-emerald-500">
                +{formatNumber(wrapped.linesAdded)}
              </p>
              <p className="text-xs text-muted-foreground">{t("usage.linesAdded")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-500">
                -{formatNumber(wrapped.linesRemoved)}
              </p>
              <p className="text-xs text-muted-foreground">{t("usage.linesRemoved")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{wrapped.filesModified}</p>
              <p className="text-xs text-muted-foreground">{t("usage.filesLabel")}</p>
            </div>
          </div>
        </div>

        {/* Usage Stats Card */}
        <div className="rounded-xl border border-border/50 bg-muted/30 p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <DollarSign className="size-5 text-emerald-500" />
            </div>
            <h3 className="font-medium text-foreground">{t("usage.usageStats")}</h3>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold text-foreground">${wrapped.totalCost.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{t("usage.totalSpent")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {formatNumber(wrapped.totalTokens)}
              </p>
              <p className="text-xs text-muted-foreground">{t("usage.tokensLabel")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {wrapped.codingStreak}
                <span className="text-sm font-normal text-muted-foreground">d</span>
              </p>
              <p className="text-xs text-muted-foreground">{t("usage.streakLabel")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences Row - 3 Column */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Top Model */}
        {wrapped.topModel && (
          <div className="flex items-center gap-4 rounded-xl border border-border/50 bg-muted/30 p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
              <Star className="size-6 text-blue-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{t("usage.topModel")}</p>
              <p className="truncate text-lg font-semibold text-foreground">
                {wrapped.topModel.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {wrapped.topModel.percentage}% {t("usage.ofRequests")}
              </p>
            </div>
          </div>
        )}

        {/* Favorite Tool */}
        {wrapped.favoriteTool && (
          <div className="flex items-center gap-4 rounded-xl border border-border/50 bg-muted/30 p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <Wrench className="size-6 text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{t("usage.favoriteTool")}</p>
              <p className="truncate text-lg font-semibold text-foreground">
                {wrapped.favoriteTool.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatNumber(wrapped.favoriteTool.count)} {t("usage.uses")}
              </p>
            </div>
          </div>
        )}

        {/* Peak Productivity */}
        <div className="flex items-center gap-4 rounded-xl border border-border/50 bg-muted/30 p-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-pink-500/10">
            <TrendingUp className="size-6 text-pink-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{t("usage.peakProductivity")}</p>
            <p className="text-lg font-semibold text-foreground">{wrapped.peakHour}:00</p>
            <p className="text-sm text-muted-foreground">
              ~{wrapped.avgSessionMinutes}min {t("usage.avgSession")}
            </p>
          </div>
        </div>
      </div>

      {/* Habits Row - 3 Column */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex items-center gap-4 rounded-xl border border-border/50 bg-muted/30 p-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
            <Flame className="size-6 text-orange-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("usage.codingStreak")}</p>
            <p className="text-lg font-semibold text-foreground">
              {wrapped.codingStreak} {t("usage.days")}
            </p>
            <p className="text-sm text-muted-foreground">{t("usage.longestStreak")}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-border/50 bg-muted/30 p-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10">
            <Clock className="size-6 text-cyan-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("usage.totalTime")}</p>
            <p className="text-lg font-semibold text-foreground">
              {wrapped.totalHours.toFixed(1)} {t("usage.hours")}
            </p>
            <p className="text-sm text-muted-foreground">{t("usage.totalCodingTime")}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-border/50 bg-muted/30 p-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10">
            <Zap className="size-6 text-indigo-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("usage.avgSessionTime")}</p>
            <p className="text-lg font-semibold text-foreground">
              {wrapped.avgSessionMinutes} {t("usage.minutes")}
            </p>
            <p className="text-sm text-muted-foreground">{t("usage.perSession")}</p>
          </div>
        </div>
      </div>

      {/* Fun Facts */}
      {wrapped.funFacts.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-muted/30 p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-purple-500/10">
              <Lightbulb className="size-5 text-purple-500" />
            </div>
            <h3 className="font-medium text-foreground">{t("usage.funFacts")}</h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {wrapped.funFacts.map((fact, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg bg-background/50 px-4 py-3">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="text-sm text-foreground">{fact}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pt-4 text-center">
        <p className="text-xs tracking-wide text-muted-foreground/50">
          NEO · {t("usage.footerTagline")} · {selectedYear}
        </p>
      </div>
    </div>
  );
}
