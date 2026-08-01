# 生图工坊 Phase 2 接入计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 1 异步文生图后端之上，先补齐 NewAPI 登录用户到异步生图 API 的桥接层，再开始迁移生图工坊前端。

**Architecture:** Phase 1 的 `/v1/images/generations?async=true` 仍作为底层 relay/计费入口，继续使用 API token、Distribute 和 OpenAIImage relay。Phase 2A 新增 `/api/image-workshop/*` 登录态桥接接口，让前端用 NewAPI session 调用，不把 API key 暴露给浏览器。Phase 2B 补齐参数、模型能力、任务历史和短期清理契约。Phase 2C 前端只依赖桥接层和签名图片 URL，不依赖本地文件路径或 Authorization header 展示图片。

**Tech Stack:** Go + Gin + GORM + NewAPI existing TokenAuth/UserAuth/Distribute/Relay, React frontend in existing NewAPI web app, local disk result storage.

**当前 rc20 迁移状态：** `feature/image-workshop-rc20-migration` 已基于最新 `main@402ffdea` 迁移 Phase 2B 后端契约和 Phase 2C 原生前端。旧的 rc8 图工坊分支只作为实现参考，不再直接部署或合入主线。

---

## 当前状态

当前整体进度：

- Phase 1 异步生图后端 MVP：已完成并集成。
- Phase 2A 登录态桥接层：已完成并集成。
- Phase 2B 后端契约、模型能力和短期任务历史：已完成并集成。
- Phase 2C NewAPI 原生前端工坊 MVP：已完成 rc20 迁移和本地容器验收；当前主要剩余真实 Key / 渠道端到端验收。
- Phase 3A 分辨率档位与差异计费底座：已完成请求档位判定、固定价格模式倍率、实际输出尺寸审计字段、前端预计档位提示，以及模型级 1K/2K/4K 独立按次价格配置；多模型适配仍待后续拆分。

Phase 1 后端分支：

```text
/Users/superdavid/Downloads/中转站/new-api/.worktrees/image-async-backend
```

当前分支：

```text
feature/image-async-backend
```

关键提交：

```text
9ec3a2a0 实现异步文生图后端 MVP
8757425c 加固异步生图后端安全策略
```

已完成能力：

- `POST /v1/images/generations?async=true|1|yes|on`
- `GET /v1/images/tasks/:task_id`
- `GET /v1/images/tasks/:task_id/files/:file_id`
- 同步 `POST /v1/images/generations` 仍走原同步图片 relay。
- worker 执行前重新经过 `TokenAuth + Distribute + Relay(OpenAIImage)`。
- `b64_json` 结果落本地磁盘，并在任务结果中改写为短期签名 URL。
- 签名图片 URL 可直接用于前端 `<img src>`，不需要 Authorization header。
- 旧的 Authorization 文件访问仍保留，主要用于 API/调试。
- 单实例恢复策略：超时 queued/running image task 标记 failed，不重放旧任务。

已独立验证：

```bash
docker run --rm -v "$PWD":/app -v new-api-go125-mod:/go/pkg/mod -v new-api-go125-build:/root/.cache/go-build -w /app golang:1.25.1 sh -lc '/usr/local/go/bin/go test -count=1 ./model ./service ./controller ./router'
```

结果：

```text
ok github.com/QuantumNous/new-api/model
ok github.com/QuantumNous/new-api/service
ok github.com/QuantumNous/new-api/controller
ok github.com/QuantumNous/new-api/router
```

最小 smoke 已确认：

- 异步提交返回 `202` 和 `task_id`。
- 轮询从 `running` 到 `completed`。
- 返回的图片 URL 包含 `expires` 和 `signature`。
- 不带 Authorization 访问签名 URL 返回 `200 image/png`。

## 为什么下一步不是直接做前端

Phase 1 的底层接口属于 `/v1` relay API，需要 API token：

```http
Authorization: Bearer sk-...
```

但 NewAPI 的生图工坊页面属于登录态前端，用户已经通过 session 登录。直接让页面保存或拼接 API key 会带来三个问题：

- UX 别扭：用户进工坊后还要手动填 API key。
- 安全边界变差：API key 进入浏览器状态、localStorage 或请求日志后更容易泄漏。
- 后续难维护：前端会被迫理解 `/v1` TokenAuth、owner token、任务权限、签名 URL 等底层细节。

因此 Phase 2A 要先做一个登录态桥接层。桥接层只接收用户 session 和 `token_id`，token key 只在服务端读取并用于复用现有 relay 链路。

## Phase 2A：登录态桥接层

### 实施状态（已完成，feature/image-workshop-bridge）

Phase 2A 已在独立 worktree/分支中实现：

```text
/Users/superdavid/Downloads/中转站/new-api/.worktrees/image-workshop-bridge
feature/image-workshop-bridge
```

新增登录态 API：

```http
GET /api/image-workshop/tokens
POST /api/image-workshop/generations
GET /api/image-workshop/tasks/:task_id
```

关键决策：

- `/api/image-workshop/*` 挂在 `middleware.UserAuth()` 下，前端只使用登录态 session。
- `GET /api/image-workshop/tokens` 只返回当前用户自己的 token 元数据和 masked key，不返回真实 token key。
- `POST /api/image-workshop/generations` 接收 `token_id`，服务端校验该 token 属于当前用户，然后在真实 Gin handler chain 中补入 `Authorization` 并继续执行 relay 中间件。
- bridge 提交会经过 `SystemPerformanceCheck + TokenAuth + ModelRequestRateLimit + Distribute`，因此 token 状态、过期、额度、模型限制、分组、渠道选择、模型请求限流和计费入口仍复用 Phase 1/现有 relay 链路。
- 转发到底层异步入队逻辑前会移除 `token_id`，并强制 `response_format` 为 `b64_json`，保证结果落盘和签名 URL 链路稳定。
- `GET /api/image-workshop/tasks/:task_id` 只按当前登录用户查询 image task，不要求前端再提供 API key；返回 Phase 1 已生成的签名图片 URL，不暴露本地文件路径。

最新完成记录：

```text
1b56f26f 修正生图工坊桥接接口中间件链路
```

本次提交确认 `/api/image-workshop/generations` 使用真实 Gin route chain，不再在 controller 内手动调用 `TokenAuth()(relayCtx)` 或 `Distribute()(relayCtx)`，也删除了内部 `httptest` relay context。当前 middleware 顺序为：

```text
UserAuth
-> PrepareImageWorkshopGeneration
-> SystemPerformanceCheck
-> TokenAuth
-> ModelRequestRateLimit
-> Distribute
-> CreateImageWorkshopGeneration
```

本次修改文件：

- `controller/image_workshop.go`
- `controller/image_workshop_test.go`
- `controller/image_async_test.go`
- `router/api-router.go`
- `docs/image-workshop-phase2-plan.md`

已覆盖的自动化测试行为：

- bridge submit 成功路径使用真实 Gin route chain。
- `ModelRequestRateLimit` 生效：连续提交第二次返回 `429`，且不会创建第二个 task。
- 拒绝使用其他用户的 `token_id`。
- 禁用 token 经过 `TokenAuth` 后被拒绝。
- `token_id` 不进入 task data。
- 真实 token key 不进入 task data。
- `response_format` 被强制为 `b64_json`。

已验证：

```bash
docker run --rm -v "$PWD":/app -v new-api-go125-mod:/go/pkg/mod -v new-api-go125-build:/root/.cache/go-build -w /app golang:1.25.1 sh -lc '/usr/local/go/bin/go test -count=1 ./model ./service ./controller ./router'
```

结果：

```text
./model ./service ./controller ./router 全部 ok
```

未做浏览器 smoke test。本次属于 bridge middleware 链路小修，核心行为已由 route-level 自动化测试覆盖。

遗留风险：

- 中间件拒绝时仍沿用对应 middleware 自己的响应格式，例如 rate limit 返回 `429`，不一定包装成 bridge `success/message/data` 风格响应。

### 目标接口

新增登录态 API 组：

```text
/api/image-workshop
```

建议接口：

```http
GET /api/image-workshop/tokens
POST /api/image-workshop/generations
GET /api/image-workshop/tasks/:task_id
```

### 接口契约

#### GET /api/image-workshop/tokens

用途：给前端列出当前用户可选的 token。只返回 masked key 和必要元数据，不返回真实 key。

响应建议：

```json
{
  "success": true,
  "message": "",
  "data": [
    {
      "id": 123,
      "name": "default",
      "key": "sk-********",
      "group": "default",
      "status": 1,
      "expired_time": -1,
      "remain_quota": 100000,
      "unlimited_quota": false,
      "model_limits_enabled": false,
      "model_limits": ""
    }
  ]
}
```

实现原则：

- 只查询 `c.GetInt("id")` 对应用户的 token。
- 不返回真实 token key。
- 不在这里做复杂模型可用性判断，提交时仍以 `TokenAuth + Distribute` 的结果为准。

#### POST /api/image-workshop/generations

用途：登录态前端提交异步文生图任务。

请求建议：

```json
{
  "token_id": 123,
  "model": "gpt-image-1",
  "prompt": "a clean product photo of a ceramic cup",
  "n": 1,
  "size": "1024x1024",
  "quality": "auto",
  "response_format": "b64_json"
}
```

响应建议：

```json
{
  "success": true,
  "message": "",
  "data": {
    "task_id": "task_xxx",
    "status": "queued"
  }
}
```

实现原则：

- `token_id` 必须属于当前登录用户。
- 服务端读取 token key 后，内部复用现有异步提交逻辑。
- 不把 token key 返回给前端。
- 必须继续经过 `TokenAuth + Distribute`，不要绕过模型权限、额度、分组和渠道选择。
- 请求体转发到底层 `/v1/images/generations?async=true` 时不要携带 `token_id`。
- 如果 token 被禁用、过期、额度不足、模型无权限，返回登录态 API 风格错误，同时不要创建成功任务。
- 默认强制或补齐 `response_format: "b64_json"`，保证本地结果存储和签名 URL 链路可用。

#### GET /api/image-workshop/tasks/:task_id

用途：登录态前端轮询任务。

响应建议：

```json
{
  "success": true,
  "message": "",
  "data": {
    "task_id": "task_xxx",
    "status": "completed",
    "result": {
      "created": 1783074236,
      "data": [
        {
          "url": "/v1/images/tasks/task_xxx/files/imgfile_0_xxx?expires=1783076036&signature=..."
        }
      ]
    }
  }
}
```

实现原则：

- 只允许查询当前登录用户自己的 image task。
- 登录态轮询不需要当前用户再次提供原 token。
- 返回的 `result.data[].url` 必须是 Phase 1 已生成的签名 URL。
- 不返回本地文件路径。

### 建议文件

创建：

```text
controller/image_workshop.go
controller/image_workshop_test.go
```

修改：

```text
router/api-router.go
controller/image_async.go
controller/image_async_test.go
service/image_async_task.go
service/image_async_task_test.go
docs/image-workshop-phase2-plan.md
```

可能需要的职责划分：

- `controller/image_workshop.go`
  - 登录态 bridge handlers。
  - token 列表响应。
  - 登录态提交和轮询响应包装。

- `controller/image_async.go`
  - 将当前 `SubmitAsyncImageGeneration` 中可复用的提交逻辑抽成内部 helper。
  - `/v1` 仍返回 OpenAI 风格响应，`/api/image-workshop` 返回 NewAPI `success/message/data` 风格响应。

- `service/image_async_task.go`
  - 保留 `GetOwnedImageTask` 给 `/v1` token 轮询使用。
  - 新增 `GetUserImageTask(userID int, taskID string)` 给登录态 bridge 使用，只校验 user 和 image platform。

- `router/api-router.go`
  - 在 `/api` 下新增 `imageWorkshopRoute := apiRouter.Group("/image-workshop")`。
  - 该 group 使用 `middleware.UserAuth()`。

### 实现步骤

- [x] **Step 1：创建独立 worktree/分支**

如果继续在现有 Phase 1 分支上做：

```bash
cd /Users/superdavid/Downloads/中转站/new-api/.worktrees/image-async-backend
git status --short --branch
```

如果要保持 Phase 2A 独立分支，基于 Phase 1 创建：

```bash
cd /Users/superdavid/Downloads/中转站/new-api
git worktree add .worktrees/image-workshop-bridge -b feature/image-workshop-bridge feature/image-async-backend
```

推荐使用独立分支：

```text
feature/image-workshop-bridge
```

- [x] **Step 2：补 service 测试**

在 `service/image_async_task_test.go` 增加测试：

```go
func TestGetUserImageTaskAllowsSameUserRegardlessToken(t *testing.T) {
    // Arrange: user 1 has image task with PrivateData.TokenId = 11.
    // Assert: GetUserImageTask(1, taskID) returns exists=true.
    // Assert: GetUserImageTask(2, taskID) returns exists=false.
    // Assert: non-image platform returns exists=false.
}
```

期望：

```bash
go test ./service -run TestGetUserImageTaskAllowsSameUserRegardlessToken -count=1
```

先失败，因为 `GetUserImageTask` 尚未实现。

- [x] **Step 3：实现 GetUserImageTask**

在 `service/image_async_task.go` 增加：

```go
func GetUserImageTask(userID int, taskID string) (*model.Task, bool, error) {
    task, exists, err := model.GetByTaskId(userID, taskID)
    if err != nil || !exists {
        return task, exists, err
    }
    if !IsImageAsyncTask(task) {
        return nil, false, nil
    }
    return task, true, nil
}
```

然后运行：

```bash
go test ./service -run TestGetUserImageTaskAllowsSameUserRegardlessToken -count=1
```

- [x] **Step 4：抽出异步提交 helper**

在 `controller/image_async.go` 中把 `SubmitAsyncImageGeneration` 的核心逻辑抽成可复用 helper。目标是让：

- `/v1/images/generations?async=true` 继续返回当前 OpenAI 风格 `202 {"data": ...}`。
- `/api/image-workshop/generations` 可以复用同一段入队逻辑，但包装成 NewAPI API 风格。

建议内部返回结构：

```go
type imageAsyncSubmitResult struct {
    TaskID string `json:"task_id"`
    Status string `json:"status"`
}
```

建议 helper 形态：

```go
func submitAsyncImageGeneration(c *gin.Context) (imageAsyncSubmitResult, int, error) {
    // 复用当前 SubmitAsyncImageGeneration 的 body 读取、request validate、
    // GenRelayInfo、task.Insert、imageAsyncTaskRunner 逻辑。
}
```

`SubmitAsyncImageGeneration` 只负责把 helper 结果写成原有响应：

```go
func SubmitAsyncImageGeneration(c *gin.Context) {
    result, status, err := submitAsyncImageGeneration(c)
    if err != nil {
        c.JSON(status, gin.H{"error": gin.H{"message": err.Error(), "type": "invalid_request_error"}})
        return
    }
    c.JSON(http.StatusAccepted, gin.H{"data": result})
}
```

注意：

- 错误类型可以先保持最小实现，但测试必须覆盖 bad request 和 forbidden/unauthorized 场景。
- 不要改变同步 `/v1/images/generations` 行为。

- [x] **Step 5：创建 bridge controller 测试**

在 `controller/image_workshop_test.go` 增加测试：

```go
func TestImageWorkshopGenerationsRequiresOwnedToken(t *testing.T) {
    // user 1 使用 user 2 的 token_id 提交，应返回失败，不应创建 image task。
}

func TestImageWorkshopGenerationsQueuesTaskWithOwnedToken(t *testing.T) {
    // user 1 使用自己的 token_id 提交，内部经过 TokenAuth + Distribute 后创建 queued image task。
    // 断言 task.UserId == user 1。
    // 断言 task.PrivateData.TokenId == token_id。
    // 断言 task.Data.Request.Body 不包含 token_id。
}

func TestImageWorkshopPollTaskRequiresOwner(t *testing.T) {
    // user 1 可以轮询自己的 task。
    // user 2 轮询同 task 返回 404 或 success=false。
}
```

先运行并确认失败：

```bash
go test ./controller -run 'TestImageWorkshop' -count=1
```

- [x] **Step 6：实现 controller/image_workshop.go**

实现：

```go
func ListImageWorkshopTokens(c *gin.Context)
func CreateImageWorkshopGeneration(c *gin.Context)
func PollImageWorkshopTask(c *gin.Context)
```

关键要求：

- 使用 `c.GetInt("id")` 作为登录用户 ID。
- `token_id` 通过 `model.GetTokenByIds(tokenID, userID)` 校验归属。
- 读取 token 后，在当前 request context 内设置 `Authorization: Bearer sk-<token.Key>`，再走 `middleware.TokenAuth()` 和 `middleware.Distribute()`。
- 保留原始客户端 IP，不要用新的 `httptest` context 伪造请求，避免 token IP 限制失真。
- 转给底层异步提交前，从 body 中移除 `token_id`。
- 输出使用 `common.ApiSuccess` / `common.ApiError` 风格。

- [x] **Step 7：注册路由**

在 `router/api-router.go` 增加：

```go
imageWorkshopRoute := apiRouter.Group("/image-workshop")
imageWorkshopRoute.Use(middleware.UserAuth())
{
    imageWorkshopRoute.GET("/tokens", controller.ListImageWorkshopTokens)
    imageWorkshopRoute.POST("/generations", controller.CreateImageWorkshopGeneration)
    imageWorkshopRoute.GET("/tasks/:task_id", controller.PollImageWorkshopTask)
}
```

运行：

```bash
go test ./router -count=1
```

- [x] **Step 8：跑后端相关测试**

```bash
go test -count=1 ./model ./service ./controller ./router
```

如果本机没有 Go：

```bash
docker run --rm -v "$PWD":/app -v new-api-go125-mod:/go/pkg/mod -v new-api-go125-build:/root/.cache/go-build -w /app golang:1.25.1 sh -lc '/usr/local/go/bin/go test -count=1 ./model ./service ./controller ./router'
```

- [ ] **Step 9：做 bridge smoke（未执行，核心行为已由真实 Gin route chain 自动化测试覆盖）**

使用本地 Docker 环境时，保持原 NewAPI：

```text
http://127.0.0.1:3000
```

继续使用生图测试容器：

```text
http://127.0.0.1:3001
```

需要用浏览器登录态或测试 session 调用 `/api/image-workshop/*`：

- `GET /api/image-workshop/tokens` 返回当前用户 token 列表。
- `POST /api/image-workshop/generations` 返回 `task_id`。
- `GET /api/image-workshop/tasks/:task_id` 从 queued/running 到 completed。
- completed 结果里的签名 URL 可直接 `<img src>` 访问。
- user 2 无法查询 user 1 的 task。
- user 1 无法使用 user 2 的 token_id 提交。

- [x] **Step 10：更新文档并提交**

更新：

```text
docs/image-async-backend-phase1.md
docs/image-workshop-phase2-plan.md
```

提交：

```bash
git status --short
git add controller/image_workshop.go controller/image_workshop_test.go controller/image_async.go controller/image_async_test.go service/image_async_task.go service/image_async_task_test.go router/api-router.go docs/image-async-backend-phase1.md docs/image-workshop-phase2-plan.md
git commit -m "新增生图工坊登录态桥接接口"
```

## Phase 2B：后端契约与短期任务历史

实施分支：

```text
feature/image-workshop-api-contract
```

新增接口：

```http
GET /api/image-workshop/options?token_id=:token_id
GET /api/image-workshop/tasks?page=1&page_size=20
DELETE /api/image-workshop/tasks
```

已实现：

- 按当前用户、token 分组和 token 模型限制返回可用图片模型及参数能力。
- 提交请求使用严格字段白名单，校验 `model`、`prompt`、`n`、`size`、`quality` 和 `output_format`。
- 强制 `response_format=b64_json`，将客户端传入的审核值覆盖为 `moderation=auto`。
- worker 在实际渠道分配后保留官方 OpenAI 的 `moderation=auto`，对其他兼容上游删除该字段。
- 用户任务历史只返回当前用户的 `platform=image` 任务，不暴露渠道、token 和本地路径。
- 临时文件未过期时动态重新签名；文件过期或丢失时返回 `result_available=false`。
- 支持按当前用户的任务 ID 批量删除，以及按 3 天前、7 天前或全部历史范围删除；只删除已完成或失败的图片任务，保留 queued/running 任务。
- 任务记录默认保留 24 小时、全局最多 100 条，只清理已完成或已失败任务。
- 服务启动时执行一次维护，之后默认每 10 分钟执行，提交任务时仍会触发一次非阻塞维护。

## Phase 2C：前端工坊 MVP

Phase 2B 已完成并集成验收，Phase 2C 已按以下范围完成。

已完成的前端 MVP 范围：

- 生图工坊页面入口。
- token 选择器。
- 模型选择器。
- prompt 输入。
- `n`、`size`、`quality` 等基础参数。
- 提交异步任务。
- 轮询任务状态。
- 用签名 URL 展示图片。
- 下载图片。
- 失败状态展示。

前端约束：

- 不保存真实 API key。
- 不直接访问本地文件路径。
- 不假设 `<img>` 可以带 Authorization header。
- 不做 Agent 模式、图工坊内多 provider / 自定义 provider 配置、About 和版本检查；图工坊只消费 NewAPI 后端返回的 Key、模型和能力。
- 不建设云端永久作品库，继续使用“服务器短期中转 + 当前浏览器 IndexedDB 副本”的存储逻辑。
- 当前已支持 `gpt-image-2` 参考图生图；图片局部重绘和多实例任务恢复仍不在当前范围内。
- UI 可以参考 `CookSleep/gpt_image_playground 0.6.1`，但不要不加筛选地整包搬入。

### 图片参数契约

审核强度不作为图工坊用户可配置项。后续前后端开发统一按以下规则处理：

- 前端不展示审核选项，也不提交用户可控的 `moderation` 字段。
- `/api/image-workshop/generations` 在服务端将审核强度规范化为 `moderation: "auto"`，不接受客户端通过绕过 UI 提交 `low`。
- 转发到明确支持 `moderation` 的 Images/Responses 上游时发送 `auto`。
- 上游不支持该字段时，由对应适配器删除 `moderation`，避免因未知字段导致请求失败。
- 自动化测试至少覆盖客户端提交 `low` 时被覆盖为 `auto`，以及不支持该字段的适配器不会向上游发送它。

这样做是因为 `low` 不是关闭审核，且兼容上游可能忽略该字段。将它暴露给普通用户会产生“设置必然生效”的错误预期，同时增加前端和渠道适配复杂度。

### 图片与作品存储决策

确认采用 Lingqu 的核心存储逻辑：服务端只承担异步任务和图片的短期中转，用户画廊中的本机图片副本保存在浏览器 IndexedDB。不为首版增加对象存储、CDN、独立 Redis 服务或其他付费基础设施。

服务端逻辑：

- 任务状态继续保存在 NewAPI 现有 task 体系中，不照搬 Lingqu 的 Redis 实现。
- 任务最长保留 24 小时，全局最多保留最近 100 条 `platform=image` 任务；超限时优先清理已完成或已失败任务。保留时间和数量上限做成可配置项。
- 上游返回的 `b64_json` 写入 NewAPI 本地临时目录，任务结果只返回受控签名 URL，不在数据库中长期保存大段 base64。
- 图片文件使用独立 TTL；继续使用现有默认 6 小时、最大 24 小时的策略，并允许部署时根据磁盘大小调低。
- 文件清理同时受 TTL、缓存总容量和磁盘最低剩余空间约束；超限时优先删除最旧图片。
- 已补强为“服务启动时执行一次 + 后台定时执行”，提交任务时仍保留一次非阻塞维护。
- 任务查询和历史列表在临时文件未过期时重新生成签名 URL，不复用已过期的签名。

浏览器逻辑：

- 任务完成后，前端立即通过签名 URL 获取图片 `Blob`，并保存到当前 NewAPI 域名下的 IndexedDB。
- IndexedDB 同时保存必要的任务元数据，作品列表优先读取本机 `Blob`，服务器文件过期后不影响已成功写入本机的图片。
- 本地数据必须按 NewAPI 用户 ID 分区，不允许同一浏览器中不同账号相互看到本机作品。
- 不使用 `localStorage` 或普通 HTTP 缓存保存图片本体。
- 保留单图下载；批量 ZIP 导出和 SHA-256 去重可以在本机画廊稳定后追加。

用户体验边界：

- IndexedDB 只属于当前设备、当前浏览器和当前域名，不提供跨设备同步。
- 用户清理站点数据、使用无痕模式或浏览器因存储压力淘汰数据时，本机作品可能丢失。
- “我的作品”要区分服务器临时可用、仅本机可用和已过期三种状态，不将本机缓存表述为永久云端作品库。
- 服务器与本机都无图片时，保留原提示词和参数，允许用户重新生成。

建议分支：

```text
feature/image-workshop-frontend
```

### Phase 2C 实施状态（已完成并迁移至 feature/image-workshop-rc20-migration）

已完成 NewAPI default 前端的原生图工坊 MVP，不使用 iframe，也没有引入独立子应用外壳。

页面与交互：

- 新增 `/image-workshop` 创建页和 `/image-workshop/library` 灵感库二级页，并接入现有 NewAPI 顶栏、宽侧栏、管理员侧栏开关和用户侧栏开关。
- 创建页沿用已确认的 gpt2api `CreateStudioPage` 上下结构；桌面端提示词区与参数区实测高度为 `170:113`，约等于 `60:40`。
- 提示词输入框会随内容自动增高，最高增至 360px 后再在输入框内部滚动；移动端初始高度收紧为 120px。
- 保留图片/视频切换外观；图片为当前可用模式，点击视频只提示“视频功能暂未开放”，不创建空白或伪视频工作流。
- Key 选择器位于创建区标题行，使用“Key 名称-分组名称-脱敏 Key”展示；参数区固定为尺寸、质量、格式、透明背景和数量，模型选择保留在提交按钮左侧。尺寸不再使用普通下拉框，而是使用与 Lingqu 当前实现一致的“自动 / 按比例 / 自定义宽高”选择面板。
- 参数下拉框统一使用图工坊自定义选择控件，补齐无可用 Key、无可用模型、能力加载失败和重新加载状态，避免原生下拉框样式不一致或出现空选项。
- 参数只根据 `/api/image-workshop/options` 返回的真实能力启用；审核选项不展示，透明背景在后端未声明支持时显示为不可操作的“关闭”，不向请求中伪造无效字段。
- `gpt-image-2` 的参数能力按模型声明，不再要求渠道地址必须是 `api.openai.com`。OpenAI 兼容中转开放 `auto`、1K / 2K / 4K 三档尺寸、`1:1`、`3:2`、`2:3`、`16:9`、`9:16`、`4:3`、`3:4`、`21:9` 八种预设比例、自定义比例和自定义宽高，同时保留 `auto/low/medium/high` 质量、`png/jpeg/webp` 格式和最多 6 张输出。
- 上游高并发别名 `gpt-image-2L` 明确复用 `gpt-image-2` 的图工坊参数能力，不再因自定义上游地址退回仅支持 `auto` 和单张的保守模式；请求、渠道路由和计费仍保留 `gpt-image-2L` 原名，允许管理员单独配置高并发路线价格。
- 临时兼容 `Nano-Banana-*` 模型名：该前台模型名复用 `gpt-image-2` 的完整图工坊参数能力；渠道模型映射应配置为 `Nano-Banana-2 -> gpt-image-banana-2` 等上游名称。模型名识别仅按 `Nano-Banana-` 前缀开放，不影响其他 Gemini 模型。
- `gpt-image-2` 自定义尺寸沿用 Lingqu 的规整边界：宽高为 16 的倍数，最大边长 3840px，宽高比不超过 3:1，总像素限制为 655,360 到 8,294,400。前端先展示规整后的最终尺寸，服务端再次执行同样的规整和校验，最终只向上游发送规范化后的 `widthxheight`。
- 尺寸选择面板固定外框高度，模式内容在独立区域内滚动，避免在“自动 / 按比例 / 自定义宽高”之间切换时窗口跳动；选中状态使用浅灰背景和柔和边框，并保留 1K、1:1 卡片左侧描边的安全边距。
- 每次从“自动”或“自定义宽高”进入“按比例”时，默认选择 `1:1` 并同步更新预览尺寸；用户已经选择其他比例后，切换 1K、2K、4K 只重新计算尺寸，不重置用户比例。
- 当前已补充分辨率计费底座：后端按实际发送的 `size` 推导预计上游档位，`auto` 或缺少尺寸时按 2K 保守处理；管理员可以在模型“按次”定价中开启“按分辨率计费”并分别设置 1K、2K、4K 单价。开启后直接使用对应档位单价，关闭或未配置时回退到 1K=`1.0`、2K=`1.5`、4K=`2.0` 的默认倍率；token usage 模式不叠加档位倍率，避免上游 usage 已体现分辨率时重复计费。
- 预览接口和任务记录会返回请求档位、计费策略、独立单价或回退倍率，以及落盘图片实际宽高。实际宽高只用于质量审计，不作为扣费依据；上游返回尺寸缺失或被降级时，仍按已发送请求档位结算。
- 前端尺寸面板会显示“预计计费档位”，用于提示部分比例的最大边可能跨入更高上游档位；这不会改变当前已经验证过的生图尺寸映射。
- 提交后通过 `/api/image-workshop/tasks` 轮询真实任务状态；生成中卡片复用已确认原型的点阵漂移和轮换文案动效。
- 生成中卡片按请求尺寸保持稳定画幅，空作品区和已有作品时都不会因卡片数量改变而异常拉伸；多张不同画幅作品使用自适应瀑布流，减少不同尺寸之间的无意义留白。
- 我的作品覆盖生成中、服务器临时结果、本机副本、失败和过期状态，并提供单图下载、按原提示词再次生成、完成图片点击预览和删除。
- 作品管理支持单图二次确认删除、多选后批量删除，以及“删除 3 天前 / 删除 7 天前 / 删除全部”；删除会同时处理服务器任务记录和当前浏览器中的对应副本，正在生成的任务不会被范围删除误删。
- 创建页和灵感库各自监听内容区滚动；下滑超过 320px 后在右下角显示回到顶部按钮，点击后平滑滚回当前页面顶部。

参考图生图：

- `gpt-image-2` 支持上传 1 至 9 张 PNG、JPEG 或 WEBP 参考图，前端同时支持文件选择、拖拽和从剪贴板粘贴，提供缩略图预览和单张删除。
- 一次选择或分次累计超过 9 张时，只加入剩余名额内的图片并明确提示未添加数量；单张限制 20 MB，单次参考图总大小限制 100 MB，前后端执行一致校验。
- 有参考图时前端使用 multipart 提交，后端将任务切换为 `/v1/images/edits`，并通过 OpenAI 兼容适配器把单图作为 `image`、多图作为 `image[]` 实际发送给上游；自动化测试会校验上游收到的文件名和文件字节，避免只完成上传 UI 而未参与生图。
- multipart 二进制不写入 SQLite。请求体暂存在 `IMAGE_WORKSHOP_ROOT/inputs/<task_id>/request.multipart`，任务数据只保存相对路径、输出数量和参考图数量。
- 任务成功后立即删除参考图请求；任务失败时默认保留 1 小时用于原卡片“再次生成”，重试仍使用原参考图且固定生成 1 张。暂存已过期时明确提示用户重新上传，不会静默改成纯文本生图。
- 删除任务记录时同步删除对应参考图请求；后台维护会按 TTL 清理遗留请求。完成任务再次生成时，因为原参考图已经清理，前端会要求用户重新上传参考图。

灵感数据：

- 数据与 Lingqu 当前实现保持同源，使用 `gavin20150423/lingqu-ai` 提交 `d82f47692eab7abbf9993a661b90b1213866673b` 中的 prompt library。
- 随前端保留 392 个案例、1446 条热门提示词、13 个模板分类、分类封面，以及 MIT / CC BY 4.0 许可证文件。
- 首页只加载案例数据，不提前下载完整热门提示词文件；热门数据仅在进入灵感库二级页时加载。
- 首页候选案例已按真实远程图片尺寸检查，只从竖图或接近竖图的精选案例中随机展示，避免把横幅图片强裁成首页卡片。
- 首页上一批、下一批和随机换一批使用独立切换逻辑；切换前由用户浏览器预加载目标 5 张图片，当前模板会保留到预加载结束，NewAPI 服务端不代理这些远程图片。
- 首页、灵感库和我的作品全部图片卡片提供原图预览，支持 50% 至 300% 缩放、恢复适合窗口、关闭按钮和点击空白区域关闭；触摸板捏合缩放和带 Ctrl 的滚轮缩放会转换为同一套缩放逻辑，预览图片始终按窗口居中处理。
- GitHub 案例图片优先使用 jsDelivr CDN，并保留 GitHub Raw 作为加载失败时的备用地址，避免单一图片域名不可用导致整个灵感库空白。
- 页面不展示 Lingqu 名称，只保留开源数据源及对应许可证信息。

本机作品：

- 生成完成后通过签名 URL 获取 Blob，并按 NewAPI 用户 ID 写入 IndexedDB；同一浏览器切换账号时不会互相展示本机作品。
- 作品列表优先使用本机 Blob，服务器临时文件过期后仍可展示已成功保存的副本。
- 透明背景（本地处理）已完成：前端仅在 PNG 格式下显示该选项，提交时使用内部 `transparent_output` 标记；后端只将标记写入任务 metadata，不把它伪装成上游 `background=transparent` 参数。
- 透明任务完成后，浏览器先保存上游返回的原始 PNG，再使用 Canvas 做本地透明处理；处理成功后作品卡片标记为“透明 · 本机”，同时保留原始图片供下载。
- 透明任务在真正转发上游前追加纯绿色/纯洋红色背景生成指令，用户原始提示词仍单独保存在任务 metadata 中；本地处理基于生成结果边缘的键色和连通区域进行抠除，并要求结果实际包含足够的透明像素。模型没有遵循纯色背景指令、浏览器不支持 Canvas 或处理失败时，作品回退显示原始 PNG，卡片标记为“透明失败 · 原图”并提示用户。
- 用户可见说明使用“当前浏览器”“更换设备不会同步”“清理浏览器数据可能丢失”等直白表达，不把本机存储描述成永久云端作品库。
- 已完成作品按返回图片的真实宽高比展示，不再按任务请求的 `size` 强制裁切；只有生成中、失败和过期占位继续使用请求尺寸。
- 作品区使用可自动收缩空轨道的等宽网格，少量作品也会填满可用宽度，不在右侧保留异常宽的空白列。

提交错误处理：

- 图工坊创建请求跳过 Axios 和 React Query 的重复通用错误弹窗，由页面统一显示一条可读错误。
- 后端未返回错误文案时显示“任务提交失败，请稍后重试”，不再出现只有错误图标而没有文字的空白提示。
- 成功响应仍在拿到任务 ID 后刷新任务列表，并自动滚动到“我的作品”；失败时不滚动。
- Key、模型能力和任务查询失败时不弹通用 HTTP 错误，页面内分别提示“服务接口不可用”“能力读取失败”或“当前 Key 没有生图模型”，避免把后端版本问题误报成没有 Key。
- 重新加载服务或模型能力时保留现有页面骨架，只更新对应区域的加载状态，不再通过整页内容替换造成屏幕闪烁。

验证：

```bash
cd web/default
bun run typecheck
bunx oxlint -c .oxlintrc.json src/features/image-workshop src/routes/_authenticated/image-workshop \
  src/hooks/use-sidebar-data.ts src/hooks/use-sidebar-config.ts \
  src/features/profile/components/sidebar-modules-card.tsx \
  src/features/system-settings/maintenance/config.ts \
  src/features/system-settings/maintenance/sidebar-modules-section.tsx
bunx oxfmt --check src/features/image-workshop src/routes/_authenticated/image-workshop \
  src/hooks/use-sidebar-data.ts src/hooks/use-sidebar-config.ts \
  src/features/profile/components/sidebar-modules-card.tsx \
  src/features/system-settings/maintenance/config.ts \
  src/features/system-settings/maintenance/sidebar-modules-section.tsx
bun run build:check
```

Phase 2C 前端与交互优化的关键提交：

```text
0462b604 实现原生图工坊前端与本机作品画廊
5417e3d3 优化图工坊界面与作品展示
28872468 增加图工坊回到顶部按钮
b80f74d5 修复图工坊运行接口与灵感图片加载
4774b5ff 修复图工坊重试时页面闪烁
ce05539b 修正图工坊作品卡片布局
c398c541 修正图工坊作品卡片排列顺序
12b00828 增加图工坊作品管理功能
6e974a01 修复本机作品图片显示异常
a0213052 统一图工坊作品勾选样式
a88cfaa8 优化图工坊作品瀑布流布局
c03ae1d2 完善图工坊图片预览交互
733239f3 放开 GPT Image 2 兼容渠道参数能力
21e28f5d 完善 GPT Image 2 尺寸选择能力
777fb548 修正图工坊尺寸控件布局
299e6e9f 稳定尺寸弹窗内容布局
89de67c5 优化尺寸档位默认选择样式
88f900f3 保留尺寸档位间的用户比例选择
0023af3b 同步按比例模式默认选择状态
61f8a829 合并按比例模式默认状态修正
```

rc20 迁移关键提交：

```text
75a92864 迁移图工坊后端契约到最新主线
b10e9744 迁移图工坊前端底座到最新主线
ea906c6b 适配图工坊前端到 rc20 代码规范
16798ace 统一迁移后图工坊前端格式
```

最近一次 rc20 集成验证：后端 `go test -count=1 ./model ./service ./controller ./router`、前端 `bun run typecheck`、图工坊范围 Oxlint、Oxfmt 和 `bun run build:check` 均通过。全仓 `bun run lint` 仍有最新 `main@402ffdea` 可复现的非图工坊基线错误，本迁移分支不修改这些无关模块。

独立镜像 `new-api-image-workshop-rc20:16798ace` 已构建并运行在 `http://127.0.0.1:3004`，容器名为 `new-api-image-workshop-rc20`，使用 `/tmp/newapi-image-workshop-rc20/data` 独立 SQLite 数据目录，不复用现有 `3000` / `3003` 实例数据。

rc20 浏览器验收已覆盖默认桌面视口和 390x844 移动视口：登录、侧栏图工坊入口、创建页、灵感模板、灵感库二级页、远程模板图片和空作品状态均正常，控制台无错误。当前临时实例没有可用 Key，因此未触发真实生图请求；旧版验证中覆盖的 320、375、414、768 和 1440px 视口结果仅保留为迁移前参考。

作品删除的后端自动化测试已覆盖：只能删除当前用户已结束的图片任务、按任务 ID 批量删除，以及删除 3 天前、7 天前和全部历史时保留 queued/running 任务。

### Phase 2C 待验收项

- 使用真实可用的 `gpt-image-2` Key 和渠道完成一次端到端验证：读取能力、提交任务、轮询完成、展示真实尺寸、写入 IndexedDB、下载和删除。
- 在真实任务中分别验证 1K、2K、4K、非 1:1 比例和自定义宽高的上游接受情况；当前只完成能力声明、前后端规整校验和 UI 交互验证。
- 真实 Key / 渠道下仍需分别验证 1K、2K、4K、非 1:1 比例和自定义宽高的“请求档位、上游记录、实际输出宽高、NewAPI 扣费日志”四项是否一致。

## Phase 3：增强能力

### 分辨率与上游计费审计（2026-07-21）

已将截图中的上游记录、NewAPI 请求和本地落盘文件逐条对应，结果如下：

| 上游记录时间 | NewAPI 请求 `size` | 上游显示档位 | 本地实际图片 |
| --- | --- | --- | --- |
| 02:12:52 | `1536x1024` | 2K | `1024x1536` |
| 02:38:17 | `1536x1024` | 2K | `1536x1024` |
| 02:40:24 | `768x1024` | 1K | `1086x1448` |
| 02:52:27 | `2304x3456` | 4K | `1024x1536` |

结论：上游在这些请求中主要依据请求尺寸或请求档位计费，实际返回图片可能方向反转、被降采样或尺寸放大，但不会因此同步改变已产生的上游费用。NewAPI 不能用最终落盘像素替代上游计费档位，否则可能出现同一请求在上游已产生较高成本、NewAPI 却少扣费的情况。

当前建议和实现：

- 计费依据使用后端规范化后实际发送的 `size`，`auto` 或缺少尺寸时按 2K 保守估算。
- 模型价格“按次”页支持“按分辨率计费”开关。开启后必须完整配置 1K、2K、4K 三档美元单价，图工坊按请求档位直接采用对应单价，再乘分组倍率；不会在独立单价上重复叠加默认倍率。
- 未开启独立档位价格时，固定价格模式继续以普通 `ModelPrice` 为基准，按 1K=`1.0`、2K=`1.5`、4K=`2.0` 倍率结算，保持已有配置兼容。
- 独立档位配置保存在模型级 `ImageResolutionPrice` 中，不放入分组配置；1K 价格同时写入普通 `ModelPrice` 作为非图工坊请求和多实例配置同步期间的兼容回退。
- token usage 模式保留上游 usage 结算，不再额外叠加档位倍率，避免上游 usage 已反映分辨率时重复计费。
- 实际图片宽高、请求尺寸、预计档位、计费策略和独立单价或回退倍率全部保留在任务结果/日志中，只用于质量审计、上游适配纠错和异常告警。
- 1K 选项下某些非正方形预设的最大边可能已经超过 1024，因此前端同时展示“预计计费档位”；这类提示不改变已经验证过的生成尺寸行为。

后续增强按独立分支推进：

- 管理员配置 1K、2K、4K 实际对外价格：已完成；后续只需结合真实渠道成本确定生产价格。
- 基于 NewAPI 后端 capability 接入更多生图模型，例如 Grok、Gemini；不在图工坊重复建设 provider 配置。
- 参考图生图已完成；后续继续评估图片局部重绘。
- 管理员配置页：TTL、磁盘上限、清理策略、签名 URL TTL。
- 生产级补偿退款策略：上游成功但本地落盘失败时进行补偿。

## 当前集成状态

- `feature/image-workshop-rc20-migration` 基于最新 `main@402ffdea`，已经迁移 Phase 2B 后端契约和 Phase 2C 原生前端，是当前功能最完整的跟进分支。
- 旧的 `fix/image-workshop-ui-refinement` 仅作为 rc8 实现参考，不再继续开发或直接合入主线。
- 当前完整图工坊尚未合入 `main`；完成 rc20 回归和真实 `gpt-image-2` Key / 渠道验收后，再从迁移分支串行合入目标分支。
- 后续计费、多模型适配、图片编辑和管理员存储配置继续使用独立分支和独立 worktree，不在当前迁移分支中并行开发。

不要在 `main` / `master` 上直接开发。
