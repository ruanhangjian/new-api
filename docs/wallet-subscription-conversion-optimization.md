# Wallet Subscription Conversion Optimization

## Summary

This change optimizes the wallet subscription purchase experience for better conversion and usability. The wallet page now prioritizes subscription plans, shows a compact four-card desktop layout, keeps recharge and subscription status visible, and supports configurable selling points for subscription plans.

## User-Facing Changes

- Reworked the wallet page layout so subscription plans are prominent on desktop while mobile keeps the order: stats, current subscription, plans, quick recharge, more services.
- Updated subscription plan cards with compact pricing-card styling, hover highlight, visible quota details, and a `Valid for {{duration}}` display such as `30天有效期`.
- Preserved four visible subscription cards on desktop while keeping text readable and avoiding truncated quota values.
- Added a subscription history drawer from the "My Subscriptions" panel.
- Updated recharge copy to "Quick Recharge" and tightened recharge amount card spacing.
- Removed renewal-specific UI and kept purchase behavior on the existing `plan_id` flow.

## Data And Admin Changes

- Added `selling_points` to subscription plans.
- Added admin create/edit support for one selling point per line.
- Public and admin subscription plan responses now include the new field through the existing plan model.
- Wallet subscription cards split `selling_points` by line and fall back to a default selling point when empty.

## Quota Display Logic

- Daily quota displays the backend configured plan quota amount.
- Subscription total quota uses the plan duration and reset period:
  - `never` reset or invalid reset config uses the configured quota as-is.
  - `daily`, `weekly`, `monthly`, and `custom` reset periods multiply the configured quota by `ceil(duration / resetPeriod)`.
  - Unlimited quota remains unlimited.
- The purchase dialog and wallet cards share the same total quota calculation.

## Verification

- Frontend quota calculation tests passed.
- Frontend TypeScript typecheck passed.
- Frontend production build passed.
- `git diff --check` passed.
- Go tests were not run because the local environment did not have `go` or `gofmt` available.
