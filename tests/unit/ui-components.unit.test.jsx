/**
 * Unit tests for accessible UI component foundations.
 *
 * Validates: Requirements 9.1, 9.2, 9.4, 9.5, 9.6, 9.9, 9.12, 9.13, 9.14, 10.3, 10.9, 11.2, 11.8
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Button } from '@/components/ui/Button.jsx';
import { FormField } from '@/components/ui/FormField.jsx';
import { LiveRegion } from '@/components/ui/LiveRegion.jsx';
import { AsyncRegion } from '@/components/ui/AsyncRegion.jsx';
import { Image } from '@/components/ui/Image.jsx';

// ─── Button ──────────────────────────────────────────────────────────────────

describe('Button', () => {
  it('renders a semantic <button> element', () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole('button', { name: 'Click me' });
    expect(btn.tagName).toBe('BUTTON');
  });

  it('defaults to type="button" (not submit)', () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('supports type="submit"', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('has minimum 44px touch target via class', () => {
    render(<Button>Tap</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('min-h-[var(--control-min-size)]');
    expect(btn.className).toContain('min-w-[var(--control-min-size)]');
  });

  it('includes focus-visible ring classes for visible focus indicator', () => {
    render(<Button>Focus</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('focus-visible:ring-[var(--focus-ring-color)]');
  });

  it('applies loading state with aria-busy and disabled', () => {
    render(<Button loading>Loading</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
  });

  it('does not set aria-busy when not loading', () => {
    render(<Button>Normal</Button>);
    const btn = screen.getByRole('button');
    expect(btn).not.toHaveAttribute('aria-busy');
    expect(btn).not.toBeDisabled();
  });

  it('supports aria-label for accessible name', () => {
    render(<Button aria-label="Close dialog">✕</Button>);
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });

  it('renders all variants without errors', () => {
    const { container } = render(
      <>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
      </>
    );
    expect(container.querySelectorAll('button')).toHaveLength(4);
  });

  it('passes axe accessibility audit', async () => {
    const { container } = render(<Button>Accessible</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ─── FormField ───────────────────────────────────────────────────────────────

describe('FormField', () => {
  it('associates label with input via htmlFor/id binding', () => {
    render(
      <FormField label="Email">
        <input type="email" />
      </FormField>
    );
    const input = screen.getByLabelText('Email');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('id');
  });

  it('uses a custom id when provided', () => {
    render(
      <FormField label="Name" id="custom-name">
        <input type="text" />
      </FormField>
    );
    expect(screen.getByLabelText('Name')).toHaveAttribute('id', 'custom-name');
  });

  it('shows required indicator', () => {
    render(
      <FormField label="Password" required>
        <input type="password" />
      </FormField>
    );
    const input = screen.getByLabelText(/Password/);
    expect(input).toHaveAttribute('aria-required', 'true');
    // Visual asterisk is present
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('associates help text via aria-describedby', () => {
    render(
      <FormField label="Username" helpText="At least 3 characters">
        <input type="text" />
      </FormField>
    );
    const input = screen.getByLabelText('Username');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const helpEl = document.getElementById(describedBy);
    expect(helpEl).toHaveTextContent('At least 3 characters');
  });

  it('associates error via aria-describedby and sets aria-invalid', () => {
    render(
      <FormField label="Email" error="Invalid email format">
        <input type="email" />
      </FormField>
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby');
    const errorEl = document.getElementById(describedBy);
    expect(errorEl).toHaveTextContent('Invalid email format');
  });

  it('announces error to assistive technology via role="alert"', () => {
    render(
      <FormField label="Phone" error="Phone is required">
        <input type="tel" />
      </FormField>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Phone is required');
  });

  it('hides help text when error is shown', () => {
    render(
      <FormField label="Name" helpText="Enter full name" error="Name is required">
        <input type="text" />
      </FormField>
    );
    expect(screen.queryByText('Enter full name')).not.toBeInTheDocument();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('passes axe accessibility audit', async () => {
    const { container } = render(
      <FormField label="Field" helpText="Help text">
        <input type="text" />
      </FormField>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ─── LiveRegion ──────────────────────────────────────────────────────────────

describe('LiveRegion', () => {
  it('renders with role="status" for polite announcements', () => {
    render(<LiveRegion>Update available</LiveRegion>);
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Update available');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('renders with role="alert" for assertive announcements', () => {
    render(<LiveRegion politeness="assertive">Error occurred</LiveRegion>);
    const region = screen.getByRole('alert');
    expect(region).toHaveTextContent('Error occurred');
    expect(region).toHaveAttribute('aria-live', 'assertive');
  });

  it('sets aria-atomic by default', () => {
    render(<LiveRegion>Content</LiveRegion>);
    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true');
  });

  it('can be visually hidden while remaining accessible', () => {
    render(<LiveRegion visuallyHidden>Hidden announcement</LiveRegion>);
    const region = screen.getByRole('status');
    expect(region.className).toContain('sr-only');
    expect(region).toHaveTextContent('Hidden announcement');
  });

  it('passes axe accessibility audit', async () => {
    const { container } = render(<LiveRegion>Accessible region</LiveRegion>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ─── AsyncRegion ─────────────────────────────────────────────────────────────

describe('AsyncRegion', () => {
  it('renders children in success phase', () => {
    render(
      <AsyncRegion phase="success">
        <p>Loaded content</p>
      </AsyncRegion>
    );
    expect(screen.getByText('Loaded content')).toBeInTheDocument();
  });

  it('renders children in idle phase', () => {
    render(
      <AsyncRegion phase="idle">
        <p>Initial content</p>
      </AsyncRegion>
    );
    expect(screen.getByText('Initial content')).toBeInTheDocument();
  });

  it('shows loading state with aria-busy and status role', () => {
    render(<AsyncRegion phase="pending" loadingLabel="Fetching data…" />);
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Fetching data…');
    // The outer container has aria-busy
    expect(region.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows error state with alert role', () => {
    render(
      <AsyncRegion phase="error" errorMessage="Connection failed" />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Connection failed');
  });

  it('shows retry button in error state when onRetry is provided', async () => {
    const user = userEvent.setup();
    let retried = false;
    render(
      <AsyncRegion
        phase="error"
        errorMessage="Failed"
        onRetry={() => { retried = true; }}
        retryLabel="Try again"
      />
    );
    const retryBtn = screen.getByRole('button', { name: 'Try again' });
    expect(retryBtn).toBeInTheDocument();
    await user.click(retryBtn);
    expect(retried).toBe(true);
  });

  it('shows empty state with status role', () => {
    render(<AsyncRegion phase="empty" emptyMessage="No bookings yet." />);
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('No bookings yet.');
  });

  it('does not render children during pending phase', () => {
    render(
      <AsyncRegion phase="pending">
        <p>Should not show</p>
      </AsyncRegion>
    );
    expect(screen.queryByText('Should not show')).not.toBeInTheDocument();
  });

  it('supports aria-label for region context', () => {
    const { container } = render(
      <AsyncRegion phase="success" aria-label="Reservation list">
        <p>Content</p>
      </AsyncRegion>
    );
    expect(container.firstChild).toHaveAttribute('aria-label', 'Reservation list');
  });

  it('passes axe accessibility audit in success state', async () => {
    const { container } = render(
      <AsyncRegion phase="success" aria-label="Test region">
        <p>Content</p>
      </AsyncRegion>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ─── Image ───────────────────────────────────────────────────────────────────

describe('Image', () => {
  it('renders informative image with alt text', () => {
    render(<Image src="/photo.jpg" alt="Beach sunset" width={800} height={600} />);
    const img = screen.getByRole('img', { name: 'Beach sunset' });
    expect(img).toHaveAttribute('alt', 'Beach sunset');
    expect(img).not.toHaveAttribute('aria-hidden');
  });

  it('sets explicit width and height for layout stability', () => {
    render(<Image src="/photo.jpg" alt="Room view" width={640} height={480} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('width', '640');
    expect(img).toHaveAttribute('height', '480');
  });

  it('hides decorative images from assistive technology', () => {
    const { container } = render(
      <Image src="/decoration.svg" alt="" width={24} height={24} decorative />
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(img).toHaveAttribute('alt', '');
  });

  it('defaults to lazy loading', () => {
    render(<Image src="/photo.jpg" alt="Room" width={400} height={300} />);
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'lazy');
  });

  it('supports eager loading', () => {
    render(<Image src="/hero.jpg" alt="Hero" width={1200} height={600} loading="eager" />);
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'eager');
  });

  it('supports responsive sizes and srcSet', () => {
    render(
      <Image
        src="/photo.jpg"
        alt="View"
        width={800}
        height={600}
        sizes="(max-width: 768px) 100vw, 50vw"
        srcSet="/photo-400.jpg 400w, /photo-800.jpg 800w"
      />
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('sizes', '(max-width: 768px) 100vw, 50vw');
    expect(img).toHaveAttribute('srcset', '/photo-400.jpg 400w, /photo-800.jpg 800w');
  });

  it('passes axe accessibility audit for informative image', async () => {
    const { container } = render(
      <Image src="/photo.jpg" alt="Accessible photo" width={400} height={300} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('passes axe accessibility audit for decorative image', async () => {
    const { container } = render(
      <Image src="/bg.svg" alt="" width={100} height={100} decorative />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
