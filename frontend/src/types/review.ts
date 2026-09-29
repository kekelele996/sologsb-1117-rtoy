/** 作业执行状态（投放点投放 / 转场路线出发） */
export const EXECUTION_STATUSES = ['未开始', '进行中', '已完成'] as const
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number]

/** 花期变更复核状态 */
export const REVIEW_STATUSES = ['待确认', '已确认'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

/** 已开始或完成的作业不随新花期改写，保持原计划时间 */
export function isLockedByExecution(status: ExecutionStatus): boolean {
  return status === '进行中' || status === '已完成'
}
