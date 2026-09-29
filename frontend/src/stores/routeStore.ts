import { create } from 'zustand'
import type { DropPoint, ExecutionStatus, Orchard, TransitRoute } from '@/types'
import { db, deleteRow, loadAll, putRow } from '@/hooks/usePersistentStore'
import { distanceKm, estimateDurationH } from '@/utils/geo'
import { isAffectedRoute, proposeRouteSchedule } from '@/utils/bloomReview'

export interface RouteBloomChangeResult {
  /** 转入待确认的路线（未开始，已生成建议新时刻） */
  pending: TransitRoute[]
  /** 已开始 / 完成、保留原计划时刻的路线 */
  locked: TransitRoute[]
}

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
  /**
   * 地块花期变更：凡有一端在该地块、且尚未开始的路线转入「待确认」，
   * 并以出发投放点所属地块花期为锚给出建议新时刻；
   * 已开始 / 完成的路线保持原计划时刻不变。
   */
  applyBloomChange: (
    orchardId: string,
    oldBloom: Pick<Orchard, 'bloomStart' | 'bloomEnd'>,
    newBloom: Pick<Orchard, 'bloomStart' | 'bloomEnd'>
  ) => Promise<RouteBloomChangeResult>
  /** 逐项确认（可批量）：建议新时刻写回 departAt，恢复为已确认 */
  confirmReview: (ids: string[]) => Promise<void>
  /** 保存逐项重排后的建议时刻（仍处于待确认） */
  saveProposal: (id: string, proposedDepartAt: string) => Promise<void>
  /** 标记执行状态；一旦开始或完成，待确认随即解除并保留原计划时刻 */
  setExecutionStatus: (id: string, status: ExecutionStatus) => Promise<void>
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
        executionStatus: '未开始',
        reviewStatus: '已确认',
        proposedDepartAt: '',
        bloomAnchorStart: '',
        bloomAnchorEnd: ''
      })
    }
    await get().hydrate()
  },
  applyBloomChange: async (orchardId, oldBloom, newBloom) => {
    const points = await loadAll<DropPoint>(db.dropPoints)
    const orchardByDrop = new Map(points.map((point) => [point.id, point.orchardId]))
    const routes = get().rows.filter(
      (route) => orchardByDrop.get(route.fromDropId) === orchardId || orchardByDrop.get(route.toDropId) === orchardId
    )
    const pending: TransitRoute[] = []
    const locked: TransitRoute[] = []
    await Promise.all(
      routes.map(async (route) => {
        if (!isAffectedRoute(route)) {
          locked.push(route)
          return
        }
        // 任一端在本地块即随本地块盛花期起整体平移；已处于待确认的路线由建议时刻按锚点再平移
        const proposal = proposeRouteSchedule(route, oldBloom.bloomStart, newBloom.bloomStart)
        const alreadyPending = route.reviewStatus === '待确认'
        const updated: TransitRoute = {
          ...route,
          reviewStatus: '待确认',
          ...proposal,
          bloomAnchorStart: alreadyPending && route.bloomAnchorStart ? route.bloomAnchorStart : oldBloom.bloomStart,
          bloomAnchorEnd: ''
        }
        await putRow<TransitRoute>(db.routes, updated)
        pending.push(updated)
      })
    )
    pending.sort((a, b) => a.departAt.localeCompare(b.departAt))
    await get().hydrate()
    return { pending, locked }
  },
  confirmReview: async (ids) => {
    const targets = get().rows.filter((row) => ids.includes(row.id) && row.reviewStatus === '待确认')
    await Promise.all(
      targets.map((row) =>
        putRow<TransitRoute>(db.routes, {
          ...row,
          departAt: row.proposedDepartAt || row.departAt,
          reviewStatus: '已确认',
          proposedDepartAt: '',
          bloomAnchorStart: '',
          bloomAnchorEnd: ''
        })
      )
    )
    await get().hydrate()
  },
  saveProposal: async (id, proposedDepartAt) => {
    const route = get().rows.find((row) => row.id === id)
    if (!route || route.reviewStatus !== '待确认') return
    await putRow<TransitRoute>(db.routes, { ...route, proposedDepartAt })
    await get().hydrate()
  },
  setExecutionStatus: async (id, status) => {
    const route = get().rows.find((row) => row.id === id)
    if (!route) return
    if (status === '未开始') {
      await putRow<TransitRoute>(db.routes, { ...route, executionStatus: status })
    } else {
      // 已开始 / 完成：解除待确认，沿用原计划时刻，不套用任何建议新时刻
      await putRow<TransitRoute>(db.routes, {
        ...route,
        executionStatus: status,
        reviewStatus: '已确认',
        proposedDepartAt: '',
        bloomAnchorStart: '',
        bloomAnchorEnd: ''
      })
    }
    await get().hydrate()
  }
}))
