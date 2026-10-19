import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SCurveSeries } from '@/lib/scurve'
import { fmtDate, fmtDateShort, fmtPct } from '@/lib/format'

// Chart chrome tokens (validated reference palette, light mode)
export const VIZ = {
  series1: '#2a78d6', // actual
  deEmphasis: '#898781', // planned (context)
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#898781',
  ink: '#141414',
  ink2: '#52514e',
  surface: '#ffffff',
}

const axisTick = { fontSize: 11, fill: VIZ.muted }

interface TipRow {
  key: string
  label: string
  value: string
  color: string
}

function TipBox({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2 py-0.5">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: r.color }} />
          <span className="font-semibold tabular text-ink">{r.value}</span>
          <span className="text-ink-2">{r.label}</span>
        </div>
      ))}
    </div>
  )
}

type TipProps = { active?: boolean; label?: unknown; payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown; color?: string }> }

export function SCurveChart({ data, today, height = 260 }: { data: SCurveSeries; today: string; height?: number }) {
  const ticks = data.filter((p, i) => i === 0 || p.date.endsWith('-01')).map((p) => p.date)
  const inRange = data.some((p) => p.date === today)
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={VIZ.grid} vertical={false} />
          <XAxis dataKey="date" ticks={ticks} interval={0} tickFormatter={(d: string) => fmtDateShort(d)} tick={axisTick} axisLine={{ stroke: VIZ.axis }} tickLine={false} minTickGap={8} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tick={axisTick} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            cursor={{ stroke: VIZ.axis, strokeWidth: 1 }}
            content={(p) => {
              const { active, label, payload } = p as unknown as TipProps
              if (!active || !payload?.length) return null
              const rows: TipRow[] = []
              const planned = payload.find((x) => x.dataKey === 'planned')
              const actual = payload.find((x) => x.dataKey === 'actualLine')
              if (actual && typeof actual.value === 'number') rows.push({ key: 'a', label: 'Actual', value: fmtPct(actual.value), color: VIZ.series1 })
              if (planned && typeof planned.value === 'number') rows.push({ key: 'p', label: 'Planned', value: fmtPct(planned.value), color: VIZ.deEmphasis })
              return <TipBox title={fmtDate(String(label), { weekday: true })} rows={rows} />
            }}
          />
          {inRange && <ReferenceLine x={today} stroke={VIZ.axis} strokeWidth={1} label={{ value: 'Today', position: 'top', fontSize: 10, fill: VIZ.muted }} />}
          <Line type="monotone" dataKey="planned" stroke={VIZ.deEmphasis} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: VIZ.surface, strokeWidth: 2 }} isAnimationActive={false} connectNulls />
          <Area type="monotone" dataKey="actualArea" stroke="none" fill={VIZ.series1} fillOpacity={0.1} isAnimationActive={false} connectNulls={false} />
          <Line type="monotone" dataKey="actualLine" stroke={VIZ.series1} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: VIZ.surface, strokeWidth: 2 }} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-1 flex items-center gap-4 pl-8 text-xs text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: VIZ.series1 }} /> Actual
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: VIZ.deEmphasis }} /> Planned
        </span>
      </div>
    </div>
  )
}

export function ManpowerChart({ data, height = 150 }: { data: { date: string; manpower: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barCategoryGap={4}>
        <CartesianGrid stroke={VIZ.grid} vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(8)} tick={axisTick} axisLine={{ stroke: VIZ.axis }} tickLine={false} interval={1} />
        <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={40} />
        <Tooltip
          cursor={{ fill: VIZ.grid, fillOpacity: 0.5 }}
          content={(p) => {
            const { active, label, payload } = p as unknown as TipProps
            if (!active || !payload?.length) return null
            const v = payload[0]?.value
            return <TipBox title={fmtDate(String(label), { weekday: true })} rows={[{ key: 'm', label: 'workers on site', value: String(typeof v === 'number' ? v : 0), color: VIZ.series1 }]} />
          }}
        />
        <Bar dataKey="manpower" fill={VIZ.series1} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
