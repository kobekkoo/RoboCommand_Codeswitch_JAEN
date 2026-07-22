"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardStats } from "@/lib/domain";

export function DashboardCharts({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartPanel title="Distribution by language">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={stats.byLanguage}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" interval={0} height={56} label={{ value: "Language", position: "insideBottom", offset: -2 }} />
            <YAxis allowDecimals={false} width={56} label={{ value: "Recordings", angle: -90, position: "insideLeft" }} />
            <Tooltip />
            <Bar dataKey="value" fill="#28615b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
      <ChartPanel title="Daily collection volume">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={stats.dailyVolume}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" height={56} label={{ value: "Submission date", position: "insideBottom", offset: -2 }} />
            <YAxis allowDecimals={false} width={56} label={{ value: "Recordings", angle: -90, position: "insideLeft" }} />
            <Tooltip />
            <Line type="monotone" dataKey="submitted" stroke="#28615b" strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>
      <ChartPanel title="Distribution by environment">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={stats.byEnvironment}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              interval={0}
              angle={-20}
              textAnchor="end"
              height={84}
              tick={{ fontSize: 11 }}
              label={{ value: "Environment", position: "insideBottom", offset: -4 }}
            />
            <YAxis allowDecimals={false} width={56} label={{ value: "Recordings", angle: -90, position: "insideLeft" }} />
            <Tooltip />
            <Bar dataKey="value" fill="#3f6f91" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
      <ChartPanel title="Distribution by command variant">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={stats.byVariant}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              interval={0}
              angle={-20}
              textAnchor="end"
              height={84}
              tick={{ fontSize: 11 }}
              label={{ value: "Command variant", position: "insideBottom", offset: -4 }}
            />
            <YAxis allowDecimals={false} width={56} label={{ value: "Recordings", angle: -90, position: "insideLeft" }} />
            <Tooltip />
            <Bar dataKey="value" fill="#6b6256" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}
