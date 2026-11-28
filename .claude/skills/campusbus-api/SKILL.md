---
name: campusbus-api
description: Load when editing apps/api/src route, auth, error-handling, or realtime gateway code.
---
- Throw DomainError (apps/api/src/domain/errors.ts). Validation failures use badRequest('INVALID_REQUEST', publicValidationMessage(err)) from apps/api/src/domain/validationMessage.ts. Never return raw zod text.
- ZodError is mapped to INVALID_REQUEST in apps/api/src/http/app.ts. Do not add a second mapping.
- Access tokens carry a sid claim. Sign with signAccessToken(p, secret, ttl, sessionId).
- Every authenticated route depends on deps.isSessionActive(principal.sessionId). Keep it when refactoring the auth middleware.
- Revocations take a RevocationReason (LOGOUT, REVOKED, REUSE). Logged-out tokens must not trigger REUSE.
- createGateway deps must include isSessionActive.
