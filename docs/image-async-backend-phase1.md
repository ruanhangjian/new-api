# 生图工坊 Phase 1 后端异步文生图 MVP

## 范围

本阶段只支持文生图异步任务：

- `POST /v1/images/generations?async=true`
- `POST /v1/images/generations?async=1|yes|on`
- `GET /v1/images/tasks/:task_id`
- `GET /v1/images/tasks/:task_id/files/:file_id`

不带 `async=true` 的 `POST /v1/images/generations` 仍走原同步图片 relay。

## 任务与权限

异步任务复用 `model.Task`，平台为 `image`，动作为 `images.generations`。轮询和文件访问都必须通过 `/v1` API token 鉴权，并校验：

- task 属于当前 token 的用户。
- 如果任务记录了 `token_id`，当前 token 必须与任务 token 一致。
- 文件只允许访问 completed 任务中的未过期文件。

## Worker 执行

入队阶段只保存请求快照并返回 `202`，不预扣费。后台 worker 会用任务记录的 token 重新构造内部请求，并重新经过现有 `TokenAuth + Distribute + Relay(OpenAIImage)` 链路，因此 token 状态、过期时间、剩余额度、用户状态、分组权限、模型限制、渠道选择、请求转换、计费和日志仍走 NewAPI 现有实现。

如果 token 在入队后被禁用、过期、耗尽额度，或模型权限被收紧，worker 会将任务标记为 `failed` 并记录错误，不会继续调用上游。

任务状态对外映射为：

- `QUEUED` / `NOT_START` -> `queued`
- `IN_PROGRESS` -> `running`
- `SUCCESS` -> `completed`
- `FAILURE` -> `failed`

## 本地结果存储

如果上游返回 URL，任务结果直接保存 URL 和元数据。如果上游返回 `b64_json`，worker 会立即解码到本地文件：

```text
data/image-workshop/results/YYYY/MM/DD/<task_id>/<file_id>.png
```

任务结果只保存内部受控 URL，不保存大段 base64。轮询结果中的本地文件 URL 会带短期签名参数，便于前端 `<img src>` 直接加载；签名绑定 task、file、user、token 和过期时间。未带签名的文件访问仍支持 `Authorization` header，主要用于 API/调试场景。

默认结果 TTL 为 6 小时，可通过环境变量调整，最大建议 24 小时：

- `IMAGE_WORKSHOP_ROOT`
- `IMAGE_WORKSHOP_RESULT_TTL_HOURS`
- `IMAGE_WORKSHOP_RESULT_TTL_MAX_HOURS`
- `IMAGE_WORKSHOP_SIGNED_URL_TTL_MINUTES`
- `IMAGE_WORKSHOP_MAX_FILE_MB`
- `IMAGE_WORKSHOP_MAX_TASK_MB`
- `IMAGE_WORKSHOP_CACHE_MAX_GB`
- `IMAGE_WORKSHOP_MIN_FREE_GB`
- `IMAGE_WORKSHOP_TASK_TTL_HOURS`
- `IMAGE_WORKSHOP_TASK_MAX_COUNT`
- `IMAGE_WORKSHOP_MAINTENANCE_INTERVAL_MINUTES`

服务启动时和每次提交异步任务时会触发清理，后台默认每 10 分钟再执行一次。清理会删除过期文件，并在缓存超过上限或磁盘空闲低于水位时按最旧文件清理。图片任务记录默认保留 24 小时、全局最多 100 条，只会删除已完成或已失败的记录。

针对小磁盘部署，本地图片缓存默认上限为 1 GB，默认保留至少 2 GB 磁盘剩余空间。部署时应根据实际数据盘大小调整，且 `IMAGE_WORKSHOP_MIN_FREE_GB` 必须低于磁盘常态可用空间。

## 失败、计费与幂等

- 入队不预扣费，因此 queued 任务失败或被恢复策略标记失败不会扣费。
- worker 真正执行时复用同步图片 relay，成功和上游失败的扣费/退款行为由现有 `Relay` 计费会话处理。
- task 状态使用 CAS 从 `queued -> running -> completed/failed`，同一任务不会被多个 worker 重复执行。
- 如果本地结果落盘在上游已成功后失败，任务会失败；该极端场景可能已经经过同步 relay 计费，后续生产版可补偿性退款。

## 单实例恢复策略

Phase 1 不引入 Redis 队列或对象存储，也不做多实例恢复。当前策略：

- 后端收到新的异步提交时，会顺手扫描超时的 image task。
- 超过 `TASK_TIMEOUT_MINUTES` 的 `queued/running/submitted/not_start` image task 会被 CAS 标记为 `failed`。
- 恢复策略不会重新执行旧任务，避免进程重启后重复调用上游和重复结算。
