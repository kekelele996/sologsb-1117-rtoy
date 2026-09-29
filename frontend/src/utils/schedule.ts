import dayjs from 'dayjs'
import type { DropPoint, Orchard, TransitRoute } from '@/types'
import type { ScheduleStatus } from '@/types/schedule'

/** 已确认状态（历史数据缺字段时也按已确认处理） */
export function scheduleStatusOf(item: { scheduleStatus?: ScheduleStatus }): ScheduleStatus {
  return item.scheduleStatus ?? '已确认'
}

export function isPending(item: { scheduleStatus?: ScheduleStatus }): boolean {
  return scheduleStatusOf(item) === '待确认'
}

/** 投放作业是否已经开始：投放日当天 00:00 已到即视为开始（当天作业不再改期） */
export function isDropStarted(point: Pick<DropPoint, 'dropWindow'>, now: Date = new Date()): boolean {
  const windowStart = dayjs(`${point.dropWindow}T00:00:00`)
  if (!windowStart.isValid()) return false
  return !windowStart.isAfter(dayjs(now))
}

/** 转场作业是否已经开始：计划出发时刻已到，或已回填实际记录（非「待执行」） */
export function isRouteStarted(route: Pick<TransitRoute, 'departAt' | 'actualNote'>, now: Date = new Date()): boolean {
  if (route.actualNote.trim() && route.actualNote.trim() !== '待执行') return true
  const depart = dayjs(route.departAt)
  if (!depart.isValid()) return false
  return !depart.isAfter(dayjs(now))
}

/** 两个日期（YYYY-MM-DD）相差天数：new - old */
export function shiftDays(oldDate: string, newDate: string): number {
  return dayjs(newDate).diff(dayjs(oldDate), 'day')
}

/** 按天数平移日期（YYYY-MM-DD） */
export function shiftDate(date: string, days: number): string {
  return dayjs(date).add(days, 'day').format('YYYY-MM-DD')
}

/** 按天数平移日期时刻（YYYY-MM-DDTHH:mm） */
export function shiftDateTime(value: string, days: number): string {
  const parsed = dayjs(value)
  if (!parsed.isValid()) return value
  return parsed.add(days, 'day').format('YYYY-MM-DDTHH:mm')
}

/** 平移天数文案，如 +3 天 / -2 天 / 0 天 */
export function shiftText(days: number): string {
  if (days > 0) return `+${days} 天`
  if (days < 0) return `${days} 天`
  return '0 天'
}

export interface AffectedPoint {
  point: DropPoint
  started: boolean
  proposedDropWindow: string
  proposedWithdrawTime: string
  startShift: number
  endShift: number
}

export interface AffectedRoute {
  route: TransitRoute
  started: boolean
  proposedDepartAt: string
  shift: number
}

export interface BloomImpact {
  orchardId: string
  startShift: number
  endShift: number
  points: AffectedPoint[]
  routes: AffectedRoute[]
  /** 待确认项总数（仅未开始的作业） */
  pendingCount: number
}

/** 路线是否挂在该地块：出发或到达投放点属于该地块 */
function routeTouchesOrchard(route: TransitRoute, pointOf: Map<string, DropPoint>, orchardId: string): boolean {
  const from = pointOf.get(route.fromDropId)
  const to = pointOf.get(route.toDropId)
  return from?.orchardId === orchardId || to?.orchardId === orchardId
}

/**
 * 花期变更影响分析。
 * - 投放点：投放窗按盛花期起平移，撤场按盛花期止平移；
 * - 转场路线：进/出该地块的段，按「到达投放点」所属地块取平移天数
 *   （到达点也在本地块时即本地块平移量，否则为驶出段取出发地块平移量）；
 * - 已开始/完成的作业列出但不动，只有未开始的才进入待确认。
 */
export function buildBloomImpact(
  oldOrchard: Pick<Orchard, 'id' | 'bloomStart' | 'bloomEnd'>,
  nextOrchard: Pick<Orchard, 'bloomStart' | 'bloomEnd'>,
  dropPoints: DropPoint[],
  routes: TransitRoute[],
  now: Date = new Date()
): BloomImpact {
  const startShift = shiftDays(oldOrchard.bloomStart, nextOrchard.bloomStart)
  const endShift = shiftDays(oldOrchard.bloomEnd, nextOrchard.bloomEnd)
  const pointOf = new Map(dropPoints.map((point) => [point.id, point]))

  const points: AffectedPoint[] = dropPoints
    .filter((point) => point.orchardId === oldOrchard.id)
    .map((point) => {
      const started = isDropStarted(point, now)
      return {
        point,
        started,
        proposedDropWindow: shiftDate(point.dropWindow, startShift),
        proposedWithdrawTime: shiftDate(point.withdrawTime, endShift),
        startShift,
        endShift
      }
    })

  const relatedRoutes = routes.filter((route) => routeTouchesOrchard(route, pointOf, oldOrchard.id))
  const routeShifts = new Map<string, number>()
  relatedRoutes.forEach((route) => {
    const to = pointOf.get(route.toDropId)
    const from = pointOf.get(route.fromDropId)
    // 默认按到达地块平移；纯驶出段（到达点不在本地块）按出发地块平移
    const shift = to?.orchardId === oldOrchard.id ? startShift : from?.orchardId === oldOrchard.id ? startShift : 0
    routeShifts.set(route.id, shift)
  })

  const routeItems: AffectedRoute[] = relatedRoutes.map((route) => {
    const shift = routeShifts.get(route.id) ?? 0
    return {
      route,
      started: isRouteStarted(route, now),
      proposedDepartAt: shiftDateTime(route.departAt, shift),
      shift
    }
  })

  const pendingCount =
    points.filter((item) => !item.started).length + routeItems.filter((item) => !item.started).length

  return { orchardId: oldOrchard.id, startShift, endShift, points, routes: routeItems, pendingCount }
}

/** 把影响分析落到投放点：未开始的转待确认并写入建议时间，已开始/完成的原样保留 */
export function applyPointImpact(points: AffectedPoint[]): DropPoint[] {
  return points.map(({ point, started, proposedDropWindow, proposedWithdrawTime }) => {
    if (started) return point
    return {
      ...point,
      scheduleStatus: '待确认' satisfies ScheduleStatus,
      proposedDropWindow,
      proposedWithdrawTime
    }
  })
}

/** 把影响分析落到路线：未开始的转待确认并写入建议时刻，已开始/完成的原样保留 */
export function applyRouteImpact(items: AffectedRoute[]): TransitRoute[] {
  return items.map(({ route, started, proposedDepartAt }) => {
    if (started) return route
    return {
      ...route,
      scheduleStatus: '待确认' satisfies ScheduleStatus,
      proposedDepartAt
    }
  })
}

/** 确认投放点重排：把建议时间写回正式时间并清回已确认 */
export function confirmPoint(
  point: DropPoint,
  proposed: { dropWindow: string; withdrawTime: string }
): DropPoint {
  return {
    ...point,
    dropWindow: proposed.dropWindow,
    withdrawTime: proposed.withdrawTime,
    proposedDropWindow: undefined,
    proposedWithdrawTime: undefined,
    scheduleStatus: '已确认' satisfies ScheduleStatus
  }
}

/** 确认路线重排：把建议时刻写回正式时刻并清回已确认 */
export function confirmRoute(route: TransitRoute, proposedDepartAt: string): TransitRoute {
  return {
    ...route,
    departAt: proposedDepartAt,
    proposedDepartAt: undefined,
    scheduleStatus: '已确认' satisfies ScheduleStatus
  }
}

/** 待确认总数（投放点 + 路线） */
export function pendingTotal(dropPoints: DropPoint[], routes: TransitRoute[]): number {
  return dropPoints.filter(isPending).length + routes.filter(isPending).length
}
