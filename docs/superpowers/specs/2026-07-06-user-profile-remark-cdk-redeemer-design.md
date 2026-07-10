# User Profile Remark For Enterprise CDK Redeemer Design

## Goal

企业负责人查看企业 CDK 兑换记录时，可以看到更容易对应到真实人员的兑换人信息。

## Scope

- 在个人资料中新增用户可维护的“账号备注”字段。
- 企业 CDK 兑换记录使用统一展示逻辑：账号备注优先，其次邮箱，最后用户名。
- CSV 导出和页面展示保持同一套兑换人展示规则。

## Out Of Scope

- 不复用现有 `users.remark` 字段。该字段已用于管理员内部备注，并且当前 `GetSelf` 会主动隐藏。
- 不新增“每个 CDK 分配给谁”的预分配备注能力。
- 不调整企业 CDK 权限、余额或批次创建逻辑。

## Data Model

在 `users` 表新增 `profile_remark` 字段：

- JSON 字段名：`profile_remark`
- 数据库列名：`profile_remark`
- 类型：`varchar(100)`
- 默认值：空字符串
- 校验：最长 100 字符

选择独立字段的原因是现有 `remark` 已经是管理员备注，复用会造成后台内部信息和用户自填信息混淆。

## API Behavior

`GET /api/user/self` 返回 `profile_remark`。

`PUT /api/user/self` 允许用户更新 `profile_remark`，并对输入做 trim 和长度校验。

企业 CDK 兑换记录返回新增字段：

- `used_user_display`

后端计算规则：

1. `used.profile_remark` 非空，显示 `used.profile_remark`
2. 否则 `used.email` 非空，显示 `used.email`
3. 否则 `used.username` 非空，显示 `used.username`
4. 否则前端兜底显示用户 ID 或 `-`

## Frontend Behavior

个人资料设置中新增“账号备注”输入项：

- 标签：账号备注
- 占位：例如：张三 / 市场部-李雷
- 说明：企业 CDK 兑换记录会优先显示该备注，留空则显示邮箱或用户名。

企业 CDK 批次详情页“兑换用户”列改为显示 `used_user_display`，并保留旧字段兜底。

## Testing

- 后端模型测试覆盖兑换人展示优先级。
- 后端控制器测试覆盖个人资料返回和更新 `profile_remark`。
- 前端测试覆盖企业 CDK 兑换人展示兜底函数。
- 运行相关 Go 测试和前端类型/构建检查。
