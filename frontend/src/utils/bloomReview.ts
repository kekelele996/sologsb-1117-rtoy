import dayjs from 'dayjs'
import type { DropPoint, Orchard, TransitRoute } from '@/types'
import { isLockedByExecution } from '@/types'

/** 日期型（YYYY-MM-DD）整体平移 */
export function shiftDate(date: string, deltaDays: number): string {
  if (!date) return date
  const value = dayjs(date, 'YYYY-MM-DD', true)
  if (!value.isValid()) return date
  return value.add(deltaDays, 'day').format('YYYY-MM-DD')
}

/** 日期时刻型（YYYY-MM-DDTHH:mm）整体平移，保留时刻 */
export function shiftDateTime(dateTime: string, deltaDays: number): string {
  if (!dateTime) return dateTime
  const value = dayjs(dateTime)
  if (!value.isValid()) return dateTime
  return value.add(deltaDays, 'day').format('YYYY-MM-DDTHH:mm')
}

/** 旧花期起止 → 新花期起止的天数变化（盛花期起 / 止分别计算） */
export function bloomShiftDays(
  oldStart: string,
  oldEnd: string,
  newStart: string,
  newEnd: string
): { startDelta: number; endDelta: number } {
  return {
    startDelta: dayjs(newStart).diff(dayjs(oldStart), 'day'),
    endDelta: dayjs(newEnd).diff(dayjs(oldEnd), 'day')
  }
}

export interface ProposedDropSchedule {
  proposedDropWindow: string
  proposedWithdrawTime: string
}

/**
 * 计算投放点随新花期重排后的建议时间：
 * 投放窗跟「盛花期起」平移，撤场跟「盛花期止」平移。
 * 已处于待确认的投放点，以记录中锚定的旧花期为基准再次平移，而不是从当前建议时间二次推算。
 */
export function proposeDropSchedule(
  point: Pick<DropPoint, 'dropWindow' | 'withdrawTime' | 'reviewStatus' | 'bloomAnchorStart' | 'bloomAnchorEnd'>,
  oldBloom: Pick<Orchard, 'bloomStart' | 'bloomEnd'>,
  newBloom: Pick<Orchard, 'bloomStart' | 'bloomEnd'>
): ProposedDropSchedule {
  const anchorStart = point.reviewStatus === '待确认' && point.bloomAnchorStart ? point.bloomAnchorStart : oldBloom.bloomStart
  const anchorEnd = point.reviewStatus === '待确认' && point.bloomAnchorEnd ? point.bloomAnchorEnd : oldBloom.bloomEnd
  const { startDelta, endDelta } = bloomShiftDays(anchorStart, anchorEnd, newBloom.bloomStart, newBloom.bloomEnd)
  return {
    proposedDropWindow: shiftDate(point.dropWindow, startDelta),
    proposedWithdrawTime: shiftDate(point.withdrawTime, endDelta)
  }
}

export interface ProposedRouteSchedule {
  proposedDepartAt: string
}

/**
 * 计算转场路线随新花期重排后的建议时刻：
 * 以出发投放点所属地块的盛花期起为锚整体平移；跨地块的转场只跟随出发端。
 */
export function proposeRouteSchedule(
  route: Pick<TransitRoute, 'departAt' | 'reviewStatus' | 'bloomAnchorStart'>,
  oldBloomStart: string,
  newBloomStart: string
): ProposedRouteSchedule {
  const anchorStart = route.reviewStatus === '待确认' && route.bloomAnchorStart ? route.bloomAnchorStart : oldBloomStart
  const delta = dayjs(newBloomStart).diff(dayjs(anchorStart), 'day')
  return { proposedDepartAt: shiftDateTime(route.departAt, delta) }
}

/** 花期是否真的发生变化 */
export function isBloomChanged(
  before: Pick<Orchard, 'bloomStart' | 'bloomEnd'>,
  after: Pick<Orchard, 'bloomStart' | 'bloomEnd'>
): boolean {
  return before.bloomStart !== after.bloomStart || before.bloomEnd !== after.bloomEnd
}

/** 未开始的作业才受花期变更影响；已开始 / 完成的作业锁定原计划时间 */
export function isAffectedDrop(point: DropPoint): boolean {
  return !isLockedByExecution(point.executionStatus)
}

export function isAffectedRoute(route: TransitRoute): boolean {
  return !isLockedByExecution(route.executionStatus)
}

/** 花期变化描述，如「盛花期起 +3 天、止 +1 天」 */
export function bloomChangeText(
  before: Pick<Orchard, 'bloomStart' | 'bloomEnd'>,
  after: Pick<Orchard, 'bloomStart' | 'bloomEnd'>
): string {
  const { startDelta, endDelta } = bloomShiftDays(before.bloomStart, before.bloomEnd, after.bloomStart, after.bloomEnd)
  const fmt = (value: number): string => (value > 0 ? `+${value} 天` : `${value} 天`)
  return `盛花期起 ${fmt(startDelta)}（${before.bloomStart} → ${after.bloomStart}），止 ${fmt(endDelta)}（${before.bloomEnd} → ${after.bloomEnd}）`
}
