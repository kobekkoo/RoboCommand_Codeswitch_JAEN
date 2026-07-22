"use client";

import { useMemo, useState } from "react";
import { DashboardCharts } from "@/components/admin/DashboardCharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/forms";
import type { CollectionRecipe, CommandPrompt, DashboardStats, Recording, RecordingSession } from "@/lib/domain";

type AdminHomeSnapshot = {
  recipes: CollectionRecipe[];
  prompts: CommandPrompt[];
  sessions: RecordingSession[];
  recordings: Recording[];
};

export function AdminHomeView({ snapshot }: { snapshot: AdminHomeSnapshot }) {
  const [recipeId, setRecipeId] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const stats = useMemo(() => buildFilteredStats(snapshot, recipeId, dateRange), [snapshot, recipeId, dateRange]);
  const cards = [
    ["Total contributors", stats.totalContributors],
    ["Started sessions", stats.startedSessions],
    ["Completed sessions", stats.completedSessions],
    ["Submitted recordings", stats.submittedRecordings],
    ["Accepted recordings", stats.acceptedRecordings],
    ["Rejected recordings", stats.rejectedRecordings],
    ["Pending review", stats.pendingReviewRecordings],
    ["Usable recording rate", `${Math.round(stats.usableRecordingRate * 100)}%`],
    ["Avg recordings per completed session", stats.averageRecordingsPerCompletedSession.toFixed(1)],
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-white p-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Home</h1>
          <p className="text-sm text-zinc-600">Global filters update the overview cards and charts below.</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Recipe</Label>
            <Select value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
              <option value="all">All recipes</option>
              {snapshot.recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date range</Label>
            <Select value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
              <option value="all">All time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </Select>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="text-sm text-zinc-600">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <DashboardCharts stats={stats} />
    </div>
  );
}

function buildFilteredStats(snapshot: AdminHomeSnapshot, recipeId: string, dateRange: string): DashboardStats {
  const promptsById = new Map(snapshot.prompts.map((prompt) => [prompt.id, prompt]));
  const sessionsById = new Map(snapshot.sessions.map((session) => [session.id, session]));
  const submitted = snapshot.recordings.filter((recording) => {
    if (recording.deletedAt) return false;
    if (recipeId !== "all" && recording.recipeId !== recipeId) return false;
    return inDateRange(recording.submittedAt, dateRange);
  });
  const sessionIds = new Set(submitted.map((recording) => recording.sessionId));
  const filteredSessions = snapshot.sessions.filter((session) => {
    if (recipeId !== "all" && session.recipeId !== recipeId) return false;
    if (sessionIds.has(session.id)) return true;
    return inDateRange(session.startedAt, dateRange);
  });
  const accepted = submitted.filter((recording) => recording.reviewStatus === "accepted");
  const rejected = submitted.filter((recording) => recording.reviewStatus === "rejected");
  const pending = submitted.filter((recording) => recording.reviewStatus === "pending");
  const completedSessions = filteredSessions.filter((session) => session.status === "completed");
  const contributors = new Set([
    ...filteredSessions.map((session) => session.contributorId),
    ...submitted.map((recording) => recording.contributorId),
  ]);
  const sessionCounts = new Map<string, number>();
  submitted.forEach((recording) => sessionCounts.set(recording.sessionId, (sessionCounts.get(recording.sessionId) ?? 0) + 1));

  return {
    totalContributors: contributors.size,
    startedSessions: filteredSessions.length,
    completedSessions: completedSessions.length,
    submittedRecordings: submitted.length,
    acceptedRecordings: accepted.length,
    rejectedRecordings: rejected.length,
    pendingReviewRecordings: pending.length,
    usableRecordingRate: submitted.length ? accepted.length / submitted.length : 0,
    averageRecordingsPerCompletedSession: completedSessions.length
      ? completedSessions.reduce((sum, session) => sum + (sessionCounts.get(session.id) ?? 0), 0) / completedSessions.length
      : 0,
    byLanguage: groupCounts(submitted, (recording) => promptsById.get(recording.promptId)?.language),
    byEnvironment: groupCounts(submitted, (recording) => sessionsById.get(recording.sessionId)?.environmentType),
    byVariant: groupCounts(submitted, (recording) => promptsById.get(recording.promptId)?.commandVariant),
    byTaskType: groupCounts(submitted, (recording) => promptsById.get(recording.promptId)?.taskType),
    dailyVolume: groupCounts(submitted, (recording) => recording.submittedAt.slice(0, 10))
      .map(({ name, value }) => ({ date: name, submitted: value }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function groupCounts<T>(items: T[], label: (item: T) => string | undefined) {
  return [...items.reduce((map, item) => {
    const key = label(item) ?? "Unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>())]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function inDateRange(isoDate: string | undefined, dateRange: string) {
  if (!isoDate || dateRange === "all") return true;
  const days = Number(dateRange);
  if (!Number.isFinite(days)) return true;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(isoDate).getTime() >= cutoff;
}
