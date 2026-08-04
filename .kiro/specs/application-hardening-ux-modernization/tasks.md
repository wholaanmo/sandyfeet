# Implementation Plan: Application Hardening and UX Modernization

## Overview

Implement the approved JavaScript design incrementally, preserving active URLs and legacy Firestore compatibility while moving authority to server boundaries. The rollout is ordered P0 → P1 → P2: establish verification and trusted foundations, close security and transaction gaps, modernize shared UX contracts, then consolidate visual consistency. Each migration step must be reversible through compatibility adapters, feature/configuration gates, dry-run reconciliation, and explicit release evidence.

## Tasks

- [x] 1. Establish P0 verification, server, and route foundations
  - [x] 1.1 Configure the one-shot verification toolchain
    - Pin and configure Vitest, fast-check, React Testing Library, user-event, jest-axe, Firebase emulators/Rules tests, and Playwright using the repository lockfile; add non-watch scripts for lint, build, unit, property, integration, and browser suites.
    - Add test environment separation, deterministic fixtures/seeds, failure seed retention, and forbidden server-import/sensitive-token scans.
    - _Requirements: 15.1, 15.5, 15.6, 15.7, 15.10_
  - [x] 1.2 Implement trusted server bootstrap and safe diagnostics
    - Create strict environment parsing, fail-fast Firebase Admin initialization, `server-only` guards, correlation-ID propagation, stable response envelopes, sensitive-response cache policy, and recursive redacted logging.
    - Ensure production configuration cannot silently fall back and secret values are never emitted.
    - _Requirements: 2.5, 2.6, 3.10, 8.9, 8.10_
  - [x]* 1.3 Write the property test for recursive log redaction
    - **Property 14: Sensitive values never survive log redaction**
    - Generate nested values and credential patterns while asserting safe correlation metadata remains.
    - **Validates: Requirements 3.10, 8.10**
  - [x] 1.4 Implement the canonical route registry and request policy layer
    - Create `lib/routes/manifest.js`, discovery/coverage validation, match/build/landing/return-path helpers, the Next.js 16 request-proxy replacement for `middleware.js`, protected server layout guards, role-aware `not-found.js`/`error.js`, `/calendar`, `/check-in`, `/dashboard`, and slug-preserving legacy redirect behavior.
    - Treat missing baseline routes, unclassified routes, dead destinations, duplicate patterns, unsupported methods, and redirect cycles as build failures; keep final authorization in server layouts and handlers.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.10, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11_
  - [x]* 1.5 Write the property test for the authoritative access matrix
    - **Property 1: Authoritative route access matrix**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.7, 1.10, 4.2, 4.3, 4.4, 15.2**
  - [x]* 1.6 Write the property test for safe authorization recovery
    - **Property 2: Authentication and authorization recovery is safe**
    - **Validates: Requirements 1.5, 1.6, 4.5**
  - [x]* 1.7 Write the property test for return-path normalization
    - **Property 3: Return-path normalization rejects untrusted destinations**
    - **Validates: Requirements 4.11**
  - [x]* 1.8 Write the property test for generated navigation
    - **Property 4: Generated navigation always resolves**
    - **Validates: Requirements 4.6, 4.7, 4.8**
  - [x]* 1.9 Write route-registry and recovery example tests
    - Cover manifest discovery, `/dashboard`, `/calendar`, `/check-in`, `/room/[slug]`, unknown pages, render failures, redirect cycles, API methods, and safe role/public recovery links.
    - _Requirements: 4.1, 4.4, 4.6, 4.7, 4.8, 4.9, 4.10, 15.2_

- [x] 2. Close P0 authentication, API, and credential boundaries
  - [x] 2.1 Implement server-authoritative sessions and authorization
    - Add ID-token exchange at `/api/auth/session`, `__Host-sf_session` cookie creation/clearing, revocation-aware `resolveSession`, authoritative account/role/status resolution, `requireActor`/`requireRole`/`requireOwner`, `/api/auth/me`, sign-out, and session revocation on deactivation or sensitive changes.
    - Remove authorization dependence on script-readable tokens, role/UID/expiry cookies, and client-supplied actor fields while retaining a temporary display-only compatibility adapter.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 1.8, 1.9, 1.10_
  - [x] 2.2 Implement the reusable API boundary and abuse controls
    - Create `withApiBoundary` with method/media/body-size checks, strict schemas, malformed-body handling, session/role policy, same-origin mutation checks, operation-specific HMAC-keyed transactional rate limits, stable errors, DTO projection, deadlines, no-store policy, and correlation propagation.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.9, 8.9_
  - [x] 2.3 Implement secure credential and password lifecycles
    - Add cryptographically secure issuance, keyed digest storage with key IDs, purpose/user/subject/device/expiry/attempt binding, generic invalid results, account-neutral lookup, trusted-origin links, shared password schema, and atomic consume-with-mutation behavior.
    - Migrate reset, email, device, guest, and staff verification handlers to the service without logging raw credentials.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11_
  - [x] 2.4 Replace open email and chatbot requests with bounded commands
    - Replace `/api/send-email` payload control with predefined server-owned operations/templates/recipients; implement chatbot message/history normalization and route both through authenticated/rate-limited policies as applicable.
    - _Requirements: 2.3, 2.7, 2.8, 3.9, 14.7_
  - [x]* 2.5 Write the property test for strict API schemas
    - **Property 5: API schemas form the request boundary**
    - **Validates: Requirements 2.1, 15.4**
  - [x]* 2.6 Write the property test for mutation origins
    - **Property 6: Authenticated mutation origins are same-origin**
    - **Validates: Requirements 2.4**
  - [x]* 2.7 Write the stateful property test for rate limits
    - **Property 7: Rate limiting respects operation quotas**
    - **Validates: Requirements 2.3**
  - [x]* 2.8 Write the property test for server-owned email delivery
    - **Property 8: Email commands cannot control delivery templates**
    - **Validates: Requirements 2.7, 3.9**
  - [x]* 2.9 Write the property test for bounded chatbot normalization
    - **Property 9: Chatbot input normalization is bounded**
    - **Validates: Requirements 2.8, 14.7**
  - [x]* 2.10 Write the property test for credential bindings
    - **Property 10: Credential validity requires every binding**
    - **Validates: Requirements 3.3, 3.4, 3.5**
  - [x]* 2.11 Write the property test for indistinguishable credential failures
    - **Property 11: Invalid credential states are publicly indistinguishable**
    - **Validates: Requirements 3.7**
  - [x]* 2.12 Write the property test for neutral account lookup
    - **Property 12: Account lookup responses are neutral**
    - **Validates: Requirements 3.8**
  - [x]* 2.13 Write the property test for the canonical password policy
    - **Property 13: Password policy is enforced for every accepted password**
    - **Validates: Requirements 3.11**
  - [x]* 2.14 Write Firebase/API integration tests for auth and credentials
    - Use isolated Auth/Firestore emulators to test cookie flags, expiry/revocation, inactive/unverified accounts, role changes, missing/malformed/forged/wrong-role credentials, origin/media/method/body failures, quota boundaries, digest-only storage, attempt exhaustion, and one-winner atomic consumption.
    - _Requirements: 1.1–1.10, 2.1–2.8, 3.1–3.11, 15.3, 15.4_
  - [x] 2.15 Switch authentication surfaces through a reversible compatibility gate
    - Update login, account, session guard, dashboard HOCs/layouts, and sign-out flows to server sessions; add telemetry-safe detection of obsolete browser credentials and a rollback switch that restores only navigation compatibility, never client-authoritative access.
    - Remove legacy credential writes only after the access matrix passes.
    - _Requirements: 1.1, 1.6, 1.8, 1.9, 1.10, 4.4, 4.5_

- [x] 3. Enforce P0 ownership and atomic reservation integrity
  - [x] 3.1 Implement actor-scoped repositories and defense-in-depth Rules
    - Create server-only converters, operation-specific repository methods, owner/role/state checks, legacy email-to-UID resolution, allowlisted DTOs, non-disclosing misses, and Security Rules denying client writes to privileged fields and collections.
    - Restrict identity documents and payment evidence to authenticated, purpose-specific server projections.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_
  - [x] 3.2 Implement pure reservation policies and draft serialization
    - Create canonical occupancy statuses, resort-local date expansion, room/day-tour/exclusive demand aggregation, authoritative centavo pricing/totals, bounded transaction-size validation, and versioned booking-draft serialization with safe empty recovery.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.12, 6.13, 6.14_
  - [x] 3.3 Implement transactional reservation and idempotency services
    - Add deterministic per-date capacity ledgers and one-transaction create/edit/cancel operations for parent/child groups, ledger deltas, command-hash idempotency, audit/outbox hooks, exclusive locks, and unchanged-state failure semantics.
    - Revalidate account, dates, capacity, inventory, pricing, and payment prerequisites from authoritative records inside the operation.
    - _Requirements: 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12_
  - [x] 3.4 Build idempotent ledger migration and reconciliation safeguards
    - Add dry-run/backfill/reconcile commands with schema/version markers, resumable checkpoints, discrepancy reports, transaction-budget limits, dual-read legacy compatibility, canonical-only writes, and an adapter rollback path that never silently rewrites reservations.
    - Require server transaction paths to pass before generating the Rules-tightening release artifact.
    - _Requirements: 5.8, 6.1, 6.6, 6.8, 6.9, 6.11, 15.8, 15.15_
  - [x]* 3.5 Write the property test for trusted ownership and permissions
    - **Property 15: Ownership and role permissions depend only on trusted context**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
  - [x]* 3.6 Write the property test for least-privilege projections
    - **Property 16: Data and outbound projections disclose only approved fields**
    - **Validates: Requirements 5.6, 5.7, 14.1**
  - [x]* 3.7 Write the property test for occupancy dates and statuses
    - **Property 17: Occupancy policy and room date boundaries are canonical**
    - **Validates: Requirements 6.1, 6.2**
  - [x]* 3.8 Write the property test for category capacity and exclusivity
    - **Property 18: Capacity aggregation preserves category totals and exclusivity**
    - **Validates: Requirements 6.3, 6.4, 15.5**
  - [x]* 3.9 Write the property test for authoritative reservation totals
    - **Property 19: Reservation values are derived from authoritative inputs**
    - **Validates: Requirements 6.5, 6.12, 15.5**
  - [x]* 3.10 Write the property test for booking-draft round trips
    - **Property 20: Equivalent booking drafts round trip**
    - **Validates: Requirements 6.13, 15.6**
  - [x]* 3.11 Write the property test for malformed draft recovery
    - **Property 21: Invalid booking-draft storage always recovers**
    - **Validates: Requirements 6.14, 15.7**
  - [x]* 3.12 Write the model-based property test for idempotent effects
    - **Property 22: Idempotent retries have one business effect**
    - **Validates: Requirements 6.10, 7.4, 15.9**
  - [x]* 3.13 Write repository, Rules, migration, and reservation integration tests
    - Verify ownership/role matrices, protected-field denial, evidence access, forced transaction rollback, last-capacity concurrency, exclusive locks, atomic group create/edit/cancel, idempotency conflict, dry-run/resume behavior, and reconciliation that reports without mutating discrepancies.
    - _Requirements: 5.1–5.9, 6.6–6.11, 15.8, 15.15_

- [x] 4. Close P0 payment, refund, check-in, audit, and privileged-write gaps
  - [x] 4.1 Implement canonical state machines, audit construction, and notification outbox records
    - Define payment/refund/reservation/check-in adjacency maps and guards, canonical legacy mappings, immutable server-derived audit projections, retry correlation, and transactional outbox records with minimal payloads.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.9, 7.10, 7.11, 14.11_
  - [x] 4.2 Implement atomic payment and refund services
    - Commit authorized transition, authoritative balance/evidence changes, idempotency result, audit event, and eligible notification outbox entry as one transaction; reject ineligible refunds without notification.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.9, 7.11_
  - [x] 4.3 Implement check-in issuance and consumption
    - Issue digest-backed, purpose/interval/reservation-bound credentials; generate QR locally with only an approved Sandyfeet URL; add the active consumption route and atomically consume, transition applicable group records, and audit.
    - _Requirements: 4.7, 7.6, 7.7, 7.8, 7.9, 14.3_
  - [x] 4.4 Migrate privileged browser writes to server commands
    - Replace direct client Firestore mutations for guest profiles, reservations, payments, refunds, check-in, staff/admin actions, and audits with validated APIs/server actions and projected responses.
    - Keep read adapters only where permitted, gate each surface independently, and remove obsolete writers only after its server path and rollback adapter pass.
    - _Requirements: 1.10, 5.1–5.9, 6.5–6.12, 7.2–7.11_
  - [x]* 4.5 Write the property test for business transitions
    - **Property 23: Business state machines permit only declared transitions**
    - **Validates: Requirements 7.1, 7.2, 7.6, 7.8**
  - [x]* 4.6 Write the property test for trusted audit events
    - **Property 24: Audit events derive complete trusted context**
    - **Validates: Requirements 7.9, 7.11**
  - [x]* 4.7 Write critical-workflow transaction integration tests
    - Verify every allowed/forbidden edge, audit atomicity/immutability, idempotent financial effects, ineligible refund suppression, one-winner check-in consumption, outbox creation, and provider failure after a committed business mutation.
    - _Requirements: 7.1–7.11, 14.11, 15.9, 15.10_
  - [x]* 4.8 Write the P0 route and browser access matrix
    - Drive every active page/API as unauthenticated, guest, staff, and admin actors; cover missing, expired, malformed, forged, wrong-role, and valid sessions plus denial recovery, critical navigation, and sign-out.
    - _Requirements: 1.1–1.10, 4.1–4.11, 15.2, 15.3_

- [x] 5. P0 checkpoint — verify trusted boundaries and transactional integrity
  - Ensure all tests pass, ask the user if questions arise.
  - Do not advance to P1 while route coverage (including `/calendar` and `/check-in`), P0 access, Rules, concurrency, idempotency, migration dry-run, rollback-adapter, or audit atomicity checks fail.

- [x] 6. Apply P1 browser policy and external-service resilience
  - [x] 6.1 Implement nonce-based browser security policy with staged enforcement
    - Add documented CSP source directives, HSTS in production, frame denial, `nosniff`, strict referrer policy, restrictive permissions policy, and header/cache tests; support report-only collection before an explicit enforcement gate.
    - Keep a scoped rollback from enforced to report-only without removing the other security headers.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.9, 15.15_
  - [x] 6.2 Implement safe content and external-destination boundaries
    - Encode user content by context, parse chatbot rich text into the documented inert AST, prohibit raw HTML, and enforce HTTPS/exact normalized host/provider/purpose allowlists with response schema/size checks.
    - _Requirements: 2.9, 8.7, 8.8, 14.1, 14.2, 14.5, 14.8_
  - [x] 6.3 Implement resilient provider adapters, outbox delivery, and chatbot fallback
    - Add minimal DTOs, deadlines/abort, bounded retry/circuit behavior, leased outbox claims, duplicate-delivery protection, retry state independent of business commits, local chatbot fallback, action-boundary redirection, and reset confirmation.
    - _Requirements: 2.6, 14.1, 14.2, 14.4, 14.5, 14.6, 14.9, 14.10, 14.11_
  - [x]* 6.4 Write the property test for inert rendering
    - **Property 25: Safe rendering cannot create executable content**
    - **Validates: Requirements 2.9, 8.7, 14.5, 14.8**
  - [x]* 6.5 Write the property test for exact external approval
    - **Property 26: External destinations require exact approval**
    - **Validates: Requirements 8.8, 14.2**
  - [x]* 6.6 Write the property test for chatbot action boundaries
    - **Property 31: Chatbot action boundaries cannot trigger business mutations**
    - **Validates: Requirements 14.9**
  - [x]* 6.7 Write browser-policy and provider integration tests
    - Assert all required headers/directives and no-store mappings; mock timeout, rejection, malformed/oversized content, provider exhaustion, local fallback, outbox lease/retry, and inert rendered output; limit configured-provider checks to one to three controlled examples.
    - _Requirements: 8.1–8.10, 14.1–14.11, 15.10, 15.15_

- [x] 7. Build P1 accessible, responsive, motion, and async contracts
  - [x] 7.1 Create semantic interaction and presentation foundations
    - Add accessible base tokens for focus, contrast, control size, spacing, typography roles, live announcements, and transition timing plus `Button`, `FormField`, `LiveRegion`, `AsyncRegion`, and image contracts.
    - _Requirements: 9.1, 9.2, 9.4, 9.5, 9.6, 9.9, 9.12, 9.13, 9.14, 10.3, 10.9, 11.2, 11.8_
  - [x] 7.2 Implement accessible overlays, navigation, calendar, and tables
    - Create stack-aware dialog/popover/menu focus containment and restoration, background inertness, Escape behavior, named calendar keyboard navigation/states, `aria-current` navigation, and labeled responsive-table alternatives.
    - _Requirements: 9.2, 9.3, 9.7, 9.8, 9.10, 9.11, 10.4, 10.8_
  - [x] 7.3 Implement responsive layout contracts
    - Add no-two-axis-overflow/reflow rules, 44×44 targets or spacing, viewport-contained overlays, collapsing dashboard navigation below 1024px, resize-state preservation, virtual-keyboard reachability, table scrolling, and responsive image sizing/dimensions.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_
  - [x] 7.4 Implement the shared motion system
    - Apply 100–300ms duration/easing tokens, continuity-preserving transitions, reduced-motion removal of prohibited effects, immediate non-motion feedback, pause/focus-within controls, stable target positions, and non-blocking progress.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_
  - [x] 7.5 Implement async reducer, mutation controller, and reconciliation
    - Model idle/pending/success/empty/partial/error/reconciling phases, 300ms delayed labels, duplicate-submit prevention, valid-input and primary-data preservation, targeted retry, route error/not-found distinction, persistent idempotency keys, navigation reconciliation, and affected-view invalidation.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10_
  - [x]* 7.6 Write the property test for async phase timing
    - **Property 28: Async phases are distinct and time-correct**
    - **Validates: Requirements 13.1, 13.3, 15.14**
  - [x]* 7.7 Write the property test for async failure and retry
    - **Property 29: Async failure and retry preserve usable state**
    - **Validates: Requirements 13.4, 13.5, 13.8, 15.14**
  - [x]* 7.8 Write the property test for mutation de-duplication and reconciliation
    - **Property 30: Async mutations de-duplicate and reconcile effects**
    - **Validates: Requirements 13.2, 13.6, 13.9, 13.10, 15.14**
  - [x]* 7.9 Write semantic component and async-state tests
    - Use Testing Library/user-event and axe for accessible names, labels/errors, focus order/trap/restore, overlay stacks, live regions, calendar keys, navigation current state, image alternatives, loading/empty/error/partial/retry/reconciling/success states, and chatbot reset confirmation.
    - _Requirements: 9.1–9.14, 13.1–13.10, 14.10, 15.11, 15.14_
  - [x]* 7.10 Write the responsive, accessibility, and motion browser matrix
    - Run representative workflows at 320, 375, 768, 1024, and 1440px plus automated/manual-compatible 200%/400% reflow; assert overflow, reachability, touch targets, overlay containment, resize state, tables, image stability, keyboard paths, contrast tokens, reduced motion, pause behavior, and 100–300ms normal motion.
    - _Requirements: 9.1–9.14, 10.1–10.9, 11.1–11.8, 15.11, 15.12, 15.13_

- [x] 8. Migrate P1 application surfaces to shared server and UX contracts
  - [x] 8.1 Migrate reservation, payment, refund, and check-in surfaces first
    - Wire critical forms, calendars, evidence states, confirmations, totals, async recovery, idempotency continuity, accessibility, responsive layout, and reduced motion to committed server results without changing active URLs.
    - _Requirements: 6.5, 6.10, 6.12, 7.2–7.8, 9.1–9.14, 10.1–10.9, 11.1–11.8, 13.1–13.10_
  - [x] 8.2 Migrate authentication, verification, account, and guest-booking surfaces
    - Apply shared fields/errors, neutral credential feedback, live announcements, route-safe recovery, preserved valid input, responsive behavior, and session-based identity display.
    - _Requirements: 1.5, 1.8, 3.4–3.11, 9.1–9.14, 10.1–10.9, 13.1–13.10_
  - [x] 8.3 Migrate admin and staff dashboards
    - Replace remaining privileged readers/writers, apply role-correct navigation/labels, accessible responsive tables/overlays/calendars, partial-data recovery, and collapsed navigation without covering content.
    - _Requirements: 1.2, 1.3, 5.3, 5.4, 9.1–9.14, 10.1–10.9, 12.6, 13.1–13.10_
  - [x] 8.4 Migrate public pages and chatbot
    - Apply semantic landmarks/controls, image alternatives and dimensions, safe chatbot formatting/fallback/action redirects, reset confirmation, live-log behavior, touch targets, responsive reflow, and reduced motion.
    - _Requirements: 8.7, 9.1–9.14, 10.1–10.9, 11.1–11.8, 13.1–13.10, 14.5, 14.6, 14.8, 14.9, 14.10_
  - [x]* 8.5 Write representative end-to-end role journeys and internal-link crawling
    - Cover public, guest, booking/payment/check-in, account, staff, admin, and chatbot success/denial/recovery/sign-out flows; crawl internal links against the manifest and distinguish not-found from route errors.
    - _Requirements: 4.4–4.10, 9.3, 13.4–13.9, 15.2, 15.11, 15.12, 15.13, 15.14_
  - [x]* 8.6 Write layout-stability and state-continuity regression tests
    - Verify responsive image reservation, no layout shifts from delayed async states, no lost valid input on resize/navigation/error, and no duplicate business effect across retry/reconciliation.
    - _Requirements: 10.6, 10.9, 11.6, 13.2, 13.4, 13.9, 13.10, 15.12, 15.17_

- [x] 9. Encode migration, rollback, CI, and controlled-runtime release gates
  - [x] 9.1 Implement a stage-aware migration and rollback orchestrator
    - Encode ordered gates for server path → dry-run/backfill → reconciliation → Rules restriction → client-writer removal → CSP enforcement → adapter removal, with resumable state, schema-version checks, precondition assertions, immutable discrepancy output, and reversible configuration per stage.
    - Prevent destructive rollback of committed canonical business data; rollback may restore compatible reads/navigation or CSP report-only mode, not unsafe client authority.
    - _Requirements: 5.8, 6.6, 6.11, 8.1, 15.8, 15.15_
  - [x] 9.2 Build automated controlled-environment smoke checks
    - Add bounded scripts for parsed configuration without values, deployed Rules owner/role outcomes, security headers/CSP, protected routes, provider permissions/timeouts/minimal fields, email/reset/check-in link resolution, local QR boundary, and representative audit creation/immutability.
    - _Requirements: 4.6, 4.7, 5.8, 7.9, 7.10, 8.1–8.10, 14.1–14.5, 15.15_
  - [x] 9.3 Implement structured runtime evidence recording
    - Validate `passed|failed|unverified` records with build/environment/tool/evidence metadata; require blocker, dependency, owner, and follow-up for `unverified`; redact secrets and support keyboard, screen-reader, contrast, reflow, touch, reduced-motion, route-load, interaction, image, layout-stability, and animation evidence.
    - _Requirements: 15.16, 15.17, 15.18_
  - [x] 9.4 Wire dependency-ordered CI and release gates
    - Run scans/lint, unit/property, emulator integration/Rules, production build/manifest coverage, Playwright matrices, and controlled smoke checks as one-shot jobs; block promotion on failures or waived P0 evidence.
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 15.11, 15.12, 15.13, 15.14, 15.15, 15.18_
  - [x]* 9.5 Write migration-forward and rollback integration tests
    - Exercise interrupted/resumed backfills, repeated dry runs, version mismatch, reported discrepancies, compatibility reads, canonical-only writes, Rules gating, per-surface feature rollback, CSP report-only fallback, and prohibition of unsafe authority restoration.
    - _Requirements: 5.8, 6.6, 6.11, 8.1, 15.8, 15.15, 15.18_
  - [x]* 9.6 Write runtime smoke and evidence-schema tests
    - Use safe representative fixtures to verify smoke failure categories and correlation, prove `passed` requires evidence, prove incomplete checks become `unverified` rather than passed, and reject evidence records containing sensitive fields.
    - _Requirements: 3.10, 8.10, 15.15, 15.16, 15.17, 15.18_

- [x] 10. P1 checkpoint — verify hardened behavior and modernized workflows
  - Ensure all tests pass, ask the user if questions arise.
  - Do not advance to P2 while browser security enforcement, external fallback, representative role journeys, accessibility/responsive/reduced-motion matrices, async recovery, migration rollback, or runtime-evidence gates fail or leave a P0 item unverified.

- [x] 11. Complete P2 visual and component consistency
  - [x] 11.1 Implement the complete design-token and formatter contracts
    - Consolidate typography, semantic color, spacing, radii, elevation, control size, interaction states, and motion tokens; create canonical role, PHP money, resort date/time, booking-ID, and reservation-status formatters.
    - Add static validation that rejects invalid tokens and undocumented one-off color/typography roles.
    - _Requirements: 12.1, 12.3, 12.4, 12.6, 12.7, 12.8_
  - [x]* 11.2 Write the property test for canonical labels and formatting
    - **Property 27: Canonical role and data formatting is total**
    - **Validates: Requirements 12.6, 12.7**
  - [x] 11.3 Consolidate all surfaces onto shared component contracts
    - Replace remaining one-off modal, form, navigation, card, table, badge, notification, empty-state, action, and status styles while preserving the verified server, accessibility, responsive, motion, and async behavior from P0/P1.
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6, 12.8_
  - [x]* 11.4 Write visual consistency and token-regression tests
    - Snapshot documented component states and formatter examples; scan production surfaces for invalid tokens/one-off roles and run focused visual regressions across public, guest, staff, admin, modal, and chatbot surfaces.
    - _Requirements: 12.1–12.8, 15.11, 15.17_

- [x] 12. Final P2 checkpoint — verify the complete rollout
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm all 31 property tests run with retained seeds/counterexamples, every requirement has automated or explicit runtime evidence, all migration discrepancies are resolved or blocking, compatibility adapters have evidence-backed removal gates, and no unverified item is represented as passed.

## Notes

- Tasks marked with `*` are optional test tasks and may be skipped for a faster MVP; P0 release gates still cannot be represented as passing without their required evidence.
- Every correctness property from the approved design has exactly one dedicated fast-check task; use at least 100 successful runs and 500–1,000 for security parsers, URL normalization, serialization, and redaction when CI runtime permits.
- Property tests must include the design-specified feature/property tag, print seeds, and retain minimized counterexamples. Real Firebase/provider/browser behavior belongs in bounded integration, browser, or controlled-runtime checks rather than generated high-volume tests.
- Migration tasks create and validate code/scripts only; production deployment, production data migration, provider reconfiguration, credential rotation, and final visual approval remain outside this plan.
- Rollback restores compatible adapters or policy modes, never browser-authoritative roles, privileged client writes, raw credentials, duplicate financial effects, or destructive reversal of committed canonical records.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4"] },
    { "id": 2, "tasks": ["1.3", "1.5", "1.6", "1.7", "1.8", "1.9"] },
    { "id": 3, "tasks": ["2.1", "2.2"] },
    { "id": 4, "tasks": ["2.3", "2.4"] },
    { "id": 5, "tasks": ["2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "2.13"] },
    { "id": 6, "tasks": ["2.14"] },
    { "id": 7, "tasks": ["2.15"] },
    { "id": 8, "tasks": ["3.1", "3.2"] },
    { "id": 9, "tasks": ["3.3"] },
    { "id": 10, "tasks": ["3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "3.11", "3.12"] },
    { "id": 11, "tasks": ["3.13"] },
    { "id": 12, "tasks": ["4.1"] },
    { "id": 13, "tasks": ["4.2", "4.3"] },
    { "id": 14, "tasks": ["4.4", "4.5", "4.6"] },
    { "id": 15, "tasks": ["4.7", "4.8"] },
    { "id": 16, "tasks": ["6.1", "6.2"] },
    { "id": 17, "tasks": ["6.3", "6.4", "6.5"] },
    { "id": 18, "tasks": ["6.6", "6.7"] },
    { "id": 19, "tasks": ["7.1"] },
    { "id": 20, "tasks": ["7.2", "7.3", "7.4", "7.5"] },
    { "id": 21, "tasks": ["7.6", "7.7", "7.8"] },
    { "id": 22, "tasks": ["7.9", "7.10"] },
    { "id": 23, "tasks": ["8.1"] },
    { "id": 24, "tasks": ["8.2", "8.3"] },
    { "id": 25, "tasks": ["8.4"] },
    { "id": 26, "tasks": ["8.5", "8.6"] },
    { "id": 27, "tasks": ["9.1"] },
    { "id": 28, "tasks": ["9.2", "9.3"] },
    { "id": 29, "tasks": ["9.4"] },
    { "id": 30, "tasks": ["9.5", "9.6"] },
    { "id": 31, "tasks": ["11.1"] },
    { "id": 32, "tasks": ["11.2", "11.3"] },
    { "id": 33, "tasks": ["11.4"] }
  ]
}
```
