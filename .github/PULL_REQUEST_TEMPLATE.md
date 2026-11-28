## Summary

<!-- Describe what this PR changes and why. -->

## Linked Issue

Closes #

## Spec & Acceptance Criteria

<!-- List the spec file(s) in docs/specs/ and the AC-NNN-XX IDs covered by tests in this PR. -->

- Spec: `docs/specs/...`
- Acceptance criteria: `AC-NNN-XX`

## Verification

- [ ] `pnpm check` passes (`lint`, `format:check`, `typecheck`, `test`, `spec:coverage --strict`)
- [ ] `pnpm e2e` passes (required if `apps/web`, protocol, or game flow changed)
- [ ] 4-locale i18n keys added (`en`, `de`, `es`, `fr`) for any new or changed visible UI strings
- [ ] Same-origin only: no external runtime network requests, fonts, or trackers added
- [ ] No secrets, session tokens, room codes, nicknames, chat text, or secret words in logs or telemetry
- [ ] Documentation and `CHANGELOG.md` updated (if applicable)
