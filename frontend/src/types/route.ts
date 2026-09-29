import type { ExecutionStatus, ReviewStatus } from './review'

/** 车辆类型 */
export const VEHICLE_TYPES = ['厢式货车', '农用三轮', '皮卡', '人工搬运'] as const
export type VehicleType = (typeof VEHICLE_TYPES)[number]

/** TransitRoute 转场路线 */
export interface TransitRoute {
  id: string
  /** 出发投放点 */
  fromDropId: string
  /** 到达投放点 */
  toDropId: string
  /** 预计里程（km） */
  distanceKm: number
  /** 预计耗时（小时） */
  durationH: number
  vehicleType: VehicleType
  /** 转场日期时刻 */
  departAt: string
  /** 途中风险备注 */
  riskNote: string
  /** 实际转场记录 */
  actualNote: string
  /** 转场执行状态：已开始/完成的作业保留原计划时间，不随新花期改写 */
  executionStatus: ExecutionStatus
  /** 花期变更复核状态 */
  reviewStatus: ReviewStatus
  /** 待确认的建议转场时刻，确认后才写回 departAt */
  proposedDepartAt: string
  /** 重排建议时刻所锚定的出发投放点花期（空串表示按全局日期平移） */
  bloomAnchorStart: string
  bloomAnchorEnd: string
}
