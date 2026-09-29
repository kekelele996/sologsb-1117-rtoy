import { create } from 'zustand'
import type { TransitRoute } from '@/types'
import { db, deleteRow, loadAll, putRow } from '@/hooks/usePersistentStore'
import { distanceKm, estimateDurationH } from '@/utils/geo'
import { applyRouteImpact, confirmRoute, type AffectedRoute } from '@/utils/schedule'

export interface RouteState {
  rows: TransitRoute[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (row: TransitRoute) => Promise<void>
  remove: (id: string) => Promise<void>
  /** 按选点顺序重排并重算里程 / 耗时，生成连续转场段 */
  rebuildFromOrder: (
    orderedDropIds: string[],
    meta: { vehicleType: TransitRoute['vehicleType']; departAt: string; riskNote: string }
  ) => Promise<void>
  /** 花期变更：把受影响且未开始的路线转待确认并写入建议时刻，已开始/完成的不动 */
  proposeForBloom: (affected: AffectedRoute[]) => Promise<void>
  /** 确认单段路线的重排时刻 */
  confirmSchedule: (id: string, proposedDepartAt: string) => Promise<void>
  /** 一键确认全部待确认路线（按建议时刻） */
  confirmAllPending: () => Promise<void>
}

export const routeStore = create<RouteState>((set, get) => ({
  rows: [],
  loaded: false,
  hydrate: async () => {
    const rows = await loadAll<TransitRoute>(db.routes)
    rows.sort((a, b) => a.departAt.localeCompare(b.departAt))
    set({ rows, loaded: true })
  },
  save: async (row) => {
    await putRow<TransitRoute>(db.routes, row)
    await get().hydrate()
  },
  remove: async (id) => {
    await deleteRow<TransitRoute>(db.routes, id)
    await get().hydrate()
  },
  rebuildFromOrder: async (orderedDropIds, meta) => {
    const existing = await loadAll<TransitRoute>(db.routes)
    await Promise.all(existing.map((row) => deleteRow<TransitRoute>(db.routes, row.id)))
    const points = await loadAll<{ id: string; longitude: number; latitude: number }>(db.dropPoints)
    const lookup = new Map(points.map((item) => [item.id, item]))
    for (let i = 1; i < orderedDropIds.length; i += 1) {
      const from = lookup.get(orderedDropIds[i - 1])
      const to = lookup.get(orderedDropIds[i])
      if (!from || !to) continue
      const km = distanceKm(from, to)
      await putRow<TransitRoute>(db.routes, {
        id: `rt_${Date.now().toString(36)}_${i}`,
        fromDropId: from.id,
        toDropId: to.id,
        distanceKm: km,
        durationH: estimateDurationH(km),
        vehicleType: meta.vehicleType,
        departAt: meta.departAt,
        riskNote: meta.riskNote,
        actualNote: '待执行',
        scheduleStatus: '已确认'
      })
    }
    await get().hydrate()
  },
  proposeForBloom: async (affected) => {
    const byId = new Map(applyRouteImpact(affected).map((row) => [row.id, row]))
    const targets = get().rows.filter((row) => byId.has(row.id))
    await Promise.all(targets.map((row) => putRow<TransitRoute>(db.routes, byId.get(row.id) ?? row)))
    await get().hydrate()
  },
  confirmSchedule: async (id, proposedDepartAt) => {
    const target = get().rows.find((row) => row.id === id)
    if (!target) return
    await putRow<TransitRoute>(db.routes, confirmRoute(target, proposedDepartAt))
    await get().hydrate()
  },
  confirmAllPending: async () => {
    const targets = get().rows.filter((row) => row.scheduleStatus === '待确认')
    await Promise.all(
      targets.map((row) => putRow<TransitRoute>(db.routes, confirmRoute(row, row.proposedDepartAt ?? row.departAt)))
    )
    await get().hydrate()
  }
}))
