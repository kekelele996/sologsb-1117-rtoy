import { create } from 'zustand'
import type { DropPoint } from '@/types'
import { db, deleteRow, loadAll, putRow } from '@/hooks/usePersistentStore'
import { applyPointImpact, confirmPoint, type AffectedPoint } from '@/utils/schedule'

export interface DropPointState {
  rows: DropPoint[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (row: DropPoint) => Promise<void>
  remove: (id: string) => Promise<void>
  removeByOrchard: (orchardId: string) => Promise<void>
  /** 花期变更：把受影响且未开始的投放点转待确认并写入建议时间，已开始/完成的不动 */
  proposeForBloom: (affected: AffectedPoint[]) => Promise<void>
  /** 确认单个投放点的重排时间 */
  confirmSchedule: (id: string, proposed: { dropWindow: string; withdrawTime: string }) => Promise<void>
  /** 一键确认全部待确认投放点（按建议时间） */
  confirmAllPending: () => Promise<void>
}

export const droppointStore = create<DropPointState>((set, get) => ({
  rows: [],
  loaded: false,
  hydrate: async () => {
    const rows = await loadAll<DropPoint>(db.dropPoints)
    rows.sort((a, b) => a.code.localeCompare(b.code, 'zh-Hans-CN'))
    set({ rows, loaded: true })
  },
  save: async (row) => {
    await putRow<DropPoint>(db.dropPoints, row)
    await get().hydrate()
  },
  remove: async (id) => {
    await deleteRow<DropPoint>(db.dropPoints, id)
    await get().hydrate()
  },
  removeByOrchard: async (orchardId) => {
    const targets = get().rows.filter((row) => row.orchardId === orchardId)
    await Promise.all(targets.map((row) => deleteRow<DropPoint>(db.dropPoints, row.id)))
    await get().hydrate()
  },
  proposeForBloom: async (affected) => {
    const byId = new Map(applyPointImpact(affected).map((row) => [row.id, row]))
    const targets = get().rows.filter((row) => byId.has(row.id))
    await Promise.all(
      targets.map((row) => putRow<DropPoint>(db.dropPoints, byId.get(row.id) ?? row))
    )
    await get().hydrate()
  },
  confirmSchedule: async (id, proposed) => {
    const target = get().rows.find((row) => row.id === id)
    if (!target) return
    await putRow<DropPoint>(db.dropPoints, confirmPoint(target, proposed))
    await get().hydrate()
  },
  confirmAllPending: async () => {
    const targets = get().rows.filter((row) => row.scheduleStatus === '待确认')
    await Promise.all(
      targets.map((row) =>
        putRow<DropPoint>(
          db.dropPoints,
          confirmPoint(row, {
            dropWindow: row.proposedDropWindow ?? row.dropWindow,
            withdrawTime: row.proposedWithdrawTime ?? row.withdrawTime
          })
        )
      )
    )
    await get().hydrate()
  }
}))
