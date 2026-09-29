import type { ExecutionStatus, ReviewStatus } from './review'

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
  /** 投放时间窗（起） */
  dropWindow: string
  /** 撤场时间 */
  withdrawTime: string
  /** 责任人 */
  owner: string
  /** 该投放点安排的群号（用于冲突判定） */
  colonyCodes: string[]
  /** 投放执行状态：已开始/完成的作业保留原计划时间，不随新花期改写 */
  executionStatus: ExecutionStatus
  /** 花期变更复核状态：保存新花期后，未开始的安排转为「待确认」 */
  reviewStatus: ReviewStatus
  /** 待确认的建议投放时间窗（起），确认后才写回 dropWindow */
  proposedDropWindow: string
  /** 待确认的建议撤场时间 */
  proposedWithdrawTime: string
  /** 最近一次因哪个地块花期变更进入待确认（用于锚定重排基准） */
  bloomAnchorStart: string
  bloomAnchorEnd: string
}
