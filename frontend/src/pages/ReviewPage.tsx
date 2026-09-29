import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, DatePicker, Row, Select, Space, Table, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import type { DropPoint, TransitRoute } from '@/types'
import { EXECUTION_STATUSES, isLockedByExecution } from '@/types'
import { usePersistentStore } from '@/hooks/usePersistentStore'
import { orchardStore } from '@/stores/orchardStore'
import { droppointStore } from '@/stores/droppointStore'
import { routeStore } from '@/stores/routeStore'

/**
 * 花期变更复核：保存新花期后，尚未开始的投放点与转场路线统一转入「待确认」。
 * 技术员逐项重排建议时间并确认后，季内授粉安排总表才恢复可执行；
 * 已开始 / 完成的作业在底部列出，保留原计划时间，不随新日期改写。
 */
export default function ReviewPage(): JSX.Element {
  const navigate = useNavigate()
  const orchards = usePersistentStore(orchardStore, (state) => state.rows)
  const dropPoints = usePersistentStore(droppointStore, (state) => state.rows)
  const routes = usePersistentStore(routeStore, (state) => state.rows)

  const [selectedDrops, setSelectedDrops] = useState<string[]>([])
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([])

  const pendingDrops = useMemo(() => dropPoints.filter((item) => item.reviewStatus === '待确认'), [dropPoints])
  const pendingRoutes = useMemo(() => routes.filter((item) => item.reviewStatus === '待确认'), [routes])

  const lockedDrops = useMemo(() => dropPoints.filter((item) => isLockedByExecution(item.executionStatus)), [dropPoints])
  const lockedRoutes = useMemo(() => routes.filter((item) => isLockedByExecution(item.executionStatus)), [routes])

  const pendingCount = pendingDrops.length + pendingRoutes.length

  function orchardName(orchardId: string): string {
    return orchards.find((item) => item.id === orchardId)?.name ?? '未知地块'
  }

  function pointOf(id: string): DropPoint | undefined {
    return dropPoints.find((item) => item.id === id)
  }

  async function saveDropProposal(point: DropPoint, field: 'proposedDropWindow' | 'proposedWithdrawTime', value: dayjs.Dayjs | null): Promise<void> {
    if (!value) return
    await droppointStore.getState().saveProposal(point.id, {
      proposedDropWindow: field === 'proposedDropWindow' ? value.format('YYYY-MM-DD') : point.proposedDropWindow,
      proposedWithdrawTime: field === 'proposedWithdrawTime' ? value.format('YYYY-MM-DD') : point.proposedWithdrawTime
    })
  }

  async function saveRouteProposal(route: TransitRoute, value: dayjs.Dayjs | null): Promise<void> {
    if (!value) return
    await routeStore.getState().saveProposal(route.id, value.format('YYYY-MM-DDTHH:mm'))
  }

  async function confirmDrops(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await droppointStore.getState().confirmReview(ids)
    message.success(`已确认 ${ids.length} 个投放点的新时间`)
    setSelectedDrops((prev) => prev.filter((id) => !ids.includes(id)))
  }

  async function confirmRoutes(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await routeStore.getState().confirmReview(ids)
    message.success(`已确认 ${ids.length} 段转场路线的新时刻`)
    setSelectedRoutes((prev) => prev.filter((id) => !ids.includes(id)))
  }

  async function confirmAll(): Promise<void> {
    await droppointStore.getState().confirmReview(pendingDrops.map((item) => item.id))
    await routeStore.getState().confirmReview(pendingRoutes.map((item) => item.id))
    message.success('全部待复核项已确认，总表恢复可执行')
    setSelectedDrops([])
    setSelectedRoutes([])
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">花期变更复核</h2>
          <p className="page-sub">
            盛花期临时调整后，尚未开始的投放点与转场路线统一转入「待确认」；逐项调整建议新时间并确认后，总表才恢复可执行。已开始或完成的作业保留原计划时间。
          </p>
        </div>
        <Space>
          <Button onClick={() => navigate('/')}>返回总表</Button>
          <Button type="primary" disabled={pendingCount === 0} onClick={() => void confirmAll()}>
            全部确认（{pendingCount}）
          </Button>
        </Space>
      </div>

      {pendingCount > 0 ? (
        <Alert
          type="warning"
          showIcon
          message={`总表暂不可执行：还有 ${pendingCount} 项安排待复核（投放点 ${pendingDrops.length}、转场路线 ${pendingRoutes.length}）`}
          description="系统按新花期给出了建议新时间（原计划时间 → 建议新时间），可逐项修改后确认；确认后新时间才写回计划，导出也只带已确认的新时间。"
        />
      ) : (
        <Alert
          type="success"
          showIcon
          message="没有待复核的安排，季内授粉安排总表处于可执行状态"
          description="今后修改地块盛花期时，受影响且尚未开始的投放点与转场路线会自动进入本页等待确认。"
        />
      )}

      <Card
        size="small"
        title={`待确认投放点（${pendingDrops.length}）`}
        extra={
          <Button size="small" disabled={selectedDrops.length === 0} onClick={() => void confirmDrops(selectedDrops)}>
            确认所选（{selectedDrops.length}）
          </Button>
        }
      >
        <Table<DropPoint>
          dataSource={pendingDrops}
          rowKey="id"
          size="small"
          pagination={false}
          rowSelection={{ selectedRowKeys: selectedDrops, onChange: (keys) => setSelectedDrops(keys as string[]) }}
          locale={{ emptyText: '无待确认投放点' }}
          columns={[
            { title: '编号', dataIndex: 'code', key: 'code', width: 80 },
            {
              title: '地块',
              key: 'orchard',
              width: 130,
              render: (_, record) => orchardName(record.orchardId)
            },
            {
              title: '原投放窗',
              dataIndex: 'dropWindow',
              key: 'oldDrop',
              width: 120,
              render: (value: string) => <Typography.Text delete type="secondary">{value}</Typography.Text>
            },
            {
              title: '建议投放窗（可改）',
              key: 'proposedDrop',
              width: 170,
              render: (_, record) => (
                <DatePicker
                  size="small"
                  value={record.proposedDropWindow ? dayjs(record.proposedDropWindow) : null}
                  onChange={(value) => void saveDropProposal(record, 'proposedDropWindow', value)}
                  allowClear={false}
                />
              )
            },
            {
              title: '原撤场',
              dataIndex: 'withdrawTime',
              key: 'oldWithdraw',
              width: 120,
              render: (value: string) => <Typography.Text delete type="secondary">{value}</Typography.Text>
            },
            {
              title: '建议撤场（可改）',
              key: 'proposedWithdraw',
              width: 170,
              render: (_, record) => (
                <DatePicker
                  size="small"
                  value={record.proposedWithdrawTime ? dayjs(record.proposedWithdrawTime) : null}
                  onChange={(value) => void saveDropProposal(record, 'proposedWithdrawTime', value)}
                  allowClear={false}
                />
              )
            },
            {
              title: '执行状态',
              dataIndex: 'executionStatus',
              key: 'exec',
              width: 130,
              render: (status: DropPoint['executionStatus']) => <Tag>{status}</Tag>
            },
            {
              title: '操作',
              key: 'action',
              width: 150,
              render: (_, record) => (
                <Space size={4}>
                  <Button size="small" type="link" onClick={() => void confirmDrops([record.id])}>
                    确认新时间
                  </Button>
                  <SelectExecution
                    value={record.executionStatus}
                    onChange={(status) => void droppointStore.getState().setExecutionStatus(record.id, status)}
                  />
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Card
        size="small"
        title={`待确认转场路线（${pendingRoutes.length}）`}
        extra={
          <Button size="small" disabled={selectedRoutes.length === 0} onClick={() => void confirmRoutes(selectedRoutes)}>
            确认所选（{selectedRoutes.length}）
          </Button>
        }
      >
        <Table<TransitRoute>
          dataSource={pendingRoutes}
          rowKey="id"
          size="small"
          pagination={false}
          rowSelection={{ selectedRowKeys: selectedRoutes, onChange: (keys) => setSelectedRoutes(keys as string[]) }}
          locale={{ emptyText: '无待确认路线' }}
          columns={[
            {
              title: '出发',
              key: 'from',
              render: (_, record) => {
                const point = pointOf(record.fromDropId)
                return point ? `${point.code}（${orchardName(point.orchardId)}）` : '—'
              }
            },
            {
              title: '到达',
              key: 'to',
              render: (_, record) => {
                const point = pointOf(record.toDropId)
                return point ? `${point.code}（${orchardName(point.orchardId)}）` : '—'
              }
            },
            {
              title: '原出发时刻',
              dataIndex: 'departAt',
              key: 'oldDepart',
              width: 160,
              render: (value: string) => <Typography.Text delete type="secondary">{value.replace('T', ' ')}</Typography.Text>
            },
            {
              title: '建议出发时刻（可改）',
              key: 'proposedDepart',
              width: 210,
              render: (_, record) => (
                <DatePicker
                  size="small"
                  showTime={{ minuteStep: 10 }}
                  format="YYYY-MM-DD HH:mm"
                  value={record.proposedDepartAt ? dayjs(record.proposedDepartAt) : null}
                  onChange={(value) => void saveRouteProposal(record, value)}
                  allowClear={false}
                />
              )
            },
            {
              title: '执行状态',
              dataIndex: 'executionStatus',
              key: 'exec',
              width: 120,
              render: (status: TransitRoute['executionStatus']) => <Tag>{status}</Tag>
            },
            {
              title: '操作',
              key: 'action',
              width: 150,
              render: (_, record) => (
                <Space size={4}>
                  <Button size="small" type="link" onClick={() => void confirmRoutes([record.id])}>
                    确认新时刻
                  </Button>
                  <SelectExecution
                    value={record.executionStatus}
                    onChange={(status) => void routeStore.getState().setExecutionStatus(record.id, status)}
                  />
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Row gutter={16}>
        <Col xs={24} xl={12}>
          <Card size="small" title={`已开始 / 完成的投放点（${lockedDrops.length}，保留原计划时间）`}>
            <Table<DropPoint>
              dataSource={lockedDrops}
              rowKey="id"
              size="small"
              pagination={false}
              locale={{ emptyText: '无锁定作业' }}
              columns={[
                { title: '编号', dataIndex: 'code', key: 'code', width: 80 },
                { title: '地块', key: 'orchard', render: (_, record) => orchardName(record.orchardId) },
                { title: '投放窗', dataIndex: 'dropWindow', key: 'drop', width: 110 },
                { title: '撤场', dataIndex: 'withdrawTime', key: 'withdraw', width: 110 },
                {
                  title: '状态',
                  dataIndex: 'executionStatus',
                  key: 'status',
                  width: 90,
                  render: (status: DropPoint['executionStatus']) => <Tag color={status === '已完成' ? 'blue' : 'gold'}>{status}</Tag>
                }
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title={`已开始 / 完成的转场路线（${lockedRoutes.length}，保留原计划时刻）`}>
            <Table<TransitRoute>
              dataSource={lockedRoutes}
              rowKey="id"
              size="small"
              pagination={false}
              locale={{ emptyText: '无锁定作业' }}
              columns={[
                {
                  title: '路线',
                  key: 'leg',
                  render: (_, record) => {
                    const from = pointOf(record.fromDropId)
                    const to = pointOf(record.toDropId)
                    return `${from?.code ?? '—'} → ${to?.code ?? '—'}`
                  }
                },
                {
                  title: '出发时刻',
                  dataIndex: 'departAt',
                  key: 'depart',
                  width: 150,
                  render: (value: string) => value.replace('T', ' ')
                },
                {
                  title: '状态',
                  dataIndex: 'executionStatus',
                  key: 'status',
                  width: 90,
                  render: (status: TransitRoute['executionStatus']) => <Tag color={status === '已完成' ? 'blue' : 'gold'}>{status}</Tag>
                }
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

/** 执行状态切换：标记为进行中 / 已完成后该作业即锁定，不再跟随花期改写 */
function SelectExecution({
  value,
  onChange
}: {
  value: DropPoint['executionStatus']
  onChange: (status: DropPoint['executionStatus']) => void
}): JSX.Element {
  return (
    <Select
      size="small"
      style={{ width: 92 }}
      value={value}
      onChange={onChange}
      options={EXECUTION_STATUSES.map((status) => ({ value: status, label: status }))}
    />
  )
}
