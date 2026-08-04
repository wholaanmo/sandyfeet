# Migration Guide: Integrating Pages with Shared Contracts

This guide documents how to integrate each existing application surface with the new server and UX contracts established in the application hardening and UX modernization spec.

## Overview

The migration replaces direct Firestore browser writes and inconsistent UI patterns with:
- **Server-authoritative mutations** via client hooks (`useReservation`, `usePayment`, `useAuth`)
- **Shared accessible UI primitives** (`AsyncRegion`, `FormField`, `Button`, `Dialog`, etc.)
- **Consistent async state management** with idempotency, retry, and reconciliation
- **Responsive layout contracts** and the shared motion system

Each section below maps an application surface to its target integration.

---

## Reservation Pages → useReservation + AsyncRegion + FormField

**Affected pages:**
- `/rooms/[slug]` (room detail with booking form)
- `/rooms/multi-room-booking`
- `/day-tour/booking`
- `/dashboard/admin/reservations`
- `/dashboard/staff/reservations`

### Before (direct Firestore writes)
```jsx
// Old pattern — client writes directly to Firestore
import { doc, setDoc } from 'firebase/firestore';

async function handleBooking(data) {
  await setDoc(doc(db, 'bookings', newId), { ...data, status: 'pending' });
}
```

### After (server-authoritative with useReservation)
```jsx
'use client';
import { useReservation } from '@/lib/client/hooks';
import { AsyncRegion, FormField, Button } from '@/components/ui';

export function BookingForm() {
  const { submit, retry, reset, state, isLoading, error } = useReservation({
    affectedKeys: ['bookings', 'availability'],
    onSuccess: (data) => {
      // Navigate to confirmation or update local view
    },
  });

  async function handleSubmit(formData) {
    await submit('create', {
      checkIn: formData.checkIn,
      checkOut: formData.checkOut,
      rooms: formData.rooms,
      paymentMethod: formData.paymentMethod,
    });
  }

  async function handleEdit(bookingId, formData) {
    await submit('edit', { bookingId, ...formData });
  }

  async function handleCancel(bookingId) {
    await submit('cancel', { bookingId });
  }

  return (
    <AsyncRegion state={state} onRetry={retry}>
      <form onSubmit={handleSubmit}>
        <FormField label="Check-in" name="checkIn" required>
          <input type="date" />
        </FormField>
        <FormField label="Check-out" name="checkOut" required>
          <input type="date" />
        </FormField>
        {error && (
          <div role="alert">{error.message}</div>
        )}
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Booking…' : 'Book Now'}
        </Button>
      </form>
    </AsyncRegion>
  );
}
```

### Key integration points:
- `useReservation` manages idempotency keys automatically
- Duplicate submissions are blocked while pending
- `AsyncRegion` renders loading/error/success states accessibly
- `FormField` provides persistent labels, `aria-describedby`, and inline errors
- Server derives pricing, validates capacity — client never sends prices/statuses
- Retry reuses the same idempotency key (no duplicate charges)

---

## Payment Pages → usePayment + AsyncRegion

**Affected pages:**
- `/dashboard/admin/payment`
- `/dashboard/staff/payment`

### Integration pattern
```jsx
'use client';
import { usePayment } from '@/lib/client/hooks';
import { AsyncRegion, Button } from '@/components/ui';

export function PaymentTransitionPanel({ bookingId }) {
  const { submit, retry, reset, state, isLoading, error } = usePayment({
    affectedKeys: ['payments', 'bookings'],
  });

  async function handleTransition(targetState, evidence) {
    await submit('transition', {
      bookingId,
      transition: targetState,
      evidence,
    });
  }

  async function handleRefund(reasonCode) {
    await submit('refund', {
      bookingId,
      transition: 'requested',
      reasonCode,
    });
  }

  return (
    <AsyncRegion state={state} onRetry={retry}>
      <div>
        <Button
          onClick={() => handleTransition('approved')}
          disabled={isLoading}
        >
          Approve Payment
        </Button>
        <Button
          onClick={() => handleRefund('guest_request')}
          disabled={isLoading}
          variant="danger"
        >
          Request Refund
        </Button>
      </div>
    </AsyncRegion>
  );
}
```

### Key integration points:
- Payment transitions use the PAYMENT_REQUEST_MACHINE states
- Refunds validate reservation eligibility server-side (ineligible → rejected silently)
- Evidence metadata is attached but never stored in public records
- Monetary values are integer centavos, derived from authoritative records
- Idempotent retries prevent duplicate financial effects

---

## Authentication Pages → useAuth + SessionProvider

**Affected pages:**
- `/login`
- `/account`
- All protected layouts

### Sign-in integration
```jsx
'use client';
import { useAuth } from '@/lib/client/hooks';
import { FormField, Button } from '@/components/ui';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';

export function LoginForm() {
  const { signIn, state, isLoading, error } = useAuth({
    onSignIn: (actor) => {
      // Redirect to role-appropriate landing
      window.location.href = actor.role === 'admin'
        ? '/dashboard/admin/overview'
        : actor.role === 'staff'
          ? '/dashboard/staff/overview'
          : '/my-bookings';
    },
  });

  async function handleSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    const email = form.get('email');
    const password = form.get('password');

    // Step 1: Firebase client auth
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await cred.user.getIdToken();

    // Step 2: Exchange for server session via useAuth
    await signIn(idToken, form.get('rememberMe') === 'on');
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormField label="Email" name="email" required>
        <input type="email" autoComplete="email" />
      </FormField>
      <FormField label="Password" name="password" required>
        <input type="password" autoComplete="current-password" />
      </FormField>
      {error && <div role="alert">{error.message}</div>}
      <Button type="submit" disabled={isLoading}>
        {isLoading ? 'Signing in…' : 'Sign In'}
      </Button>
    </form>
  );
}
```

### Sign-out integration
```jsx
'use client';
import { useAuth } from '@/lib/client/hooks';
import { Button } from '@/components/ui';

export function SignOutButton() {
  const { signOut, isLoading } = useAuth({
    onSignOut: () => {
      window.location.href = '/login';
    },
  });

  return (
    <Button onClick={signOut} disabled={isLoading} variant="ghost">
      {isLoading ? 'Signing out…' : 'Sign Out'}
    </Button>
  );
}
```

### Key integration points:
- Server creates `__Host-sf_session` HttpOnly cookie (not script-readable)
- Client only stores display-only actor data (uid, role)
- Role/status are re-verified on every server request
- Sign-out revokes refresh tokens and clears cookies server-side
- `FormField` gives neutral credential feedback (no account enumeration)

---

## Dashboards → withProtectedLayout + ResponsiveContainer + Navigation

**Affected pages:**
- `/dashboard/admin/*`
- `/dashboard/staff/*`

### Layout integration
```jsx
// app/dashboard/admin/layout.js (Server Component)
import { requireActor, requireRole } from '@/lib/server/auth/authorization';
import { Navigation, ResponsiveContainer } from '@/components/ui';
import '@/components/ui/responsive.css';

export default async function AdminLayout({ children }) {
  // Server-authoritative: verify session and role
  const actor = await requireActor(/* from cookies */);
  requireRole(actor, ['admin']);

  return (
    <ResponsiveContainer layout="dashboard">
      <Navigation role="admin" currentPath={/* from headers */} />
      <main>{children}</main>
    </ResponsiveContainer>
  );
}
```

### Key integration points:
- `Navigation` renders `aria-current="page"` for the active route
- `ResponsiveContainer` handles the 1024px collapse breakpoint
- Navigation collapses to drawer below 1024px, never covers content when closed
- `ResponsiveTable` provides labeled scroll regions for data tables
- Partial data states use `AsyncRegion` with `phase: 'partial'` to keep primary data visible
- Role-correct terminology (admin sees "Manage Staff", staff sees "My Schedule")

---

## Public Pages → Image + Calendar + responsive.css

**Affected pages:**
- `/home`, `/rooms`, `/rooms/[slug]`
- `/day-tour`, `/day-tour/calendar`
- `/calendar`, `/feedback`

### Image integration
```jsx
import { Image } from '@/components/ui';

// All images require intrinsic dimensions and meaningful alt
<Image
  src="https://res.cloudinary.com/sandyfeet/..."
  alt="Ocean-view suite with queen bed and balcony"
  width={800}
  height={600}
  sizes="(max-width: 768px) 100vw, 50vw"
/>

// Decorative images use empty alt
<Image src="/pattern.svg" alt="" decorative width={100} height={100} />
```

### Calendar integration
```jsx
import { Calendar } from '@/components/ui';

<Calendar
  value={selectedDate}
  onChange={setSelectedDate}
  unavailableDates={bookedDates}
  minDate={today}
  locale="en-PH"
/>
```

### Responsive layout
```jsx
import '@/components/ui/responsive.css';

// Content-first layout from 320–1440px
// No horizontal scrolling at page level
// 44×44px minimum touch targets
// Virtual keyboard doesn't obscure focused input
```

### Key integration points:
- `Image` prevents layout shifts with required width/height or aspect ratio
- `Calendar` supports full keyboard navigation (Arrow, Home, End, PageUp/PageDown)
- responsive.css provides container queries and reflow rules
- Chatbot renders rich text via safe AST (no raw HTML / `dangerouslySetInnerHTML`)
- `prefers-reduced-motion: reduce` disables parallax, bouncing, large transforms
- Motion transitions stay within 100–300ms duration tokens

---

## Chatbot → Safe rendering + Fallback + Action boundaries

**Affected component:** Chatbot widget (all pages)

### Integration pattern
```jsx
import { AsyncRegion, LiveRegion } from '@/components/ui';

// Chatbot messages are parsed to a safe inert AST
// Raw HTML is never rendered
// Action suggestions redirect to authorized workflows, never mutate directly
// Local fallback provides resort contact info when provider is unavailable
// Reset requires user confirmation before clearing history
```

---

## Import Map

| Old import | New import |
|---|---|
| Direct Firestore `setDoc`/`updateDoc` for bookings | `useReservation` from `@/lib/client/hooks` |
| Direct Firestore mutations for payments | `usePayment` from `@/lib/client/hooks` |
| Client-side role/token cookies | `useAuth` from `@/lib/client/hooks` |
| Custom loading spinners | `AsyncRegion` from `@/components/ui` |
| Inline form labels | `FormField` from `@/components/ui` |
| `window.confirm` dialogs | `Dialog` from `@/components/ui` |
| `<img>` without dimensions | `Image` from `@/components/ui` |
| Custom calendar implementations | `Calendar` from `@/components/ui` |
| Custom navigation menus | `Navigation` from `@/components/ui` |
| Fixed-width layouts | `ResponsiveContainer` + `responsive.css` |
| Ad-hoc CSS transitions | `Transition` + `motion.css` from `@/components/ui` |

---

## Migration Checklist

For each page migration:

1. [ ] Replace direct Firestore writes with the appropriate hook (`useReservation`, `usePayment`, `useAuth`)
2. [ ] Wrap async operations in `AsyncRegion` for accessible loading/error states
3. [ ] Replace inline form patterns with `FormField` (labels, errors, `aria-describedby`)
4. [ ] Ensure all images use the `Image` component with dimensions and alt text
5. [ ] Apply `responsive.css` and verify no two-axis scrolling
6. [ ] Verify 44×44px touch targets or equivalent spacing
7. [ ] Test with `prefers-reduced-motion: reduce` — no prohibited animations
8. [ ] Verify keyboard navigation works for all interactive elements
9. [ ] Confirm server-authoritative data (no client-derived prices, statuses, or roles)
10. [ ] Test retry with same idempotency key — no duplicate business effects
