import type { SCurvePoint } from '@shared/types'

/** Prepares S-curve points for the chart: splits actual into a line + area key. */
export function toSCurveSeries(points: SCurvePoint[]) {
  return points.map((p) => ({ date: p.date, planned: p.planned, actualLine: p.actual, actualArea: p.actual }))
}

export type SCurveSeries = ReturnType<typeof toSCurveSeries>
