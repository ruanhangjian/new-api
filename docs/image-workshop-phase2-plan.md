# 生图工坊 Phase 2 接入计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 1 异步文生图后端之上，先补齐 NewAPI 登录用户到异步生图 API 的桥接层，再开始迁移生图工坊前端。

**Architecture:** Phase 1 的 `/v1/images/generations?async=true` 仍作为底层 relay/计费入口，继续使用 API token、Distribute 和 OpenAIImage relay。Phase 2A 新增 `/api/image-workshop/*` 登录态桥接接口，让前端用 NewAPI session 调用，不把 API key 暴露给浏览器。Phase 2B 补齐参数、模型能力、任务历史和短期清理契约。Phase 2C 前端只依赖桥接层和签名图片 URL，不依赖本地文件路径或 Authorization header 展示图片。

**Tech Stack:** Go + Gin + GORM + NewAPI existing TokenAuth/UserAuth/Distribute/Relay, React frontend in existing NewAPI web app, local disk result storage.

**当前 rc20 升级范围说明：** 本次 NewAPI 升级只保留 Phase 1 异步生图后端和 Phase 2A 登录态桥接接口；Phase 2B 图工坊前端不纳入本次合并，也不应随升级分支部署。

---

## 当前状态

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

### 实施状态（feature/image-workshop-bridge）

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

- [ ] **Step 1：创建独立 worktree/分支**

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

- [ ] **Step 2：补 service 测试**

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

- [ ] **Step 3：实现 GetUserImageTask**

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

- [ ] **Step 4：抽出异步提交 helper**

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

- [ ] **Step 5：创建 bridge controller 测试**

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

- [ ] **Step 6：实现 controller/image_workshop.go**

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

- [ ] **Step 7：注册路由**

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

- [ ] **Step 8：跑后端相关测试**

```bash
go test -count=1 ./model ./service ./controller ./router
```

如果本机没有 Go：

```bash
docker run --rm -v "$PWD":/app -v new-api-go125-mod:/go/pkg/mod -v new-api-go125-build:/root/.cache/go-build -w /app golang:1.25.1 sh -lc '/usr/local/go/bin/go test -count=1 ./model ./service ./controller ./router'
```

- [ ] **Step 9：做 bridge smoke**

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

- [ ] **Step 10：更新文档并提交**

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
```

已实现：

- 按当前用户、token 分组和 token 模型限制返回可用图片模型及参数能力。
- 提交请求使用严格字段白名单，校验 `model`、`prompt`、`n`、`size`、`quality` 和 `output_format`。
- 强制 `response_format=b64_json`，将客户端传入的审核值覆盖为 `moderation=auto`。
- worker 在实际渠道分配后保留官方 OpenAI 的 `moderation=auto`，对其他兼容上游删除该字段。
- 用户任务历史只返回当前用户的 `platform=image` 任务，不暴露渠道、token 和本地路径。
- 临时文件未过期时动态重新签名；文件过期或丢失时返回 `result_available=false`。
- 任务记录默认保留 24 小时、全局最多 100 条，只清理已完成或已失败任务。
- 服务启动时执行一次维护，之后默认每 10 分钟执行，提交任务时仍会触发一次非阻塞维护。

## Phase 2C：前端工坊 MVP

只有 Phase 2B 完成并集成验收后再开始 Phase 2C。

前端 MVP 目标：

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
- 不先做图片编辑、Agent 模式、作品库和多实例能力。
- UI 可以参考 `CookSleep/gpt_image_playground 0.6.1`，但不要不加筛选地整包搬入。

建议分支：

```text
feature/image-workshop-frontend
```

### Phase 2C 实施状态（feature/image-workshop-frontend）

已完成 NewAPI default 前端的原生图工坊 MVP，不使用 iframe，也没有引入独立子应用外壳。

页面与交互：

- 新增 `/image-workshop` 创建页和 `/image-workshop/library` 灵感库二级页，并接入现有 NewAPI 顶栏、宽侧栏、管理员侧栏开关和用户侧栏开关。
- 创建页沿用已确认的 gpt2api `CreateStudioPage` 上下结构；桌面端提示词区与参数区实测高度为 `170:113`，约等于 `60:40`。
- 提示词输入框会随内容自动增高，最高增至 360px 后再在输入框内部滚动；移动端初始高度收紧为 120px。
- 保留图片/视频切换外观；图片为当前可用模式，点击视频只提示“视频功能暂未开放”，不创建空白或伪视频工作流。
- Key 选择器位于创建区标题行，使用“Key 名称-分组名称-脱敏 Key”展示；参数区固定为尺寸、质量、格式、透明背景和数量，模型选择保留在提交按钮左侧。尺寸不再使用普通下拉框，而是使用与 Lingqu 当前实现一致的“自动 / 按比例 / 自定义宽高”选择面板。
- 参数只根据 `/api/image-workshop/options` 返回的真实能力启用；审核选项不展示，透明背景在后端未声明支持时显示为不可操作的“关闭”，不向请求中伪造无效字段。
- `gpt-image-2` 的参数能力按模型声明，不再要求渠道地址必须是 `api.openai.com`。OpenAI 兼容中转开放 `auto`、1K / 2K / 4K 三档尺寸、`1:1`、`3:2`、`2:3`、`16:9`、`9:16`、`4:3`、`3:4`、`21:9` 八种预设比例、自定义比例和自定义宽高，同时保留 `auto/low/medium/high` 质量、`png/jpeg/webp` 格式和最多 4 张输出。
- `gpt-image-2` 自定义尺寸沿用 Lingqu 的规整边界：宽高为 16 的倍数，最大边长 3840px，宽高比不超过 3:1，总像素限制为 655,360 到 8,294,400。前端先展示规整后的最终尺寸，服务端再次执行同样的规整和校验，最终只向上游发送规范化后的 `widthxheight`。
- 尺寸选择面板固定外框高度，模式内容在独立区域内滚动，避免在“自动 / 按比例 / 自定义宽高”之间切换时窗口跳动；选中状态使用浅灰背景和柔和边框，并保留 1K、1:1 卡片左侧描边的安全边距。
- 每次从“自动”或“自定义宽高”进入“按比例”时，默认选择 `1:1` 并同步更新预览尺寸；用户已经选择其他比例后，切换 1K、2K、4K 只重新计算尺寸，不重置用户比例。
- 当前完成的是尺寸生成能力，不代表已完成分辨率差异计费。现有 Images 计费链路仍按模型基础价格和生成张数结算，尚未为 1K / 2K / 4K 增加独立倍率；正式对外按分辨率收费前仍需完成 Phase 6 计费配置。
- 提交后通过 `/api/image-workshop/tasks` 轮询真实任务状态；生成中卡片复用已确认原型的点阵漂移和轮换文案动效。
- 我的作品覆盖生成中、服务器临时结果、本机副本、失败和过期状态，并提供单图下载和按原提示词再次生成。
- 创建页和灵感库各自监听内容区滚动；下滑超过 320px 后在右下角显示回到顶部按钮，点击后平滑滚回当前页面顶部。

灵感数据：

- 数据与 Lingqu 当前实现保持同源，使用 `gavin20150423/lingqu-ai` 提交 `d82f47692eab7abbf9993a661b90b1213866673b` 中的 prompt library。
- 随前端保留 392 个案例、1446 条热门提示词、13 个模板分类、分类封面，以及 MIT / CC BY 4.0 许可证文件。
- 首页只加载案例数据，不提前下载完整热门提示词文件；热门数据仅在进入灵感库二级页时加载。
- 首页候选案例已按真实远程图片尺寸检查，只从竖图或接近竖图的精选案例中随机展示，避免把横幅图片强裁成首页卡片。
- 首页上一批、下一批和随机换一批使用独立切换逻辑；切换前由用户浏览器预加载目标 5 张图片，当前模板会保留到预加载结束，NewAPI 服务端不代理这些远程图片。
- 首页和灵感库全部图片卡片提供原图预览，支持 50% 至 300% 缩放、恢复适合窗口、关闭按钮和点击空白区域关闭。
- GitHub 案例图片优先使用 jsDelivr CDN，并保留 GitHub Raw 作为加载失败时的备用地址，避免单一图片域名不可用导致整个灵感库空白。
- 页面不展示 Lingqu 名称，只保留开源数据源及对应许可证信息。

本机作品：

- 生成完成后通过签名 URL 获取 Blob，并按 NewAPI 用户 ID 写入 IndexedDB；同一浏览器切换账号时不会互相展示本机作品。
- 作品列表优先使用本机 Blob，服务器临时文件过期后仍可展示已成功保存的副本。
- 用户可见说明使用“当前浏览器”“更换设备不会同步”“清理浏览器数据可能丢失”等直白表达，不把本机存储描述成永久云端作品库。
- 已完成作品按返回图片的真实宽高比展示，不再按任务请求的 `size` 强制裁切；只有生成中、失败和过期占位继续使用请求尺寸。
- 作品区使用可自动收缩空轨道的等宽网格，少量作品也会填满可用宽度，不在右侧保留异常宽的空白列。

提交错误处理：

- 图工坊创建请求跳过 Axios 和 React Query 的重复通用错误弹窗，由页面统一显示一条可读错误。
- 后端未返回错误文案时显示“任务提交失败，请稍后重试”，不再出现只有错误图标而没有文字的空白提示。
- 成功响应仍在拿到任务 ID 后刷新任务列表，并自动滚动到“我的作品”；失败时不滚动。
- Key、模型能力和任务查询失败时不弹通用 HTTP 错误，页面内分别提示“服务接口不可用”“能力读取失败”或“当前 Key 没有生图模型”，避免把后端版本问题误报成没有 Key。

验证：

```bash
cd web/default
bun run typecheck
bunx eslint src/features/image-workshop src/routes/_authenticated/image-workshop \
  src/hooks/use-sidebar-data.ts src/hooks/use-sidebar-config.ts \
  src/features/profile/components/sidebar-modules-card.tsx \
  src/features/system-settings/maintenance/config.ts \
  src/features/system-settings/maintenance/sidebar-modules-section.tsx
bun run build
```

尺寸选择器最近一次修复的提交：

```text
777fb548 修正图工坊尺寸控件布局
299e6e9f 稳定尺寸弹窗内容布局
89de67c5 优化尺寸档位默认选择样式
88f900f3 保留尺寸档位间的用户比例选择
0023af3b 同步按比例模式默认选择状态
61f8a829 合并按比例模式默认状态修正
```

最近一次前端集成验证：`bunx prettier --check src/features/image-workshop/components/image-size-picker.tsx`、`bun run typecheck`、`bunx eslint src/features/image-workshop` 和 `bun run build:check` 均通过。由于当前验证账号没有可用生图 Key，尺寸控件处于禁用状态，未触发真实生图请求完成最终点击复验。

浏览器验证覆盖 320、375、414、768 和 1440px 宽度，主页面与灵感库均无横向溢出；同时验证了视频未开放提示、提示词自动增高、生成动效和 IndexedDB 本机副本恢复。

## Phase 3：增强能力

后续增强按独立分支推进：

- 1K、2K、4K 分辨率差异计费。
- 多生图模型配置，例如 `gpt-image-2`、`nano banana`。
- 图片编辑、参考图、局部重绘。
- Agent 模式。
- 用户作品库、收藏、再次编辑。
- 管理员配置页：TTL、磁盘上限、清理策略、签名 URL TTL。
- 生产级补偿退款策略：上游成功但本地落盘失败时进行补偿。

## 合并建议

推荐顺序：

1. `feature/image-async-backend` 作为后端底座完成最终验收。
2. `feature/image-workshop-bridge` 基于 `feature/image-async-backend` 开发并提交。
3. bridge 验收通过后，再决定是先串行合入 main，还是继续基于 bridge 开前端分支。
4. `feature/image-workshop-frontend` 只做前端 MVP，不混入计费、多模型和作品库。

不要在 `main` / `master` 上直接开发。
