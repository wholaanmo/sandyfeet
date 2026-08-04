/**
 * Unit tests for accessible overlays, navigation, calendar, and tables.
 *
 * Validates: Requirements 9.2, 9.3, 9.7, 9.8, 9.10, 9.11, 10.4, 10.8
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Dialog } from '@/components/ui/Dialog.jsx';
import { Navigation } from '@/components/ui/Navigation.jsx';
import { Calendar } from '@/components/ui/Calendar.jsx';
import { ResponsiveTable } from '@/components/ui/ResponsiveTable.jsx';

// ─── Dialog ──────────────────────────────────────────────────────────────────

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Dialog open={false} onClose={() => {}} title="Hidden">
        <p>Content</p>
      </Dialog>
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it('renders with role="dialog" and aria-modal="true" when open', () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Test Dialog">
        <p>Content</p>
      </Dialog>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('has accessible name via aria-labelledby when title is provided', () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Confirm Action">
        <p>Are you sure?</p>
      </Dialog>
    );
    const dialog = screen.getByRole('dialog', { name: 'Confirm Action' });
    expect(dialog).toBeInTheDocument();
  });

  it('has accessible name via aria-label when no title', () => {
    render(
      <Dialog open={true} onClose={() => {}} aria-label="Notification">
        <p>Info</p>
      </Dialog>
    );
    const dialog = screen.getByRole('dialog', { name: 'Notification' });
    expect(dialog).toBeInTheDocument();
  });

  it('moves focus to the first focusable element on open', () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Form Dialog">
        <button type="button">First</button>
        <button type="button">Second</button>
      </Dialog>
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }));
  });

  it('closes on Escape key press', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose} title="Esc Test">
        <button type="button">Inside</button>
      </Dialog>
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps focus within the dialog (Tab wraps)', async () => {
    const user = userEvent.setup();
    render(
      <Dialog open={true} onClose={() => {}} title="Trap Test">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Dialog>
    );
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });

    // Focus starts on first
    expect(document.activeElement).toBe(first);
    // Tab to Last
    await user.tab();
    expect(document.activeElement).toBe(last);
    // Tab again wraps to First
    await user.tab();
    expect(document.activeElement).toBe(first);
  });

  it('traps focus within the dialog (Shift+Tab wraps)', async () => {
    const user = userEvent.setup();
    render(
      <Dialog open={true} onClose={() => {}} title="Shift Trap">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Dialog>
    );
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });

    // Focus starts on first
    expect(document.activeElement).toBe(first);
    // Shift+Tab wraps to last
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it('restores focus to trigger element on close', async () => {
    function TestApp() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Restore Test">
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </Dialog>
        </>
      );
    }
    const React = await import('react');
    const user = userEvent.setup();

    render(<TestApp />);
    const openBtn = screen.getByRole('button', { name: 'Open' });
    await user.click(openBtn);

    // Dialog is open, focus is inside
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Close the dialog
    await user.click(screen.getByRole('button', { name: 'Close' }));

    // Focus should be restored to the trigger
    expect(document.activeElement).toBe(openBtn);
  });

  it('sets aria-hidden on sibling elements for background inertness', () => {
    const { container } = render(
      <div>
        <div data-testid="sibling">Background content</div>
        <Dialog open={true} onClose={() => {}} title="Inert Test">
          <p>Dialog content</p>
        </Dialog>
      </div>
    );
    const sibling = screen.getByTestId('sibling');
    expect(sibling).toHaveAttribute('aria-hidden', 'true');
  });

  it('passes axe accessibility audit', async () => {
    const { container } = render(
      <Dialog open={true} onClose={() => {}} title="Accessible Dialog">
        <p>Content</p>
        <button type="button">Action</button>
      </Dialog>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ─── Navigation ──────────────────────────────────────────────────────────────

describe('Navigation', () => {
  const links = [
    { href: '/', label: 'Home', active: false },
    { href: '/rooms', label: 'Rooms', active: true },
    { href: '/day-tour', label: 'Day Tour', active: false },
  ];

  it('renders a semantic <nav> element', () => {
    render(<Navigation links={links} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('has an accessible name via aria-label', () => {
    render(<Navigation links={links} aria-label="Site navigation" />);
    expect(screen.getByRole('navigation', { name: 'Site navigation' })).toBeInTheDocument();
  });

  it('defaults aria-label to "Main navigation"', () => {
    render(<Navigation links={links} />);
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('renders links with correct href', () => {
    render(<Navigation links={links} />);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Rooms' })).toHaveAttribute('href', '/rooms');
  });

  it('sets aria-current="page" on the active link', () => {
    render(<Navigation links={links} />);
    const activeLink = screen.getByRole('link', { name: 'Rooms' });
    expect(activeLink).toHaveAttribute('aria-current', 'page');
  });

  it('does not set aria-current on inactive links', () => {
    render(<Navigation links={links} />);
    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink).not.toHaveAttribute('aria-current');
  });

  it('renders links in a list for logical structure', () => {
    render(<Navigation links={links} />);
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
  });

  it('includes focus-visible ring classes on links', () => {
    render(<Navigation links={links} />);
    const link = screen.getByRole('link', { name: 'Home' });
    expect(link.className).toContain('focus-visible:ring-[var(--focus-ring-color)]');
  });

  it('passes axe accessibility audit', async () => {
    const { container } = render(<Navigation links={links} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ─── Calendar ────────────────────────────────────────────────────────────────

describe('Calendar', () => {
  // Use a fixed date for deterministic testing: January 2025
  const fixedDate = new Date(2025, 0, 15); // January 15, 2025

  it('renders with accessible group role and label', () => {
    render(<Calendar initialDate={fixedDate} aria-label="Booking calendar" />);
    expect(screen.getByRole('group', { name: 'Booking calendar' })).toBeInTheDocument();
  });

  it('displays month name and year as a live region', () => {
    render(<Calendar initialDate={fixedDate} />);
    expect(screen.getByText('January 2025')).toBeInTheDocument();
  });

  it('renders a grid with day-of-week column headers', () => {
    render(<Calendar initialDate={fixedDate} />);
    const grid = screen.getByRole('grid');
    const headers = within(grid).getAllByRole('columnheader');
    expect(headers).toHaveLength(7);
    expect(headers[0]).toHaveTextContent('Sun');
    expect(headers[6]).toHaveTextContent('Sat');
  });

  it('provides named month navigation buttons', () => {
    render(<Calendar initialDate={fixedDate} />);
    expect(
      screen.getByRole('button', { name: /Previous month, December 2024/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Next month, February 2025/ })
    ).toBeInTheDocument();
  });

  it('navigates to previous month', async () => {
    const user = userEvent.setup();
    render(<Calendar initialDate={fixedDate} />);
    await user.click(screen.getByRole('button', { name: /Previous month/ }));
    expect(screen.getByText('December 2024')).toBeInTheDocument();
  });

  it('navigates to next month', async () => {
    const user = userEvent.setup();
    render(<Calendar initialDate={fixedDate} />);
    await user.click(screen.getByRole('button', { name: /Next month/ }));
    expect(screen.getByText('February 2025')).toBeInTheDocument();
  });

  it('exposes date labels with full date text', () => {
    render(<Calendar initialDate={fixedDate} />);
    expect(screen.getByRole('button', { name: 'January 15, 2025' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'January 1, 2025' })).toBeInTheDocument();
  });

  it('marks selected date with aria-selected', () => {
    render(<Calendar initialDate={fixedDate} selectedDate="2025-01-15" />);
    const btn = screen.getByRole('button', { name: 'January 15, 2025' });
    // aria-selected is on the gridcell, aria-pressed on the button
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn.closest('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
  });

  it('marks unavailable dates with aria-disabled', () => {
    const isUnavailable = (date) => date === '2025-01-20';
    render(<Calendar initialDate={fixedDate} isUnavailable={isUnavailable} />);
    const btn = screen.getByRole('button', { name: 'January 20, 2025' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
  });

  it('marks today with aria-current="date"', () => {
    const today = new Date();
    render(<Calendar initialDate={today} />);
    const todayStr = `${['January','February','March','April','May','June','July','August','September','October','November','December'][today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
    const btn = screen.getByRole('button', { name: todayStr });
    expect(btn).toHaveAttribute('aria-current', 'date');
  });

  it('calls onSelect when a date is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Calendar initialDate={fixedDate} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: 'January 10, 2025' }));
    expect(onSelect).toHaveBeenCalledWith('2025-01-10');
  });

  it('does not call onSelect for unavailable dates', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const isUnavailable = (date) => date === '2025-01-10';
    render(
      <Calendar initialDate={fixedDate} onSelect={onSelect} isUnavailable={isUnavailable} />
    );
    // Unavailable buttons are disabled, click should have no effect
    const btn = screen.getByRole('button', { name: 'January 10, 2025' });
    await user.click(btn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('supports arrow key navigation (right moves to next day)', async () => {
    const user = userEvent.setup();
    render(<Calendar initialDate={fixedDate} />);

    // Focus on the focused day (15)
    const day15 = screen.getByRole('button', { name: 'January 15, 2025' });
    day15.focus();
    expect(document.activeElement).toBe(day15);

    await user.keyboard('{ArrowRight}');
    const day16 = screen.getByRole('button', { name: 'January 16, 2025' });
    expect(day16).toHaveAttribute('tabindex', '0');
  });

  it('supports arrow key navigation (left moves to previous day)', async () => {
    const user = userEvent.setup();
    render(<Calendar initialDate={fixedDate} />);

    const day15 = screen.getByRole('button', { name: 'January 15, 2025' });
    day15.focus();

    await user.keyboard('{ArrowLeft}');
    const day14 = screen.getByRole('button', { name: 'January 14, 2025' });
    expect(day14).toHaveAttribute('tabindex', '0');
  });

  it('supports Enter/Space to select the focused date', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Calendar initialDate={fixedDate} onSelect={onSelect} />);

    const day15 = screen.getByRole('button', { name: 'January 15, 2025' });
    day15.focus();

    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('2025-01-15');
  });

  it('passes axe accessibility audit', async () => {
    const { container } = render(
      <Calendar initialDate={fixedDate} selectedDate="2025-01-15" />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ─── ResponsiveTable ─────────────────────────────────────────────────────────

describe('ResponsiveTable', () => {
  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'room', header: 'Room' },
    { key: 'date', header: 'Check-in' },
  ];
  const data = [
    { name: 'Alice', room: 'Deluxe', date: '2025-01-15' },
    { name: 'Bob', room: 'Standard', date: '2025-01-16' },
  ];

  it('renders a semantic <table> element', () => {
    render(<ResponsiveTable caption="Reservations" columns={columns} data={data} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('displays a caption for accessible table name', () => {
    render(<ResponsiveTable caption="Reservations" columns={columns} data={data} />);
    expect(screen.getByText('Reservations')).toBeInTheDocument();
    // The caption should be inside the table
    const table = screen.getByRole('table');
    expect(within(table).getByText('Reservations')).toBeInTheDocument();
  });

  it('wraps in a scrollable region with role="region" and aria-label', () => {
    const { container } = render(
      <ResponsiveTable caption="Reservations" columns={columns} data={data} />
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-label', 'Reservations, scrollable');
  });

  it('supports custom aria-label for scroll region', () => {
    const { container } = render(
      <ResponsiveTable
        caption="Bookings"
        columns={columns}
        data={data}
        aria-label="Bookings table, scroll to see all columns"
      />
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toHaveAttribute(
      'aria-label',
      'Bookings table, scroll to see all columns'
    );
  });

  it('scroll container is keyboard focusable (tabindex="0")', () => {
    const { container } = render(
      <ResponsiveTable caption="Data" columns={columns} data={data} />
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('renders column headers with scope="col"', () => {
    render(<ResponsiveTable caption="Table" columns={columns} data={data} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    headers.forEach((th) => {
      expect(th).toHaveAttribute('scope', 'col');
    });
  });

  it('renders data rows correctly', () => {
    render(<ResponsiveTable caption="Table" columns={columns} data={data} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Deluxe')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    // 1 header row + 2 data rows
    expect(rows).toHaveLength(3);
  });

  it('supports custom children as table body', () => {
    render(
      <ResponsiveTable caption="Custom" columns={columns} data={[]}>
        <tr>
          <td>Custom Cell</td>
          <td>-</td>
          <td>-</td>
        </tr>
      </ResponsiveTable>
    );
    expect(screen.getByText('Custom Cell')).toBeInTheDocument();
  });

  it('has overflow-x-auto for horizontal scrolling', () => {
    const { container } = render(
      <ResponsiveTable caption="Overflow" columns={columns} data={data} />
    );
    const region = container.querySelector('[role="region"]');
    expect(region.className).toContain('overflow-x-auto');
  });

  it('passes axe accessibility audit', async () => {
    const { container } = render(
      <ResponsiveTable caption="Reservations" columns={columns} data={data} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
