import type { ScheduleStatus } from './schedule'

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
  /** 转场日期时刻；待确认期间仍为已确认的原计划时刻 */
  departAt: string
  /** 途中风险备注 */
  riskNote: string
  /** 实际转场记录（已回填即视为作业已开始/完成） */
  actualNote: string
  /** 花期变更复核状态 */
  scheduleStatus?: ScheduleStatus
  /** 建议新出发时刻（待确认时填写，确认后写回 departAt） */
  proposedDepartAt?: string
}
