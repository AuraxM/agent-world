# 语言按地图包绑定 & 世界管理面板

## 摘要

将 LLM 输出语言从全局内存设置改为按"地图包"绑定，同时改造管理后台的世界重置 tab 为完整的"世界管理"面板。

## 动机

- 语言是地图包的内容属性，不是运行时偏好——一个日式温泉乡包用日文角色扮演，一个武侠世界包用中文，每个包的语言是固定的
- 当前全局语言设置放在控制面板，意味着切换地图/角色后需要手动改语言——概念错位
- 为 mod 化做准备：地图包应该是自包含、可分发的最小单元

## 设计

### 新目录结构

```
configs/maps/
├── yu-no-tani/              ← 一个地图包 = 一个 mod
│   ├── manifest.json        ← id, name, description, language
│   ├── map.json             ← 地图节点（纯节点定义）
│   └── characters/          ← 该地图包的角色
│       ├── char-tanimura-kinuyo.json
│       └── ...
```

### Manifest schema

```json
{
  "id": "yu-no-tani",
  "name": "汤之谷",
  "description": "深山幽谷间一座温泉观光乡…",
  "language": "zh"
}
```

- `id` — `z.string().min(1)`，必须等于所在目录名，否则校验失败（目录名是权威来源）
- `name` — `z.string().min(1)`
- `description` — `z.string().optional()`
- `language` — `z.enum(["zh", "en", "ja"])`，必填

### MapConfig / MapNodeConfig schema 调整

- `MapConfig` 去掉 `name` 和 `description` 字段（移到 manifest），仅保留 `id` 和 `nodes`；`id` 必须等于目录名
- `MapNodeConfig` 不变

### 新加载函数

| 函数 | 输入 | 输出 | 说明 |
|------|------|------|------|
| `listMapPackIds()` | — | `string[]` | 遍历 `configs/maps/*/` 目录名 |
| `loadManifest(id)` | mapId | `Manifest` | 读 + Zod 校验 `manifest.json` |
| `loadMap(id)` | mapId | `MapConfig` | 读 `map.json`（不变） |
| `loadCharactersForMap(id)` | mapId | `CharacterTemplate[]` | 读 `characters/*.json` |
| `validateMapPack(id)` | mapId | `PackValidation` | 汇总所有格式错误 |

### PackValidation 类型

```ts
interface PackValidation {
  id: string;
  name: string;
  description?: string;
  language: Language;
  valid: boolean;
  characterCount: number;
  nodeCount: number;
  errors: { file: string; message: string }[];
}
```

### 语言解析

- `loadManifest(world.mapId).language` → 包的语言
- 不存 DB，不存全局内存，每次决策时动态读盘（configs 文件量小，开销可忽略）
- `getLanguage()` 从 `src/engine/settings.ts` 移除
- LLM 调用链路改为接收 `mapId` 作为参数，内部调 `loadManifest(mapId).language`

### 移除的内容

- `src/engine/settings.ts` — `Language` 类型、`getLanguage()`、`setLanguage()`、`isSupportedLanguage()`、`SUPPORTED_LANGUAGES`
- `src/app/api/admin/settings/route.ts` — language 相关的 GET 字段和 POST body 处理
- `src/app/admin/page.tsx` — 语言选择下拉框及 language/languageLoading state

### Language 类型放置

从 `src/engine/settings.ts` 移到 `src/config/types.ts`，与 manifest 类型共存。

### 管理面板改造

**Tab 名**：「重置世界」→「世界管理」

**内容：**

- 顶部：当前运行世界状态卡片（名称、地图包、tick、角色数）
- 下方：地图包列表
  - 每个包展示：名称、描述、语言、角色数、节点数
  - 校验通过 → 绿色 ✓ + 「加载此包」按钮
  - 校验失败 → 红色 ✗ + 逐条错误列表，按钮禁用
- 点击「加载此包」→ 确认弹窗（"将清空当前世界并加载新地图包"）→ 调 API → 刷新

### 新 API

**`GET /api/admin/map-packs`**

```json
{
  "packs": [ PackValidation, ... ],
  "activeWorld": {
    "id": "world-xxx",
    "mapId": "yu-no-tani",
    "name": "汤之谷",
    "currentTick": 1234,
    "characterCount": 20
  } | null
}
```

**`POST /api/admin/worlds/load`**

Body:
```json
{
  "mapId": "yu-no-tani",
  "cast": ["char-tanimura-kinuyo", ...]
}
```
- `cast` 可选；不传则该包所有角色全部上场
- 行为：清空当前世界的所有数据（world / characters / events / memories，与现有 reset 语义一致） → seed 新世界 → 返回新世界信息
- 格式校验不通过时拒绝（400 + 错误列表）

### agent-world-config 技能改动

- 生成配置时**必须**先问用户指定语言（zh/en/ja），否则不继续
- 按新目录结构输出文件：
  - `configs/maps/<pack-id>/manifest.json`
  - `configs/maps/<pack-id>/map.json`
  - `configs/maps/<pack-id>/characters/<char-id>.json`
- 生成完毕自动运行校验脚本

### 迁移

一次性迁移，不保留向后兼容：

1. `configs/maps/yu-no-tani.json` → `configs/maps/yu-no-tani/map.json`
2. 新建 `configs/maps/yu-no-tani/manifest.json`（language: "zh"）
3. `configs/characters/*.json` → `configs/maps/yu-no-tani/characters/`
4. `src/config/loader.ts` 适配新目录结构
5. `src/config/loader.test.ts` 适配新目录结构
6. LLM 调用链改从 mapId 取语言
7. 管理面板改造 + 旧语言设置删除

## 风险 & 边界

- 迁移后 `configs/characters/` 根目录不存在，相关旧路径引用需全部更新
- 如果未来允许多地图包同时运行（跨地图旅行），需要重新考虑语言从哪里取——但当前单包单世界，无此问题
- 校验逻辑需要处理目录不存在、JSON 格式错误、Zod 校验失败等多种失败模式
