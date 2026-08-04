# Requirements Document

## Introduction

This specification defines the requirements for hardening and modernizing the Sandyfeet Resort Next.js App Router application. The feature covers security boundaries, route correctness, reservation and payment integrity, accessibility, responsive behavior, motion, visual consistency, asynchronous states, and regression protection. The requirements describe observable outcomes and defer implementation choices to the design phase.

## Repository Baseline

Static inspection covered active source and configuration under `app/`, `components/`, `lib/`, `middleware.js`, `next.config.mjs`, and `package.json`. `.git`, `.history`, `.next`, `node_modules`, dependency or generated output, and `.env` were excluded. No secret environment values were read.

Active public and guest pages are `/`, `/account`, `/day-tour`, `/day-tour/booking`, `/day-tour/calendar`, `/feedback`, `/guest-reset-password`, `/home`, `/login`, `/my-bookings`, `/reset-password`, `/room/[slug]`, `/rooms`, `/rooms/[slug]`, `/rooms/multi-room-booking`, and `/verify-staff`. `/room/[slug]` is a legacy redirect to `/rooms/[slug]`.

Active dashboard pages are `/dashboard`; admin pages under `/dashboard/admin/{archive,audit,calendar,calendar-daytour,calendars,day-tour,feedback,manage,overview,payment,reports,reservations,reservations/guest-profile,rooms,staff}`; and staff pages under `/dashboard/staff/{audit,availability,calendar,calendar-daytour,calendars,overview,payment,reservations,reservations/guest-profile,scanner}`.

Active API routes are `/api/admin/{create-user,send-id-request,send-move-date-notification,send-refund-notification}`, `/api/auth/{check-device,forgot-password,guest-forgot-password,guest-reset-password,resend-verification,reset-password,verify-device,verify-staff}`, `/api/chatbot`, `/api/checkin/generate-token`, `/api/download-qr`, `/api/send-email`, and `/api/verify-guest-email`.

Static findings that motivate the requirements include client-created session tokens stored in script-readable storage and cookies; middleware role decisions based on unsigned cookie values; incomplete admin and staff route lists; a redirect target at `/dashboard/staff/front-desk` that has no active page; generated `/check-in` links that have no active page; client-side staff verification and guest profile mutation; unauthenticated email, notification, and check-in endpoints; raw one-time tokens in data records and URLs; client-side availability checks followed by non-atomic writes; broad direct Firestore access; missing global security headers; no automated test script; inconsistent modal semantics; sub-44-pixel controls; and reduced-motion coverage limited to three global animations.

## Static-Verification Boundary

Static inspection cannot establish deployed Firestore Security Rules, environment-variable correctness, Firebase or SMTP permissions, external AI and QR service behavior, production network behavior, authorization outcomes against deployed data, browser rendering, color contrast, assistive-technology output, device responsiveness, or measured animation and performance results. Requirement 15 defines runtime verification for these areas.

## Glossary

- **Sandyfeet_Application**: The complete resort web application, including public, guest, staff, admin, and API surfaces.
- **User**: A person interacting with the Sandyfeet_Application.
- **Guest**: A User with a guest identity or a public visitor.
- **Staff_User**: An authenticated User assigned the staff Role.
- **Admin_User**: An authenticated User assigned the admin Role.
- **Role**: The server-authoritative access classification for a User.
- **Session**: A server-verifiable authenticated interaction period with an explicit expiration.
- **Identity_Token**: A signed credential whose issuer, audience, expiration, and User identity can be verified by the Sandyfeet_Application.
- **Protected_Route**: A page or API route that requires an authenticated Role or an authenticated Guest.
- **Public_Route**: A page or API route that permits unauthenticated access by design.
- **Authorization_Boundary**: The server-side control that authenticates a User and permits an operation based on Role, ownership, and resource state.
- **Authentication_Service**: The server-side behavior that authenticates Users and manages Sessions, passwords, email verification, and device verification.
- **Role_Landing_Page**: The first authorized dashboard page assigned to an authenticated Role.
- **Owned_Resource**: A data record associated with the authenticated Guest identity authorized to access the record.
- **API_Boundary**: The server-side entry point that validates and processes an HTTP request.
- **Validated_Input**: Request data that satisfies defined type, format, length, range, and allowlist constraints.
- **Rate_Limit**: A measurable limit on requests per client and operation during a defined interval.
- **One_Time_Token**: A cryptographically unpredictable credential with a defined purpose, expiration, attempt policy, and single-use lifecycle.
- **Sensitive_Data**: Authentication credentials, One_Time_Tokens, identity documents, payment evidence, personal data, or privileged configuration.
- **Routing_System**: The application behavior that resolves URLs, redirects Users, and handles missing or failed routes.
- **Canonical_Route_Manifest**: The authoritative classification of active pages and APIs by path, audience, Role, and fallback behavior.
- **Data_Access_Layer**: The controls governing reads and writes to application data.
- **Reservation_Service**: The application behavior that creates, updates, groups, cancels, and checks availability for room and day-tour reservations.
- **Booking_Group**: A reservation represented by multiple related booking records under one parent booking identifier.
- **Active_Occupancy_Status**: A reservation status that consumes room or day-tour capacity according to one canonical policy.
- **Transaction**: An all-or-nothing data operation that rejects conflicting concurrent changes.
- **Idempotency_Key**: A unique operation identifier that makes repeated equivalent requests produce one business effect.
- **State_Transition**: A permitted change from one defined business status to another defined business status.
- **Payment_Service**: The application behavior that records payment requests, evidence, balances, refunds, and payment statuses.
- **Check_In_Service**: The application behavior that issues and consumes credentials used to check in a reservation.
- **Audit_Service**: The application behavior that records privileged and business-critical actions.
- **Browser_Security_Policy**: The response-level controls for transport, content loading, framing, referrer disclosure, content types, and browser capabilities.
- **User_Interface**: The visible and interactive public, guest, staff, and admin experience.
- **Modal_System**: The shared behavior for dialogs, popovers, menus, and overlays.
- **Motion_System**: The shared behavior for transitions, animations, scrolling, and motion preferences.
- **Design_System**: The shared visual tokens and component rules for typography, color, spacing, sizing, elevation, and interaction states.
- **Async_State_System**: The shared presentation of loading, success, empty, error, and retry states for asynchronous operations.
- **Chatbot_Service**: The server and User_Interface behavior that accepts resort questions and returns bounded responses from configured sources.
- **External_Service**: A provider outside the Sandyfeet_Application, including Firebase, SMTP, AI, Cloudinary, and QR services.
- **Booking_Draft**: The guest-entered reservation state persisted between booking steps.
- **Booking_Draft_Serializer**: The application-owned conversion between a Booking_Draft and browser-storage data.
- **Equivalent_Booking_Draft**: A restored Booking_Draft with the same normalized dates, room selections, guest counts, payment selection, and allowed optional fields as the original Booking_Draft.
- **Verification_Suite**: Automated unit, property-based, integration, accessibility, route, and browser checks for the Sandyfeet_Application.
- **Supported_Viewport**: A viewport from 320 CSS pixels through 1440 CSS pixels wide at 100% through 400% zoom.
- **Reduced_Motion_Preference**: The operating-system or browser preference requesting reduced non-essential motion.
- **Interactive_Target**: A control activated by pointer, touch, keyboard, or assistive technology.
- **Assistive_Technology**: Software or hardware that presents or operates the User_Interface through speech, braille, magnification, alternative input, or related accessibility support.
- **Web_Content_Accessibility_Guidelines**: The W3C Web Content Accessibility Guidelines version 2.2 conformance criteria.
- **Same_Origin_Path**: An application path whose scheme, host, and port match the Sandyfeet_Application origin.
- **Correlation_Identifier**: A non-secret identifier that links diagnostics for one request or business operation.
- **CSS_Pixel**: The browser reference pixel used to measure layout and Interactive_Target dimensions.

## Requirements

### Requirement 1 — P0: Server-Authoritative Authentication and Authorization

**User Story:** As a resort operator, I want every protected surface to enforce authenticated roles on the server, so that forged browser state cannot grant privileged access.

#### Acceptance Criteria

1. WHEN a User requests a Protected_Route, THE Authorization_Boundary SHALL verify a valid Session or Identity_Token before returning protected content or performing an operation.
2. WHEN a Protected_Route requires an Admin_User, THE Authorization_Boundary SHALL verify the admin Role from a server-authoritative identity source.
3. WHEN a Protected_Route permits a Staff_User, THE Authorization_Boundary SHALL verify the staff or admin Role from a server-authoritative identity source.
4. WHEN a Protected_Route requires a Guest, THE Authorization_Boundary SHALL verify the authenticated Guest identity and the Guest account status.
5. IF authentication fails, THEN THE Authorization_Boundary SHALL return an unauthenticated response or redirect to `/login` with a Same_Origin_Path.
6. IF authorization fails, THEN THE Authorization_Boundary SHALL return a forbidden response or redirect the User to the Role_Landing_Page.
7. WHEN a Session expires, THE Authorization_Boundary SHALL reject the Session on the next protected request.
8. WHEN a User signs out or a Guest account becomes inactive, THE Authorization_Boundary SHALL invalidate subsequent protected access for the affected Session.
9. THE Sandyfeet_Application SHALL store privileged Session credentials in a form unavailable to application scripts.
10. THE Authorization_Boundary SHALL derive access decisions independently of client-supplied Role values, User identifiers, and expiration timestamps.

### Requirement 2 — P0: API Validation, Abuse Resistance, and Safe Responses

**User Story:** As a resort operator, I want every API request constrained and validated, so that malformed or abusive traffic cannot trigger unauthorized cost or data changes.

#### Acceptance Criteria

1. WHEN an API_Boundary receives request data, THE API_Boundary SHALL reject data that fails the defined type, format, length, range, or allowlist constraints.
2. WHEN an API_Boundary receives an unsupported HTTP method or media type, THE API_Boundary SHALL return the corresponding 4xx response.
3. WHEN an API request can send email, call an External_Service, verify a credential, or mutate data, THE API_Boundary SHALL apply a Rate_Limit defined for that operation.
4. WHEN an authenticated API request mutates data, THE API_Boundary SHALL validate the request origin or an equivalent request-forgery control.
5. IF a request body is malformed, THEN THE API_Boundary SHALL return a generic validation response without exposing stack traces, provider details, or Sensitive_Data.
6. IF an External_Service fails, THEN THE API_Boundary SHALL return a bounded service-error response and preserve a server-side Correlation_Identifier.
7. WHEN the `/api/send-email` route receives a request, THE API_Boundary SHALL permit only authenticated, predefined email operations with server-controlled recipients, subjects, and message templates.
8. WHEN the `/api/chatbot` route receives a request, THE API_Boundary SHALL enforce a maximum message length of 1,000 characters, a maximum of 10 validated history entries, and a Rate_Limit.
9. WHEN an API response includes User-provided content, THE API_Boundary SHALL encode the content for the response context.

### Requirement 3 — P0: Secure Credential and Verification Lifecycles

**User Story:** As a User, I want password, email, and device verification credentials protected, so that another person cannot reuse or redirect a verification flow.

#### Acceptance Criteria

1. WHEN the Authentication_Service creates a One_Time_Token, THE Authentication_Service SHALL generate the One_Time_Token with a cryptographically secure random source.
2. WHEN the Authentication_Service stores a One_Time_Token, THE Authentication_Service SHALL store a non-reversible token representation instead of the credential presented by the User.
3. WHEN the Authentication_Service validates a One_Time_Token, THE Authentication_Service SHALL bind the credential to one purpose, one User, one expiration, and one unconsumed state.
4. WHEN the Authentication_Service accepts a device-verification code, THE Authentication_Service SHALL verify that the pending User identity, email address, device fingerprint, and submitted User identity match.
5. IF a verification attempt reaches the defined failure limit, THEN THE Authentication_Service SHALL invalidate the pending credential and require a new credential.
6. WHEN a One_Time_Token succeeds, THE Authentication_Service SHALL consume the One_Time_Token atomically with the protected account change.
7. IF a One_Time_Token is expired, consumed, mismatched, or invalid, THEN THE Authentication_Service SHALL return the same generic failure category.
8. WHEN a password-reset or verification request names an account, THE Authentication_Service SHALL return an account-neutral response.
9. WHEN the Authentication_Service constructs a verification link, THE Authentication_Service SHALL use a configured trusted origin and an allowlisted destination path.
10. THE Authentication_Service SHALL exclude One_Time_Tokens, passwords, verification codes, and Identity_Tokens from application logs.
11. WHEN the Authentication_Service accepts a new password, THE Authentication_Service SHALL enforce the documented password policy on the server.

### Requirement 4 — P0: Complete and Correct Routing

**User Story:** As a User, I want every navigation action to reach an existing, authorized destination, so that the application does not expose protected pages or produce dead ends.

#### Acceptance Criteria

1. THE Routing_System SHALL classify every active page and API in the Repository Baseline within the Canonical_Route_Manifest.
2. WHEN a request targets any `/dashboard/admin` page or admin API, THE Routing_System SHALL apply the Admin_User authorization policy from the Canonical_Route_Manifest.
3. WHEN a request targets any `/dashboard/staff` page or staff API, THE Routing_System SHALL apply the Staff_User authorization policy from the Canonical_Route_Manifest.
4. WHEN an authenticated User requests `/dashboard`, THE Routing_System SHALL redirect the User to the Role_Landing_Page.
5. WHEN an unauthenticated User requests `/dashboard`, THE Routing_System SHALL redirect the User to `/login` with a Same_Origin_Path.
6. WHEN the Routing_System issues an internal navigation or redirect, THE Routing_System SHALL target an active route in the Canonical_Route_Manifest.
7. WHEN the Sandyfeet_Application creates a check-in URL, THE Routing_System SHALL target an active check-in route that accepts the generated credential.
8. WHEN a User requests `/room/[slug]`, THE Routing_System SHALL preserve the slug and redirect the User to `/rooms/[slug]`.
9. IF a User requests an unknown page, THEN THE Routing_System SHALL present a recovery page with links to the appropriate public or Role landing page.
10. IF a route fails during rendering, THEN THE Routing_System SHALL present a recoverable error state without exposing Sensitive_Data.
11. WHEN the Routing_System processes a return path, THE Routing_System SHALL accept only a Same_Origin_Path declared in the Canonical_Route_Manifest.

### Requirement 5 — P0: Data Ownership and Least-Privilege Access

**User Story:** As a Guest, I want personal, reservation, identity, and payment data restricted to authorized Users, so that other clients cannot read or alter my records.

#### Acceptance Criteria

1. WHEN a Guest reads an Owned_Resource, THE Data_Access_Layer SHALL verify that the authenticated Guest identity owns the requested resource.
2. WHEN a Guest mutates an Owned_Resource, THE Data_Access_Layer SHALL verify ownership and the permitted State_Transition before applying the mutation.
3. WHEN a Staff_User reads or mutates a resource, THE Data_Access_Layer SHALL enforce the permissions assigned to the staff Role.
4. WHEN an Admin_User reads or mutates a resource, THE Data_Access_Layer SHALL enforce the permissions assigned to the admin Role.
5. WHEN a client submits a document identifier, email address, User identifier, booking identifier, or parent booking identifier, THE Data_Access_Layer SHALL resolve authorization from the authenticated identity instead of trusting the submitted identifier.
6. WHEN the Data_Access_Layer returns a record, THE Data_Access_Layer SHALL include only fields required by the requesting surface.
7. IF a User lacks access to a record, THEN THE Data_Access_Layer SHALL return a forbidden or not-found response without confirming the record contents.
8. THE Data_Access_Layer SHALL restrict writes to Role fields, account status, email-verification state, audit records, One_Time_Tokens, payment state, and check-in state to authorized server operations.
9. THE Data_Access_Layer SHALL restrict identity documents and payment evidence to authenticated requests with an authorized business purpose.

### Requirement 6 — P0: Reservation Availability and Atomic Booking Integrity

**User Story:** As a Guest, I want reservation operations to preserve capacity and group consistency, so that concurrent bookings and partial failures cannot create invalid reservations.

#### Acceptance Criteria

1. THE Reservation_Service SHALL define one canonical set of Active_Occupancy_Status values for room and day-tour capacity calculations.
2. WHEN the Reservation_Service evaluates a room stay, THE Reservation_Service SHALL count occupied units for each local calendar date from check-in through the date before check-out.
3. WHEN the Reservation_Service evaluates a day-tour reservation, THE Reservation_Service SHALL count adults, children, and seniors for the selected local calendar date.
4. WHEN the Reservation_Service evaluates an exclusive-resort reservation, THE Reservation_Service SHALL apply the defined whole-resort room and tent capacity policy.
5. WHEN a Guest submits a reservation, THE Reservation_Service SHALL revalidate dates, capacity, account requirements, pricing inputs, and payment prerequisites against authoritative data.
6. WHEN the Reservation_Service creates a reservation, THE Reservation_Service SHALL reserve capacity and create all required reservation records within one Transaction.
7. IF concurrent reservation requests exceed remaining capacity, THEN THE Reservation_Service SHALL commit at most the requests that fit the remaining capacity.
8. WHEN the Reservation_Service creates a Booking_Group, THE Reservation_Service SHALL commit every child record and the parent relationship as one business operation.
9. WHEN the Reservation_Service edits or cancels a Booking_Group, THE Reservation_Service SHALL update every related record as one business operation.
10. WHEN the Reservation_Service receives a repeated mutation with the same Idempotency_Key, THE Reservation_Service SHALL return the original operation result without creating an additional business effect.
11. IF a reservation mutation fails, THEN THE Reservation_Service SHALL preserve the pre-operation reservation and capacity state.
12. WHEN the Reservation_Service calculates price, down payment, remaining balance, room count, night count, or guest count, THE Reservation_Service SHALL derive the value from authoritative reservation inputs.
13. WHEN the Booking_Draft_Serializer serializes and then deserializes a valid Booking_Draft, THE Booking_Draft_Serializer SHALL produce an Equivalent_Booking_Draft.
14. IF the Booking_Draft_Serializer receives malformed or unsupported browser-storage data, THEN THE Booking_Draft_Serializer SHALL discard the data and return a recoverable empty draft state.

### Requirement 7 — P0: Payment, Refund, Check-In, and Audit Integrity

**User Story:** As a resort operator, I want critical workflows to follow explicit state rules and leave trustworthy records, so that financial and check-in actions are consistent and traceable.

#### Acceptance Criteria

1. THE Payment_Service SHALL define permitted State_Transition values for payment requests, payment evidence, balances, cancellations, and refunds.
2. WHEN a User requests a payment State_Transition, THE Payment_Service SHALL verify the authorized Role, current state, reservation state, and required evidence.
3. WHEN the Payment_Service applies a payment or refund State_Transition, THE Payment_Service SHALL apply the state change and corresponding audit record as one business operation.
4. WHEN the Payment_Service receives a repeated payment or refund operation with the same Idempotency_Key, THE Payment_Service SHALL preserve one financial business effect.
5. IF a refund notification is requested for an ineligible reservation state, THEN THE Payment_Service SHALL reject the request without sending the notification.
6. WHEN the Check_In_Service creates a check-in credential, THE Check_In_Service SHALL bind the credential to one eligible reservation, one validity interval, and one unconsumed state.
7. WHEN the Check_In_Service consumes a check-in credential, THE Check_In_Service SHALL mark the credential consumed and transition the reservation atomically.
8. IF a check-in credential is expired, consumed, invalid, or bound to an ineligible reservation, THEN THE Check_In_Service SHALL reject the check-in attempt.
9. WHEN an Admin_User or Staff_User performs a privileged or business-critical action, THE Audit_Service SHALL record the verified actor, Role, action, target, reason when required, timestamp, Correlation_Identifier, and before-and-after state.
10. THE Audit_Service SHALL preserve audit records from client modification and deletion.
11. WHEN a business operation is retried, THE Audit_Service SHALL correlate retry records with the original Idempotency_Key.

### Requirement 8 — P1: Browser and Application Security Policy

**User Story:** As a User, I want browser-facing responses and rendered content hardened, so that common injection, framing, transport, and data-disclosure risks are reduced.

#### Acceptance Criteria

1. THE Browser_Security_Policy SHALL restrict executable scripts, styles, fonts, images, frames, connections, and base URLs to documented application sources.
2. THE Browser_Security_Policy SHALL require encrypted transport for production responses.
3. THE Browser_Security_Policy SHALL prevent unauthorized framing of Sandyfeet_Application pages.
4. THE Browser_Security_Policy SHALL prevent content-type interpretation that conflicts with the declared response type.
5. THE Browser_Security_Policy SHALL limit referrer information sent to external origins.
6. THE Browser_Security_Policy SHALL disable browser capabilities not required by the Sandyfeet_Application.
7. WHEN the User_Interface renders User-provided or External_Service content, THE User_Interface SHALL treat the content as text or sanitize the content against an explicit allowlist.
8. WHEN the Sandyfeet_Application accepts an external URL, THE API_Boundary SHALL require an approved protocol and hostname.
9. WHEN the Sandyfeet_Application returns Sensitive_Data, THE API_Boundary SHALL apply a response cache policy that prevents shared or persistent caching.
10. WHEN an error is logged, THE Sandyfeet_Application SHALL redact Sensitive_Data and preserve a Correlation_Identifier.

### Requirement 9 — P1: Accessible Interaction and Content

**User Story:** As a User who navigates with a keyboard or assistive technology, I want complete and understandable interactions, so that I can use every application workflow independently.

#### Acceptance Criteria

1. THE User_Interface SHALL meet the Web_Content_Accessibility_Guidelines Level AA success criteria applicable to the Sandyfeet_Application.
2. WHEN an Interactive_Target performs a native button, link, input, selection, or disclosure action, THE User_Interface SHALL expose the corresponding semantic control and accessible name.
3. WHEN a User navigates with a keyboard, THE User_Interface SHALL make every Interactive_Target operable in a logical focus order.
4. WHEN an Interactive_Target receives keyboard focus, THE User_Interface SHALL display a visible focus indicator with at least a 3:1 contrast ratio against adjacent colors.
5. WHEN the User_Interface displays an input, THE User_Interface SHALL associate the input with a persistent programmatic label.
6. WHEN the User_Interface displays validation guidance or an error, THE User_Interface SHALL associate the message with the affected input and announce the message to Assistive_Technology.
7. WHEN the Modal_System opens a modal dialog, THE Modal_System SHALL move focus to a meaningful element inside the dialog, contain focus within the dialog, expose a dialog name, and make background content unavailable to interaction.
8. WHEN a User presses Escape in a dismissible dialog, popover, or menu, THE Modal_System SHALL close the topmost surface and restore focus to the opening Interactive_Target.
9. WHEN the User_Interface updates a loading, error, success, availability, total, or chatbot message without navigation, THE User_Interface SHALL expose the update through an appropriate status, alert, or log announcement.
10. WHEN the User_Interface presents a calendar, THE User_Interface SHALL expose date labels, selected state, unavailable state, current date, month navigation names, and keyboard date navigation.
11. WHEN navigation identifies the current page, THE User_Interface SHALL expose the current-page state without relying only on color.
12. THE User_Interface SHALL maintain at least a 4.5:1 text contrast ratio for normal text and a 3:1 ratio for large text and meaningful graphical controls.
13. WHEN an informative image is rendered, THE User_Interface SHALL provide an equivalent text alternative.
14. WHEN a decorative image or icon is rendered, THE User_Interface SHALL hide the decoration from Assistive_Technology.

### Requirement 10 — P1: Responsive Layout and Touch Usability

**User Story:** As a User on a phone, tablet, desktop, or zoomed browser, I want controls and content to remain usable, so that device size does not block a workflow.

#### Acceptance Criteria

1. WHILE the User_Interface is displayed in a Supported_Viewport, THE User_Interface SHALL preserve access to all content and Interactive_Targets without two-dimensional page scrolling.
2. WHILE the User_Interface is displayed at 200% through 400% zoom, THE User_Interface SHALL reflow primary content without clipping text or obscuring Interactive_Targets.
3. WHEN an Interactive_Target is available for touch input, THE User_Interface SHALL provide a target area of at least 44 by 44 CSS_Pixels or equivalent non-overlapping spacing.
4. WHILE an overlay, menu, calendar, notification panel, or chatbot is open, THE Modal_System SHALL keep the surface and dismissal control within the visible viewport.
5. WHEN the Supported_Viewport width is below 1024 CSS_Pixels, THE User_Interface SHALL collapse dashboard navigation without covering primary content.
6. WHEN viewport dimensions change, THE User_Interface SHALL preserve the current workflow state and valid input values.
7. WHILE a virtual keyboard is visible, THE User_Interface SHALL keep the focused field and associated action reachable.
8. WHEN data tables exceed the available width, THE User_Interface SHALL provide a labeled responsive representation or a single-axis scrolling region.
9. WHEN the User_Interface displays images, THE User_Interface SHALL reserve image dimensions and select an image size appropriate to the rendered viewport.

### Requirement 11 — P1: Motion Preference, Continuity, and Performance

**User Story:** As a User, I want transitions to communicate continuity without discomfort or delay, so that the application feels coherent and responsive.

#### Acceptance Criteria

1. WHEN a route or component state changes, THE Motion_System SHALL use a consistent transition that preserves the perceived relationship between the initiating action and resulting content.
2. WHEN a non-progress transition runs, THE Motion_System SHALL complete the transition within 100 to 300 milliseconds.
3. WHEN the Reduced_Motion_Preference is active, THE Motion_System SHALL remove parallax, pulsing, bouncing, carousel movement, smooth scrolling, large transforms, and non-essential entrance or exit motion.
4. WHEN the Reduced_Motion_Preference is active, THE Motion_System SHALL preserve immediate state feedback and operation progress without motion-dependent meaning.
5. WHEN a carousel or repeating animation runs, THE Motion_System SHALL provide a pause mechanism and stop movement while keyboard focus or pointer interaction is within the animated region.
6. WHEN the Motion_System animates an interface change, THE Motion_System SHALL preserve Interactive_Target position and input availability throughout the transition.
7. WHEN a loading indicator runs, THE Motion_System SHALL expose operation progress without blocking unrelated navigation.
8. THE Motion_System SHALL apply one documented duration and easing scale across public, guest, staff, admin, modal, and chatbot surfaces.

### Requirement 12 — P2: Visual and Component Consistency

**User Story:** As a User, I want visual patterns to behave consistently across application areas, so that I can recognize actions and status without relearning each screen.

#### Acceptance Criteria

1. THE Design_System SHALL define shared tokens for typography, color, spacing, radii, elevation, control size, transition duration, and interaction state.
2. WHEN the User_Interface presents the same action or status in multiple application areas, THE Design_System SHALL apply the same visual hierarchy, terminology, and interaction behavior.
3. WHEN the User_Interface presents primary, secondary, destructive, disabled, loading, focus, hover, active, error, warning, and success states, THE Design_System SHALL provide a distinct defined style for each state.
4. WHEN the User_Interface displays public, guest, staff, admin, or chatbot content, THE Design_System SHALL use the documented application typography and color roles.
5. WHEN the User_Interface displays a modal, form, navigation item, card, table, badge, notification, or empty state, THE Design_System SHALL use the corresponding shared component contract.
6. WHEN a dashboard identifies a User or Role, THE User_Interface SHALL display terminology that matches the authenticated Role.
7. WHEN the User_Interface displays money, dates, times, booking identifiers, and reservation statuses, THE User_Interface SHALL use one documented format for each data type.
8. THE Design_System SHALL exclude invalid style tokens and undocumented one-off color or typography roles from production surfaces.

### Requirement 13 — P1: Complete Asynchronous UI States and Recovery

**User Story:** As a User, I want every asynchronous surface to explain current state and recovery options, so that network delays and failures do not create ambiguous or blocked workflows.

#### Acceptance Criteria

1. WHEN an asynchronous operation remains pending for more than 300 milliseconds, THE Async_State_System SHALL present a labeled loading state in the affected region.
2. WHILE an operation that creates a business effect is pending, THE Async_State_System SHALL prevent duplicate submission of the same operation.
3. WHEN an asynchronous collection returns no records, THE Async_State_System SHALL present an empty state that distinguishes zero results from a loading or error state.
4. IF an asynchronous operation fails, THEN THE Async_State_System SHALL preserve valid User input and present a plain-language error with an available recovery action.
5. WHEN a retry succeeds, THE Async_State_System SHALL replace the error state with the resulting success or content state.
6. WHEN a mutation succeeds, THE Async_State_System SHALL identify the completed action and update every affected view to the committed state.
7. IF a route-level data request fails, THEN THE Async_State_System SHALL distinguish the failure from a not-found result.
8. WHEN partial data remains usable after a secondary request fails, THE Async_State_System SHALL retain the usable data and identify the unavailable portion.
9. WHEN an operation continues after navigation, THE Async_State_System SHALL preserve or reconcile the operation result on the destination page.
10. WHEN the User retries an idempotent operation, THE Async_State_System SHALL reuse the original Idempotency_Key.

### Requirement 14 — P1: External-Service and Chatbot Resilience

**User Story:** As a User, I want external integrations to fail safely and predictably, so that provider outages or untrusted responses do not compromise core workflows.

#### Acceptance Criteria

1. WHEN the Sandyfeet_Application sends data to an External_Service, THE API_Boundary SHALL transmit only fields documented as required for the operation.
2. WHEN an External_Service request would contain Sensitive_Data, THE API_Boundary SHALL require an approved provider, encrypted transport, and a documented retention purpose.
3. WHEN the Check_In_Service produces a check-in credential or QR representation, THE Check_In_Service SHALL keep the credential within approved Sandyfeet_Application processing boundaries.
4. IF an External_Service exceeds the defined response deadline, THEN THE API_Boundary SHALL stop waiting and return a recoverable service state.
5. IF an External_Service returns malformed or untrusted content, THEN THE API_Boundary SHALL reject or encode the content before returning a response.
6. IF every configured chatbot provider is unavailable, THEN THE Chatbot_Service SHALL return a local resort-information response or a contact recovery message.
7. WHEN the Chatbot_Service uses conversation history, THE Chatbot_Service SHALL accept only validated user and assistant text entries from the 10 most recent messages.
8. WHEN the Chatbot_Service returns formatted text, THE User_Interface SHALL render only the documented safe formatting subset.
9. WHEN a User asks the Chatbot_Service to create a booking, process a payment, reveal Sensitive_Data, or perform an unrelated action, THE Chatbot_Service SHALL direct the User to the authorized application workflow or resort contact channel.
10. WHEN the User resets a chatbot conversation, THE User_Interface SHALL request confirmation if the conversation contains a User message.
11. IF an email operation fails after a related data mutation, THEN THE Sandyfeet_Application SHALL preserve the committed business state and expose a retryable notification state.

### Requirement 15 — P1: Regression Protection and Runtime Verification

**User Story:** As a maintainer, I want automated and runtime evidence for hardening and modernization, so that future changes preserve security, logic, accessibility, and user experience.

#### Acceptance Criteria

1. THE Verification_Suite SHALL provide one-shot commands for lint, production build, unit tests, property-based tests, integration tests, and browser tests.
2. WHEN the Verification_Suite evaluates the Canonical_Route_Manifest, THE Verification_Suite SHALL verify every active route for unauthenticated, Guest, Staff_User, and Admin_User access outcomes.
3. WHEN the Verification_Suite evaluates a Protected_Route, THE Verification_Suite SHALL include missing, expired, malformed, forged, wrong-Role, and valid credential examples.
4. WHEN the Verification_Suite evaluates API validation, THE Verification_Suite SHALL include missing fields, invalid types, boundary lengths, unsupported values, malformed bodies, repeated requests, and unauthorized requests.
5. WHEN the Verification_Suite evaluates reservation calculations with generated valid bookings, THE Verification_Suite SHALL preserve capacity totals, date boundaries, Booking_Group totals, and Active_Occupancy_Status rules.
6. WHEN the Verification_Suite evaluates the Booking_Draft_Serializer with generated valid Booking_Draft values, THE Verification_Suite SHALL verify the Equivalent_Booking_Draft round trip.
7. WHEN the Verification_Suite evaluates malformed Booking_Draft storage values, THE Verification_Suite SHALL verify a recoverable empty draft state without an uncaught error.
8. WHEN the Verification_Suite evaluates concurrent reservation requests, THE Verification_Suite SHALL verify capacity limits and all-or-nothing Booking_Group results.
9. WHEN the Verification_Suite evaluates an idempotent mutation, THE Verification_Suite SHALL verify that repeated equivalent requests create one business effect.
10. WHEN the Verification_Suite evaluates an External_Service integration, THE Verification_Suite SHALL use representative mocked failures and one to three configured integration examples instead of generated high-volume external requests.
11. WHEN the Verification_Suite evaluates the User_Interface, THE Verification_Suite SHALL check keyboard operation, focus order, dialog focus behavior, accessible names, live announcements, contrast, and automated accessibility rules.
12. WHEN the Verification_Suite evaluates Supported_Viewport behavior, THE Verification_Suite SHALL check widths of 320, 375, 768, 1024, and 1440 CSS pixels plus 200% and 400% zoom.
13. WHEN the Verification_Suite evaluates the Reduced_Motion_Preference, THE Verification_Suite SHALL verify that prohibited motion is absent and state feedback remains available.
14. WHEN the Verification_Suite evaluates Async_State_System behavior, THE Verification_Suite SHALL cover loading, success, empty, error, retry, partial-data, and duplicate-submission states.
15. WHEN a release candidate is deployed to a controlled environment, THE Verification_Suite SHALL verify Firestore Security Rules, environment configuration, External_Service permissions, security response headers, protected route outcomes, email links, check-in links, and audit-record creation with representative smoke tests.
16. WHEN runtime accessibility validation is performed, THE Verification_Suite SHALL record keyboard-only, screen-reader, contrast, responsive reflow, touch-target, and Reduced_Motion_Preference results.
17. WHEN runtime performance validation is performed, THE Verification_Suite SHALL record route loading, interaction responsiveness, image loading, layout stability, and animation results for representative public, guest, staff, and admin workflows.
18. IF a runtime verification item cannot be executed, THEN THE Verification_Suite SHALL record the item as unverified with the blocking dependency and required follow-up.

## Out of Scope for This Phase

Application-code implementation, deployment changes, production data migration, credential rotation, external-provider configuration, and visual approval are outside the requirements phase. Those activities require design, implementation planning, controlled execution, and runtime validation in later phases.