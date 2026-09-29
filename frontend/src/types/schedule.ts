/** 排程复核状态：花期变更后，尚未开始的安排先转「待确认」，逐项重排确认后回到「已确认」 */
export const SCHEDULE_STATUSES = ['已确认', '待确认'] as const
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number]
