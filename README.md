# 蜜蜂授粉路线规划器（gbbeeroute）

面向果园托管服务队与蜂场技术员，把「果园地块 → 花期 → 蜂群投放点 → 转场路线」排成季内可执行的授粉安排，解决花期重叠时蜂群撞车、转场距离过远、投放点与地块不匹配的问题。**纯前端单页应用**，全部数据保存在浏览器 IndexedDB，不依赖任何后端服务或外部接口。

## 一、Docker 一键启动（推荐）

```bash
cp .env.example .env      # 首次启动先复制环境变量文件
docker compose up -d --build
```

启动后访问：<http://localhost:21817>

```bash
docker compose ps        # 查看容器状态
docker compose logs -f   # 查看日志
docker compose down      # 停止并移除容器（数据在浏览器本地）
```

`.env` 可调：

```
COMPOSE_PROJECT_NAME=gbbeeroute
FRONTEND_PORT=21817
VITE_AMAP_KEY=            # 可选，留空即自动降级为本地 SVG 网格视图
```

## 二、技术栈

| 层次 | 选型 |
| --- | --- |
| 框架 | React 18 |
| 语言 | TypeScript（`tsc --noEmit` 类型检查零错误） |
| UI 组件库 | Ant Design 5 |
| 地图 | 高德地图 JS API 2.0（可选，key 走 `VITE_AMAP_KEY`） |
| 状态管理 | Zustand |
| 路由 | React Router 6（nginx `try_files` 回落） |
| 构建 | Vite 5 |
| 本地存储 | IndexedDB（Dexie 封装，含 `schemaVersion` 与升级迁移） |
| 部署 | 多阶段 Dockerfile：`node:20-alpine` 构建 → `nginx:alpine` 托管 |

## 三、高德地图 Key 与降级策略

- 在 `.env` 里填写 `VITE_AMAP_KEY=<你的 key>` 后**重新构建**（`docker compose up -d --build`），地图将使用高德 JS API 渲染地块、投放点与转场折线；
- **未配置 key 或脚本加载失败时，`RouteMap` 自动降级为本地 SVG 网格视图**：按经纬度线性映射渲染地块、投放点与转场折线，支持点选拾取坐标；
- **构建与运行都不依赖该 key**：未配置 key 时不会注入任何外部脚本（避免无谓请求与报错），Docker 构建零网络依赖即可通过；
- 页面右上角始终显示当前数据源（高德地图 JS API / 本地 SVG 网格视图）。

## 四、本地开发

```bash
cd frontend
npm install
npm run dev        # http://localhost:21817
npm run build      # 类型检查 + 生产构建
```

## 五、目录结构

```
sologsb-1117/
├── docker-compose.yml          # 顶层 name: gbbeeroute，无 version 字段
├── .env.example                # COMPOSE_PROJECT_NAME / FRONTEND_PORT / VITE_AMAP_KEY
├── frontend/
│   ├── Dockerfile              # 多阶段构建，nginx 阶段 chmod -R a+rX 静态资源
│   ├── nginx.conf              # try_files 前端路由回落 + gzip
│   ├── public/favicon.svg
│   └── src/
│       ├── types/              # orchard.ts / colony.ts / droppoint.ts / route.ts / schedule.ts / index.ts
│       ├── stores/             # orchardStore / colonyStore / droppointStore / routeStore（Zustand）
│       ├── components/common/  # RouteMap / FlowerWindowBar / StatusTag / CoordPicker
│       ├── hooks/              # useAmap / usePersistentStore
│       ├── pages/              # SchedulePage / OrchardsPage / ColoniesPage / RoutesPage / ExportPage
│       ├── router/index.tsx
│       └── utils/              # geo.ts / schedule.ts / export.ts / id.ts
```

## 六、数据模型与存储

| 模型 | 说明 | Dexie 表 |
| --- | --- | --- |
| Orchard 果园地块 | 地块名、作物、面积、经纬度、盛花期起止、需蜂强度（箱/亩）、园主联系方式、可达性、历史授粉年份 | `orchards` |
| BeeColony 蜂群 | 群号、蜂种、群势（足框）、箱型、当前所在地块、状态（待投放/在园/转场中/回场）、最近检查日期、健康备注 | `colonies` |
| DropPoint 投放点 | 所属地块、坐标、编号、可容纳箱数、遮阴条件、水源距离、投放时间窗、撤场时间、责任人、安排群号、花期变更复核状态与建议时间 | `dropPoints` |
| TransitRoute 转场路线 | 出发/到达投放点、预计里程与耗时、车辆类型、出发时刻、风险备注、实际记录、花期变更复核状态与建议时刻 | `routes` |

- 数据库名 `gbbeeroute`，`meta` 表保存 `schemaVersion`；
- `version(2)` 升级迁移会为历史投放点补齐「可容纳箱数」（默认 8 箱）；
- `version(3)` 升级迁移为历史投放点 / 路线补齐「花期变更复核状态」（一律视为`已确认`）；
- 数据仅存于浏览器本地，容器无状态、不挂载命名卷。

## 七、主要页面

| 路由 | 功能 |
| --- | --- |
| `/` | 季内授粉安排总表：花期条带 + 已投放群体，冲突标红汇总；顶部展示花期变更待复核数量与可执行状态，可逐项重排建议时间并确认（或按建议全部确认），全部确认后总表才恢复可执行 |
| `/orchards` | 果园地块管理：面积与需蜂强度自动算建议箱数、可达性标记、花期重叠提示、投放点维护（含坐标拾取）；修改盛花期保存时弹出受影响投放点与转场路线清单 |
| `/colonies` | 蜂群台账：按群势与状态筛选，批量改状态、批量记录检查备注 |
| `/routes` | 转场路线规划：地图依次选点生成顺序与里程，拖动或上下移动调整顺序并实时重算，写回路线表；有待复核路线时暂停整表重排 |
| `/export` | 导出授粉安排清单 / 转场路线表（CSV）、全量 JSON 备份，并提供横向/纵向打印视图；CSV 与打印只带已确认的（新）时间，待确认项被排除并提示 |

## 八、计算约定

- 建议箱数 = ⌈面积(亩) × 需蜂强度(箱/亩)⌉，最少 1 箱；
- 转场里程按 Haversine 球面距离累计，耗时按平均 32 km/h + 0.25 h 装卸估算；
- 花期重叠：两地块盛花期区间交集天数 ≥ 1 即视为重叠；同一群号在重叠期内被排入两个地块 → 冲突。

## 九、花期变更复核约定

盛花期常临时提前或延后，系统按以下规则处理已排好的投放点与转场路线：

1. **保存即列影响**：在果园地块管理中修改盛花期并保存时，先弹出复核清单，逐项列出受影响投放点（原投放窗/撤场 → 建议）与转场路线（原出发时刻 → 建议），建议值按花期起止平移天数自动算出，确认后新花期才落库。
2. **未开始转待确认**：投放日当天 00:00 尚未到、或转场出发时刻尚未到（且实际记录仍为「待执行」）的安排，状态置为`待确认`并写入建议时间；正式时间在确认前不被改写。
3. **已开始/完成不动**：投放日已到、转场已到点或已回填实际记录的作业保留原计划时间，状态仍为`已确认`，不跟随新日期。
4. **逐项重排确认**：在「季内授粉安排总表」对待确认项逐项编辑建议时间并确认（也可「按建议全部确认」）；只要还有待确认项，总表顶部显示待复核数量并标记「不可执行」，路线页暂停整表重排；全部确认后总表恢复可执行。
5. **导出只带已确认**：授粉安排清单与转场路线表的 CSV、打印视图仅包含`已确认`项的（新）时间，并提示被排除的待确认数量；全量 JSON 备份保留待确认项与建议时间，便于留档。
