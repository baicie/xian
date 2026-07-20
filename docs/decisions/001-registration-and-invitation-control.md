# ADR-001: Registration and invitation control

## Status

Accepted

## Date

2026-07-20

## Context

Private deployments need to prevent public account creation while preserving a usable first-run setup and administrator-managed onboarding.

## Decision

The instance exposes `open`, `invite_only`, and `admin_only` registration modes. An empty instance always permits exactly one bootstrap registration. Workspace invitations and account setup links use random tokens, store only SHA-256 digests, expire after seven days, and are consumed once under a database row lock.

Administrator actions write workspace audit records. Invitation and setup state is kept in PostgreSQL so multiple API instances enforce the same result.

## Consequences

- Closed instances remain deployable without a separate bootstrap command.
- Token delivery is manual until email delivery is implemented.
- PostgreSQL advisory and row locks are part of the authentication consistency model.
- Invalid registration mode values fail closed as `admin_only`.
