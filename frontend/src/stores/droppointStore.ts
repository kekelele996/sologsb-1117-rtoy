import { create } from 'zustand'
import type { DropPoint, ExecutionStatus, Orchard } from '@/types'
import { db, deleteRow, loadAll, putRow } from '@/hooks/usePersistentStore'
import { isAffectedDrop, proposeDropSchedule } from '@/utils/bloomReview'

export interface DropBloomChangeResult {
  /** 转入待确认的投放点（未开始，已生成建议新时间） */
  pending: DropPoint[]
  /** 已开始 / 完成、保留原计划时间的投放点 */
  locked: DropPoint[]
}

export interface DropProposalPatch {
  proposedDropWindow: string
  proposedWithdrawTime: string
}

export interface DropPointState {
  rows: DropPoint[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (row: DropPoint) => Promise<void>
  remove: (id: string) => Promise<void>
  removeByOrchard: (orchardId: string) => Promise<void>
  /**
   * 地块花期变更：把该地块下尚未开始的投放点转入「待确认」并给出建议新时间；
   * 已开始 / 完成的投放点保持原计划时间不变。
   */
  applyBloomChange: (
    orchardId: string,
    oldBloom: Pick<Orchard, 'bloomStart' | 'bloomEnd'>,
    newBloom: Pick<Orchard, 'bloomStart' | 'bloomEnd'>
  ) => Promise<DropBloomChangeResult>
  /** 逐项确认（可批量）：建议新时间写回计划时间，恢复为已确认 */
  confirmReview: (ids: string[]) => Promise<void>
  /** 保存技术员逐项重排后的建议时间（仍处于待确认） */
  saveProposal: (id: string, patch: DropProposalPatch) => Promise<void>
  /** 标记执行状态；一旦开始或完成，待确认随即解除并保留原计划时间 */
  setExecutionStatus: (id: string, status: ExecutionStatus) => Promise<void>
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
  applyBloomChange: async (orchardId, oldBloom, newBloom) => {
    const points = get().rows.filter((row) => row.orchardId === orchardId)
    const pending: DropPoint[] = []
    const locked: DropPoint[] = []
    await Promise.all(
      points.map(async (point) => {
        if (!isAffectedDrop(point)) {
          locked.push(point)
          return
        }
        const proposal = proposeDropSchedule(point, oldBloom, newBloom)
        const alreadyPending = point.reviewStatus === '待确认'
        const updated: DropPoint = {
          ...point,
          reviewStatus: '待确认',
          ...proposal,
          bloomAnchorStart: alreadyPending && point.bloomAnchorStart ? point.bloomAnchorStart : oldBloom.bloomStart,
          bloomAnchorEnd: alreadyPending && point.bloomAnchorEnd ? point.bloomAnchorEnd : oldBloom.bloomEnd
        }
        await putRow<DropPoint>(db.dropPoints, updated)
        pending.push(updated)
      })
    )
    pending.sort((a, b) => a.code.localeCompare(b.code, 'zh-Hans-CN'))
    await get().hydrate()
    return { pending, locked }
  },
  confirmReview: async (ids) => {
    const targets = get().rows.filter((row) => ids.includes(row.id) && row.reviewStatus === '待确认')
    await Promise.all(
      targets.map((row) =>
        putRow<DropPoint>(db.dropPoints, {
          ...row,
          dropWindow: row.proposedDropWindow || row.dropWindow,
          withdrawTime: row.proposedWithdrawTime || row.withdrawTime,
          reviewStatus: '已确认',
          proposedDropWindow: '',
          proposedWithdrawTime: '',
          bloomAnchorStart: '',
          bloomAnchorEnd: ''
        })
      )
    )
    await get().hydrate()
  },
  saveProposal: async (id, patch) => {
    const point = get().rows.find((row) => row.id === id)
    if (!point || point.reviewStatus !== '待确认') return
    await putRow<DropPoint>(db.dropPoints, { ...point, ...patch })
    await get().hydrate()
  },
  setExecutionStatus: async (id, status) => {
    const point = get().rows.find((row) => row.id === id)
    if (!point) return
    if (status === '未开始') {
      await putRow<DropPoint>(db.dropPoints, { ...point, executionStatus: status })
    } else {
      // 已开始 / 完成：解除待确认，沿用原计划时间，不套用任何建议新时间
      await putRow<DropPoint>(db.dropPoints, {
        ...point,
        executionStatus: status,
        reviewStatus: '已确认',
        proposedDropWindow: '',
        proposedWithdrawTime: '',
        bloomAnchorStart: '',
        bloomAnchorEnd: ''
      })
    }
    await get().hydrate()
  }
}))
