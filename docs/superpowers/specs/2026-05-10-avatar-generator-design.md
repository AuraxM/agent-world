# 8×8 像素风角色头像随机生成器

## 目标

为 agent-world 角色生成 MC 风格的 8×8 像素头像，存储为 data URI 写入 `characters.avatar`，替换当前的 emoji 方案。

## 架构 & 数据流

```
createWorld()
  ├─ 每个角色: avatarGenerator() → PNG → base64 data URI
  ├─ 写入 character.avatar
  └─ 前端: characterEmoji() 检测 data URI → <img> 渲染
```

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/systems/avatar.ts` | **新增** | 像素生成 + PNG 编码，零依赖 |
| `backend/src/systems/createWorld.ts` | 修改 | 创建角色后调用 avatarGenerator |
| `backend/src/db/repository/characters.ts` | 修改 | updateCharacter 补上 avatar 字段 |
| `frontend/src/lib/sprite.ts` | 修改 | characterEmoji 兼容 data URI |
| `frontend/src/components/profile-pane.tsx` | 修改 | 头像由 emoji 文字改为 `<img>` |
| `frontend/src/components/relation-graph.tsx` | 修改 | canvas 渲染兼容 data URI 头像 |
| `frontend/src/components/tree-sidebar.tsx` | 修改 | 头像兼容 data URI |

## 生成算法

```
avatarGenerator()
  ├─ 调色板随机
  │  肤色: 4     #f5d5b0, #e4c090, #c49a6c, #8d6e4c
  │  发色基色: 6 #3a1c0a, #d4a040, #e8e8e8, #c04040, #202020, #5040a0
  │  发色高光: 基色 +20% 亮度
  │  发色阴影: 基色 -30% 亮度
  │  眼白:     #f0f0f0
  │  瞳色: 6   #304888, #387030, #886030, #803838, #606060, #684888
  │  嘴色:     略深于肤色
  ├─ 构建 8×8 RGBA 网格
  │  规则见下文
  └─ 斑驳: 头发区每像素 30% 概率替换为高光/阴影
```

## 8×8 网格规则

```
  0 1 2 3 4 5 6 7
0 · H H H H H H ·    · = 透明 (切角)
1 H H H H H H H H
2 H H H H H H H H    H = 头发 (斑驳 3 色调)
3 H W W H H W W H    W = 眼白
4 H W P S S P W H    P = 瞳孔
5 S W P S S P W S    S = 肤色
6 S S S S S S S S
7 S S S M M S S S    M = 嘴

切角: (0,0) (7,0) 透明
头发: row 0-3 + col 0,7 row 4 (鬓角)
眼睛: 左(1-2,3-5) 右(5-6,3-5), 2×3, 瞳孔在下两行
嘴:   (3-4,7)
其余: 肤色
```

## PNG 编码

零依赖，使用 Node.js 内置 `zlib.deflateSync`。

```
256 bytes raw RGBA
  → zlib.deflateSync()
  → IDAT chunk
  → 拼接: 8B签名 + IHDR(25B) + IDAT + IEND(12B)
  → base64
  → "data:image/png;base64,..."
```

## 前端渲染

`characterEmoji()` 增强逻辑：

1. `avatar` 以 `data:image/` 开头 → `<img src={avatar}>` 渲染
2. `avatar` 为 emoji/空 → 走现有兜底链

`relation-graph.tsx` canvas 渲染：
- 检查是否 data URI → 用 `Image()` 加载后在 canvas 绘制
- 否则 → 现有 emoji fillText 方式

调整 `profile-pane.tsx` 头像素大小从 36px 适当扩大（像素图需要更大尺寸才能看清）。

## 测试

`backend/src/systems/avatar.test.ts`：
- 调色板随机取样覆盖所有肤色/发色/瞳色
- 输出为合法 data URI
- PNG 解码后为 RGBA 8×8
- 切角像素 alpha=0
- 眼睛区域非肤色色值
- 多次生成结果因斑驳应有差异
