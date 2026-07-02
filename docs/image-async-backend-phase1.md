# 生图工坊 Phase 1 后端异步文生图 MVP

## 范围

本阶段只支持文生图异步任务：

- `POST /v1/images/generations?async=true`
- `GET /v1/images/tasks/:task_id`
- `GET /v1/images/tasks/:task_id/files/:file_id`

不带 `async=true` 的 `POST /v1/images/generations` 仍走原同步图片 relay。

## 任务与权限

异步任务复用 `model.Task`，平台为 `image`，动作为 `images.generations`。轮询和文件访问都必须通过 `/v1` API token 鉴权，并校验：

- task 属于当前 token 的用户。
- 如果任务记录了 `token_id`，当前 token 必须与任务 token 一致。
- 文件只允许访问 completed 任务中的未过期文件。

## Worker 执行

入队阶段只保存请求快照并返回 `202`，不预扣费。后台 worker 重建内部请求上下文，去掉 `async` 参数后复用现有 `Distribute + Relay(OpenAIImage)` 链路，因此渠道选择、请求转换、计费和日志仍走 NewAPI 现有实现。

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

任务结果只保存内部受控 URL，不保存大段 base64。默认 TTL 为 6 小时，可通过环境变量调整，最大建议 24 小时：

- `IMAGE_WORKSHOP_ROOT`
- `IMAGE_WORKSHOP_RESULT_TTL_HOURS`
- `IMAGE_WORKSHOP_RESULT_TTL_MAX_HOURS`
- `IMAGE_WORKSHOP_CACHE_MAX_GB`
- `IMAGE_WORKSHOP_MIN_FREE_GB`

提交异步任务时会触发一次后台清理：删除过期文件，并在缓存超过上限或磁盘空闲低于水位时按最旧文件清理。
