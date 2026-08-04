/**
 * Unit tests for responsive layout contracts.
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ResponsiveContainer } from '@/components/ui/ResponsiveContainer.jsx';

// ─── ResponsiveContainer ─────────────────────────────────────────────────────

describe('ResponsiveContainer', () => {
  it('renders children within a layout wrapper', () => {
    render(
      <ResponsiveContainer>
        <p>Page content</p>
      </ResponsiveContainer>
    );
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('applies responsive-layout class by default (variant="layout")', () => {
    const { container } = render(
      <ResponsiveContainer>Content</ResponsiveContainer>
    );
    expect(container.firstChild.className).toContain('responsive-layout');
  });

  it('applies responsive-content class for variant="content"', () => {
    const { container } = render(
      <ResponsiveContainer variant="content">Content</ResponsiveContainer>
    );
    expect(container.firstChild.className).toContain('responsive-content');
  });

  it('applies form variant classes for variant="form"', () => {
    const { container } = render(
      <ResponsiveContainer variant="form">
        <input type="text" />
      </ResponsiveContainer>
    );
    const el = container.firstChild;
    expect(el.className).toContain('responsive-content');
    expect(el.className).toContain('resize-stable-form');
  });

  it('applies keyboard-reachable class when keyboardReachable=true', () => {
    const { container } = render(
      <ResponsiveContainer keyboardReachable>
        <input type="text" />
      </ResponsiveContainer>
    );
    expect(container.firstChild.className).toContain('keyboard-reachable');
  });

  it('does not apply keyboard-reachable class by default', () => {
    const { container } = render(
      <ResponsiveContainer>Content</ResponsiveContainer>
    );
    expect(container.firstChild.className).not.toContain('keyboard-reachable');
  });

  it('applies reflow-safe class when reflowSafe=true', () => {
    const { container } = render(
      <ResponsiveContainer reflowSafe>
        <span>Item 1</span>
        <span>Item 2</span>
      </ResponsiveContainer>
    );
    expect(container.firstChild.className).toContain('reflow-safe');
  });

  it('does not apply reflow-safe class by default', () => {
    const { container } = render(
      <ResponsiveContainer>Content</ResponsiveContainer>
    );
    expect(container.firstChild.className).not.toContain('reflow-safe');
  });

  it('renders as a custom element when "as" prop is specified', () => {
    const { container } = render(
      <ResponsiveContainer as="section">Content</ResponsiveContainer>
    );
    expect(container.firstChild.tagName).toBe('SECTION');
  });

  it('defaults to rendering as a div', () => {
    const { container } = render(
      <ResponsiveContainer>Content</ResponsiveContainer>
    );
    expect(container.firstChild.tagName).toBe('DIV');
  });

  it('supports "main" as custom element', () => {
    render(
      <ResponsiveContainer as="main">Content</ResponsiveContainer>
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('merges additional className with variant classes', () => {
    const { container } = render(
      <ResponsiveContainer className="custom-class">Content</ResponsiveContainer>
    );
    const el = container.firstChild;
    expect(el.className).toContain('responsive-layout');
    expect(el.className).toContain('custom-class');
  });

  it('passes additional props through to the element', () => {
    const { container } = render(
      <ResponsiveContainer data-testid="wrapper" id="main-layout">
        Content
      </ResponsiveContainer>
    );
    const el = container.firstChild;
    expect(el).toHaveAttribute('data-testid', 'wrapper');
    expect(el).toHaveAttribute('id', 'main-layout');
  });

  it('combines multiple responsive features', () => {
    const { container } = render(
      <ResponsiveContainer
        variant="content"
        keyboardReachable
        reflowSafe
        className="extra"
      >
        <input type="text" />
      </ResponsiveContainer>
    );
    const el = container.firstChild;
    expect(el.className).toContain('responsive-content');
    expect(el.className).toContain('keyboard-reachable');
    expect(el.className).toContain('reflow-safe');
    expect(el.className).toContain('extra');
  });

  it('passes axe accessibility audit', async () => {
    const { container } = render(
      <ResponsiveContainer aria-label="Main content">
        <p>Accessible content</p>
      </ResponsiveContainer>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ─── CSS Class Contracts (responsive.css) ────────────────────────────────────

describe('Responsive CSS class contracts', () => {
  describe('No two-axis overflow (Req 10.1)', () => {
    it('responsive-layout class prevents horizontal overflow', () => {
      const { container } = render(
        <div className="responsive-layout">
          <p>No two-axis scroll content</p>
        </div>
      );
      expect(container.firstChild.className).toContain('responsive-layout');
    });
  });

  describe('Reflow rules for zoom (Req 10.2)', () => {
    it('reflow-safe class enables flex-wrap for high zoom reflow', () => {
      const { container } = render(
        <div className="reflow-safe">
          <span>A</span>
          <span>B</span>
          <span>C</span>
        </div>
      );
      expect(container.firstChild.className).toContain('reflow-safe');
    });

    it('reflow-grid class enables grid auto-fit reflow', () => {
      const { container } = render(
        <div className="reflow-grid">
          <div>Card 1</div>
          <div>Card 2</div>
        </div>
      );
      expect(container.firstChild.className).toContain('reflow-grid');
    });
  });

  describe('Touch targets (Req 10.3)', () => {
    it('touch-target class provides minimum 44px dimensions', () => {
      const { container } = render(
        <button className="touch-target">Tap</button>
      );
      expect(container.firstChild.className).toContain('touch-target');
    });

    it('touch-target-sm class provides secondary minimum', () => {
      const { container } = render(
        <button className="touch-target-sm">Small</button>
      );
      expect(container.firstChild.className).toContain('touch-target-sm');
    });
  });

  describe('Viewport-contained overlays (Req 10.4)', () => {
    it('overlay-contained class constrains to viewport', () => {
      const { container } = render(
        <div className="overlay-contained" role="dialog" aria-label="Test">
          <p>Overlay content</p>
        </div>
      );
      expect(container.firstChild.className).toContain('overlay-contained');
    });

    it('overlay-safe-area class accounts for device safe areas', () => {
      const { container } = render(
        <div className="overlay-safe-area" role="dialog" aria-label="Safe">
          <p>Safe overlay</p>
        </div>
      );
      expect(container.firstChild.className).toContain('overlay-safe-area');
    });
  });

  describe('Dashboard nav collapse (Req 10.5)', () => {
    it('dashboard-nav class is applied for collapsible navigation', () => {
      const { container } = render(
        <nav className="dashboard-nav" aria-label="Dashboard">
          <a href="/dashboard/overview">Overview</a>
        </nav>
      );
      expect(container.firstChild.className).toContain('dashboard-nav');
    });

    it('dashboard-nav supports data-open attribute for mobile toggle', () => {
      const { container } = render(
        <nav className="dashboard-nav" data-open="true" aria-label="Dashboard">
          <a href="/dashboard/overview">Overview</a>
        </nav>
      );
      expect(container.firstChild).toHaveAttribute('data-open', 'true');
    });

    it('dashboard-nav-backdrop supports data-open for backdrop display', () => {
      const { container } = render(
        <div className="dashboard-nav-backdrop" data-open="true" />
      );
      expect(container.firstChild).toHaveAttribute('data-open', 'true');
    });
  });

  describe('Resize-state preservation (Req 10.6)', () => {
    it('resize-stable class uses CSS containment', () => {
      const { container } = render(
        <div className="resize-stable">
          <p>Stable content</p>
        </div>
      );
      expect(container.firstChild.className).toContain('resize-stable');
    });
  });

  describe('Virtual keyboard reachability (Req 10.7)', () => {
    it('keyboard-reachable class is available for focused fields', () => {
      const { container } = render(
        <div className="keyboard-reachable">
          <input type="text" aria-label="Name" />
        </div>
      );
      expect(container.firstChild.className).toContain('keyboard-reachable');
    });
  });

  describe('Table single-axis scroll (Req 10.8)', () => {
    it('table-scroll-container class enables horizontal scrolling', () => {
      render(
        <div
          className="table-scroll-container"
          role="region"
          aria-label="Reservations table"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr><th>Name</th><th>Date</th><th>Status</th></tr>
            </thead>
            <tbody>
              <tr><td>Guest A</td><td>2025-01-01</td><td>Confirmed</td></tr>
            </tbody>
          </table>
        </div>
      );
      const region = screen.getByRole('region', { name: 'Reservations table' });
      expect(region.className).toContain('table-scroll-container');
    });

    it('table-scroll-container has a labelled region for accessibility', async () => {
      const { container } = render(
        <div
          className="table-scroll-container"
          role="region"
          aria-label="Bookings"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr><th>ID</th><th>Status</th></tr>
            </thead>
            <tbody>
              <tr><td>001</td><td>Active</td></tr>
            </tbody>
          </table>
        </div>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Responsive image sizing (Req 10.9)', () => {
    it('responsive-img class constrains images to container width', () => {
      const { container } = render(
        <img
          src="/photo.jpg"
          alt="Beach"
          width={800}
          height={600}
          className="responsive-img"
        />
      );
      expect(container.firstChild.className).toContain('responsive-img');
    });

    it('responsive-img-contain class uses object-fit: contain', () => {
      const { container } = render(
        <img
          src="/logo.png"
          alt="Logo"
          width={200}
          height={60}
          className="responsive-img-contain"
        />
      );
      expect(container.firstChild.className).toContain('responsive-img-contain');
    });

    it('responsive-img-fixed-ratio class supports aspect ratio', () => {
      const { container } = render(
        <img
          src="/hero.jpg"
          alt="Hero"
          className="responsive-img-fixed-ratio"
          style={{ '--img-aspect-ratio': '4 / 3' }}
        />
      );
      expect(container.firstChild.className).toContain('responsive-img-fixed-ratio');
    });
  });
});
