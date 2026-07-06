# User Profile Remark For Enterprise CDK Redeemer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-maintained account remark and show it as the preferred redeemer identity in enterprise CDK records.

**Architecture:** Add a dedicated `profile_remark` column on `users`, expose it through self profile APIs, and compute `used_user_display` in enterprise CDK redemption queries. The frontend adds one profile input and consumes the new display field with legacy fallbacks.

**Tech Stack:** Go, Gin, Gorm, SQLite test DB, React, TypeScript, Bun.

---

### Task 1: Backend Data And Profile API

**Files:**
- Modify: `model/user.go`
- Modify: `controller/user.go`
- Test: `controller/user_test.go` or nearest existing user controller test file

- [ ] Write a failing controller test proving `GET /api/user/self` returns `profile_remark`.
- [ ] Write a failing controller test proving `PUT /api/user/self` trims and saves `profile_remark`.
- [ ] Add `ProfileRemark string` to `model.User` with JSON, Gorm, and validation tags.
- [ ] Include `profile_remark` in `GetSelf` response data.
- [ ] Include `ProfileRemark` in `UpdateSelf` clean user update.
- [ ] Run the focused controller tests and confirm they pass.

### Task 2: Enterprise CDK Redeemer Display

**Files:**
- Modify: `model/enterprise_cdk_redemption.go`
- Test: `model/enterprise_cdk_test.go`

- [ ] Write failing model tests for redeemer display priority: profile remark, email, username.
- [ ] Add `UsedUserDisplay` to `EnterpriseCdkExportRow`.
- [ ] Select `used.profile_remark`, `used.email`, and `used.username` in the redemption row query.
- [ ] Compute `used_user_display` in SQL with `COALESCE(NULLIF(...))` or equivalent DB-compatible expression.
- [ ] Run the focused model tests and confirm they pass.

### Task 3: Frontend Profile And CDK Display

**Files:**
- Modify: `web/default/src/features/profile/types.ts`
- Modify: `web/default/src/features/profile/components/profile-settings-card.tsx` or an existing profile settings tab
- Modify: `web/default/src/features/enterprise-cdk/types.ts`
- Modify: `web/default/src/features/enterprise-cdk/index.tsx`
- Test: `web/default/src/features/enterprise-cdk/utils.test.ts`

- [ ] Add `profile_remark` to profile request and response types.
- [ ] Add an account remark input to personal profile settings and submit through `updateUserProfile`.
- [ ] Add `used_user_display` to `EnterpriseCdkCode`.
- [ ] Add a small display helper and tests for fallback order.
- [ ] Update the enterprise CDK detail table to use the helper.
- [ ] Run focused frontend tests and type/build checks.

### Task 4: Verification And Commit

**Files:**
- All touched files

- [ ] Run `git diff --check`.
- [ ] Run Go focused tests.
- [ ] Run frontend focused tests.
- [ ] Run available build/type checks.
- [ ] Check `git status --short`.
- [ ] Commit with a Chinese commit message.
