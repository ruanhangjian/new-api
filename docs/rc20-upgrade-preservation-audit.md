# rc20 升级功能保留审计

## 结论

当前升级分支 `feature/upgrade-open-source-rc20` 已经保留本地二开主功能，并且已补入图工坊 Phase 1 异步后端与 Phase 2A 登录态桥接接口。

需要特别注意：当前分支不是通过把 `v1.0.0-rc.20` tag 作为祖先直接 merge 得到的。`v1.0.0-rc.20` 和 `upstream-v1.0.0-rc.20` 都指向 `a7f3067bf34a2fa125f843acdfcf45d0b0bfd682`，但 `git merge-base --is-ancestor v1.0.0-rc.20 HEAD` 返回非 0。也就是说，rc20 相关变更目前更接近“以补丁队列方式对齐到本地二开历史”，后续部署前不要把它当作 upstream tag 原样合并后的分支。

## 当前分支状态

- 仓库：`/Users/superdavid/Downloads/中转站/new-api`
- worktree：`.worktrees/upgrade-open-source-rc20`
- 分支：`feature/upgrade-open-source-rc20`
- 审计基线：`2660bce3 修复 rc20 前端合并类型错误`
- 审计文档：`docs/rc20-upgrade-preservation-audit.md`
- 基线说明：相对 `origin/main` 本地 ahead，且图工坊 Phase 2A 相关提交只在本地升级分支中可见，尚未推送到远端分支。

## 已保留功能

### 首页 UI

证据：

- 后端接口：`router/api-router.go` 注册 `GET /home_page_content`
- 控制器：`controller/misc.go` 的 `GetHomePageContent`
- 配置项：`model/option.go` 的 `HomePageContent`
- 前端页面：`web/default/src/features/home/index.tsx`
- 前端路由：`web/default/src/routes/index.tsx`

### 企业 CDK 与兑换人备注

证据：

- 后端用户侧接口：`router/api-router.go` 注册 `/api/enterprise/cdk/*`
- 后端管理侧接口：`router/api-router.go` 注册 `/api/admin/enterprise/*`
- 数据模型迁移：`model/main.go` 注册企业 CDK 相关模型
- 后端控制器：`controller/enterprise_cdk.go`
- 兑换人展示优先使用备注：`model/enterprise_cdk_redemption.go` 使用 `profile_remark`
- 用户字段：`model/user.go` 包含 `profile_remark`
- 用户资料接口：`controller/user.go` 返回并更新 `profile_remark`
- 前端用户侧页面：`web/default/src/routes/_authenticated/enterprise-cdk/index.tsx`
- 前端批次详情：`web/default/src/routes/_authenticated/enterprise-cdk/batches/$id.tsx`
- 前端管理侧页面：`web/default/src/routes/_authenticated/enterprise-cdk-admin/index.tsx`
- 侧边栏入口：`web/default/src/hooks/use-sidebar-data.ts`

### 邀请返利

证据：

- 后端用户侧接口：`router/api-router.go` 注册 `/api/user/affiliate-rebate/*`
- 数据模型：`model/affiliate_rebate.go`
- 结算任务：`service/affiliate_rebate_settlement_task.go`
- 启动入口：`main.go` 启动返利结算任务
- 前端页面：`web/default/src/routes/_authenticated/affiliate-rebate/index.tsx`
- 前端 API：`web/default/src/features/affiliate-rebate/api.ts`
- 侧边栏入口：`web/default/src/hooks/use-sidebar-data.ts`
- 系统设置项：`web/default/src/features/system-settings/general/affiliate-rebate-settings-section.tsx`

### 渠道监控、渠道状态、自动禁用与被动恢复

证据：

- 后端监控接口：`router/api-router.go` 注册 `/api/channel_monitor/*`
- 后端状态接口：`router/api-router.go` 注册 `/api/channel_status/*`
- 数据模型：`model/channel_monitor.go`
- 监控调度：`controller/channel_monitor.go`
- 监控服务：`service/channel_monitor.go`
- 启动入口：`main.go` 启动渠道监控任务
- 自动禁用配置：`model/option.go`、`service/channel.go`、`controller/channel-test.go`
- 被动恢复测试：`controller/channel_test_internal_test.go`
- 前端监控页：`web/default/src/routes/_authenticated/channel-monitor/index.tsx`
- 前端状态页：`web/default/src/routes/_authenticated/channel-status/index.tsx`
- 前端 API：`web/default/src/features/channel-monitor/api.ts`
- 系统设置页：`web/default/src/features/system-settings/models/routing-reliability-section.tsx`
- 监控设置页：`web/default/src/features/system-settings/integrations/monitoring-settings-section.tsx`
- 侧边栏配置：`web/default/src/hooks/use-sidebar-config.ts`

### Public user ID、CC Switch、钱包/订阅显示修正

证据：

- Public user ID 和用户资料相关逻辑仍在用户模型、用户控制器和前端个人资料模块中。
- CC Switch 辅助入口仍在 `web/default/src/features/keys/components/dialogs/cc-switch-dialog.tsx`。
- CC Switch URL 构造与测试仍在 `web/default/src/features/keys/lib/cc-switch.ts` 和 `web/default/src/features/keys/lib/cc-switch.test.ts`。
- 钱包/订阅换算说明保留在 `docs/wallet-subscription-conversion-optimization.md`。

## 图工坊保留状态

### 已保留：Phase 1 异步图片后端

证据：

- 异步提交入口：`POST /v1/images/generations?async=true`
- 任务轮询入口：`router/relay-router.go` 注册 `GET /v1/images/tasks/:task_id`
- 签名图片入口：`router/relay-router.go` 注册 `GET /v1/images/tasks/:task_id/files/:file_id`
- 控制器：`controller/image_async.go`
- worker：`service/image_async_task.go`
- 结果存储：`service/image_result_store.go`
- 测试：`controller/image_async_test.go`、`service/image_async_task_test.go`、`service/image_result_store_test.go`
- 文档：`docs/image-async-backend-phase1.md`

相关提交：

- `de65893c 实现异步文生图后端 MVP`
- `f76d67bc 加固异步生图后端安全策略`

### 已保留：Phase 2A 登录态桥接接口

证据：

- 路由组：`router/api-router.go` 注册 `/api/image-workshop`
- token 列表：`GET /api/image-workshop/tokens`
- 生图提交：`POST /api/image-workshop/generations`
- 任务轮询：`GET /api/image-workshop/tasks/:task_id`
- 控制器：`controller/image_workshop.go`
- 路由测试：`router/api_router_test.go`
- 行为测试：`controller/image_workshop_test.go`
- 文档：`docs/image-workshop-phase2-plan.md`

当前 middleware 链路：

```text
UserAuth
-> PrepareImageWorkshopGeneration
-> SystemPerformanceCheck
-> TokenAuth
-> ModelRequestRateLimit
-> Distribute
-> CreateImageWorkshopGeneration
```

相关提交：

- `1f616570 新增生图工坊登录态桥接接口`
- `68428189 修正生图工坊桥接接口中间件链路`
- `e60cfb62 适配图工坊测试到 rc20`

### 未完成：Phase 2B 图工坊前端

旧 worktree 中的图工坊材料明确包含 gpt-image-playground/Lingqu 的前端子应用、灵感库、画廊、模板库、主站入口、iframe/静态资源 fallback 等内容。但当前升级分支没有实际前端图工坊 SPA/route 文件。

当前升级分支只保留了后端能力和桥接 API。若上线目标包含“用户能在网页里直接使用图工坊 UI”，还需要继续实现 Phase 2B 前端迁移。

参考材料：

- `.worktrees/image-async-backend/docs/image-workshop-phase2-plan.md`
- `.worktrees/lingqu-image-notes/docs/newapi-image-workshop-migration-plan.md`
- `.worktrees/lingqu-image-notes/docs/lingqu-image-playground-integration-analysis.md`
- `.worktrees/lingqu-image-notes/docs/gpt-image-playground-0.6.1-and-lingqu-deletions.md`

## 已运行验证

前端：

```bash
cd web/default
bun run typecheck
bun run build
```

结果：均通过。

后端：

```bash
docker run --rm -v "$PWD":/app -v new-api-go125-mod:/go/pkg/mod -v new-api-go125-build:/root/.cache/go-build -w /app golang:1.25.1 sh -lc '/usr/local/go/bin/go test -count=1 ./model ./service ./controller ./router'
```

结果：`model`、`service`、`controller`、`router` 均通过。

图工坊定向验证：

```bash
docker run --rm -v "$PWD":/app -v new-api-go125-mod:/go/pkg/mod -v new-api-go125-build:/root/.cache/go-build -w /app golang:1.25.1 sh -lc '/usr/local/go/bin/go test -count=1 ./controller ./router -run "TestImageWorkshop|TestImageAsync"'
```

结果：`controller`、`router` 均通过。

lint：

```bash
cd web/default
bun run lint
```

结果：未通过。当前 lint 失败是 repo 级既有债务，最新统计约 `577` 个 error、`112` 个 warning，涉及范围较广，不应作为本次 rc20 升级保留项已经破坏的直接证据。但部署前仍建议单独安排 lint 清理或至少按改动范围做 targeted lint。

## 剩余风险

1. rc20 不是 tag 祖先合并，后续继续追 upstream 时可能再次遇到补丁队列冲突。
2. 图工坊 Phase 2B 前端还没迁入；如果用户预期“图工坊 UI 可用”，当前分支仍不完整。
3. 全量前端 lint 未绿，虽然不是本次升级阻断点，但会降低后续改动的静态检查信噪比。
4. 尚未对真实服务器执行备份、数据库迁移预演、环境变量检查和生产 smoke test。
5. 图工坊 Phase 1 当前按单实例本地磁盘结果存储设计，生产多实例部署需要额外确认共享存储或实例亲和策略。

## 部署前建议顺序

1. 决定是否先补 Phase 2B 前端。如果要“图工坊 UI 一起上线”，先不要部署当前分支。
2. 在本地或 staging 环境做数据库迁移预演，重点看企业 CDK、返利、渠道监控、图工坊 task 表相关迁移。
3. 备份生产数据库和当前部署产物。
4. 构建前端和后端产物。
5. 部署到 staging 或临时端口后做 smoke test：
   - 登录、创建 token、发起普通聊天请求。
   - 首页内容读取。
   - 企业 CDK 创建、导出、兑换人备注显示。
   - 邀请返利概览和结算页读取。
   - 渠道监控创建、手动运行、渠道状态页读取。
   - 图工坊 bridge：列 token、提交任务、轮询任务、访问签名图片 URL。
6. smoke test 通过后再安排生产切换。
