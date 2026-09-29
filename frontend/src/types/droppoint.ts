import type { ScheduleStatus } from './schedule'

/** DropPoint 投放点 */
export interface DropPoint {
  id: string
  orchardId: string
  longitude: number
  latitude: number
  /** 编号，如 A-03 */
  code: string
  /** 可容纳箱数 */
  capacityBoxes: number
  /** 遮阴条件 */
  shade: string
  /** 水源距离（米） */
  waterDistance: number
  /** 投放时间窗（起）；待确认期间仍为已确认的原计划时间 */
  dropWindow: string
  /** 撤场时间；待确认期间仍为已确认的原计划时间 */
  withdrawTime: string
  /** 责任人 */
  owner: string
  /** 该投放点安排的群号（用于冲突判定） */
  colonyCodes: string[]
  /** 花期变更复核状态 */
  scheduleStatus?: ScheduleStatus
  /** 建议新投放时间窗（待确认时填写，确认后写回 dropWindow） */
  proposedDropWindow?: string
  /** 建议新撤场时间（待确认时填写，确认后写回 withdrawTime） */
  proposedWithdrawTime?: string
}
