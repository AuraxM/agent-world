# Event batch loading design

## Problem

事件流和甘特图在事件数量多时加载/渲染卡顿，原因是当前一次性加载全部事件 (`GET /api/worlds/:id/events?since=0`)，无分页，导致 DOM 节点过多、首屏白屏时间长。

## Solution

按时间（tick 区间）分批加载，每批 40 ticks。

- **事件流**：滚动到底部时触发加载下一批（更早的 tick）
- **甘特图**：滚动到最右侧时触发加载下一批（更早的 tick）
- **事件流**：密度下拉菜单替换为按人筛选的多选下拉

---

## Backend

### API

`GET /api/worlds/:id/events?since=X&until=Y`

| Param | Required | Desc |
|-------|----------|------|
| `since` | yes | 区间下界（含），更早的 tick |
| `until` | no | 区间上界（含），不传则返回 since 后全部事件（向后兼容） |

### Repository

`findEventsInRange(worldId, since, until)` — 在现有 `gte(since)` 基础上追加 `lte(tick, until)`。

```ts
// backend/src/db/repository/events.ts
export function findEventsInRange(worldId: string, since: number, until: number): WorldEvent[] {
  return db.select().from(schema.eventsLog)
    .where(and(
      eq(schema.eventsLog.worldId, worldId),
      gte(schema.eventsLog.tick, since),
      lte(schema.eventsLog.tick, until),
    ))
    .orderBy(desc(schema.eventsLog.tick)).all()
    .map((r) => JSON.parse(r.payloadJson) as WorldEvent);
}
```

保留 `findEventsSince` 兼容其他调用方（snapshots 等），内部委托到 `findEventsInRange`。

---

## Frontend

### `use-world-state.ts` — 数据加载层

新增状态和方法：

```
events: WorldEvent[]           // 不变，累积已加载的所有事件
loadedSince: number | null     // 已加载区间的最小 tick
loadedUntil: number | null     // 已加载区间的最大 tick
hasMore: boolean               // 是否还有更早的事件
loadingMore: boolean           // 是否正在加载下一批
loadMore(): Promise<void>      // 加载 [loadedSince-40, loadedSince-1]
```

- `refresh()`: 初始加载 `[currentTick-39, currentTick]`（40 ticks），`hasMore = loadedSince > 0`
- `loadMore()`: 加载 `[loadedSince-40, loadedSince-1]`，追加到 `events` 末尾，更新 `loadedSince`

### `event-stream.tsx` — 事件流

**变更 1：用角色多选下拉替换密度下拉**

- 移除 `density` 状态和 `DENSITY_LIMITS` 常量
- 新增 props: `selectedCharIds: Set<string>`, `onToggleChar: (id: string) => void`
- 下拉样式参考项目现有暗色边框风格：
  - 折叠态显示 "角色 ▾ (已选 N)"
  - 展开态显示 checkbox 列表：每行 [勾选框 + 头像 + 名字]
  - 默认全选
- 筛选逻辑：先按选中角色过滤（`ev.participants` 包含任一选中角色，或事件出现在该角色所在地点），再按类型按钮过滤
- 移除 density 相关的 group 聚合逻辑（`DENSITY_LIMITS` / important/nonImportant 拆分），所有匹配事件直接展示

**变更 2：无限滚动**

- body 底部放置哨兵 `<div ref={sentinelRef}>`
- `IntersectionObserver` 监听哨兵，进入视口时调用 `onLoadMore()`
- `onLoadMore` prop 由父组件透传
- 加载中哨兵显示 "加载中…"
- `hasMore === false` 时隐藏哨兵

### `event-gantt.tsx` — 甘特图

**变更 1：初始窗口 40 tick**

- `DEFAULT_TICK_WINDOW` 或通过 props/常量覆写为 40

**变更 2：水平无限滚动**

- 监听 `cardsRef` 的 scroll 事件
- 触发条件：`scrollLeft + clientWidth >= scrollWidth - 200`
- 加载完成后保持滚动位置（不跳动）
- `hasMore === false` 时不再触发

**变更 3：窗口动态扩展**

- `startTick` 不再从 events 推算，改用 prop `loadedSince`
- 加载更多后 `startTick` 减小，tickColumns 增加，GanttRow 自动适配

**变更 4：加载指示器**

- 最右侧显示半透明加载指示器（仅 `loadingMore` 时可见）

### `world-view.tsx` — 父组件协调

- 透传 `hasMore`、`loadingMore`、`loadMore`、`selectedCharIds`、`onToggleChar` 给 EventStream 和 EventGantt
- 维护 `selectedCharIds: Set<string>`（初始全选，从 `snapshot.characters` 初始化）
- `onToggleChar` 切换选中/取消

---

## Data flow

```
refresh()
  → GET /events?since=currentTick-39&until=currentTick
  → setEvents(batch), loadedSince=currentTick-39, loadedUntil=currentTick

scroll to bottom/right
  → loadMore()
    → GET /events?since=loadedSince-40&until=loadedSince-1
    → setEvents([...events, ...newBatch])
    → loadedSince -= 40
    → hasMore = loadedSince > 0
```

---

## Files affected

| File | Change |
|------|--------|
| `backend/src/db/repository/events.ts` | 新增 `findEventsInRange` |
| `backend/src/systems/store.ts` | 新增 `loadEventsInRange` |
| `backend/src/server/routes/worlds.ts` | 路由支持 `until` 参数 |
| `frontend/src/hooks/use-world-state.ts` | 批式加载状态 + `loadMore` |
| `frontend/src/components/event-stream.tsx` | 去密度、加角色多选下拉、无限滚动 |
| `frontend/src/components/event-gantt.tsx` | 水平无限滚动、40 tick 初始窗口 |
| `frontend/src/components/world-view.tsx` | 透传新 props，管理角色多选状态 |
| `frontend/src/lib/gantt-utils.ts` | 可能需要导出新常量 |
