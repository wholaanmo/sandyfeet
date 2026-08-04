'use client';

/**
 * Transition wrapper component for enter/exit animations.
 *
 * Applies continuity-preserving CSS transitions using the shared motion system.
 * Respects reduced-motion preference by skipping animation entirely.
 * Uses 100–300ms duration range from design tokens.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.6
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Hook to detect reduced motion preference.
 * @returns {boolean} true if user prefers reduced motion
 */
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    return mq ? mq.matches : false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

/**
 * @typedef {'fade'|'slide'|'scale'} TransitionType
 */

/**
 * Transition component that wraps children with enter/exit CSS transitions.
 *
 * @param {object} props
 * @param {boolean} props.show - Whether the content is visible
 * @param {TransitionType} [props.type='fade'] - Transition type
 * @param {React.ReactNode} props.children - Content to transition
 * @param {string} [props.className] - Additional classes for the wrapper
 * @param {function} [props.onEntered] - Callback after enter transition completes
 * @param {function} [props.onExited] - Callback after exit transition completes
 * @param {boolean} [props.unmountOnExit=true] - Whether to unmount children when hidden
 */
export function Transition({
  show,
  type = 'fade',
  children,
  className = '',
  onEntered,
  onExited,
  unmountOnExit = true,
}) {
  const reducedMotion = useReducedMotion();
  const nodeRef = useRef(null);
  const isInitialMount = useRef(true);
  const [mounted, setMounted] = useState(show || !unmountOnExit);
  const [phase, setPhase] = useState(show ? 'entered' : 'exited');

  const prefix = `motion-${type}`;

  // Handle show changes
  useEffect(() => {
    // Skip the initial mount effect — initial state is already set correctly
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (show) {
      // Mount and begin enter
      setMounted(true);
      if (reducedMotion) {
        setPhase('entered');
        onEntered?.();
      } else {
        // Start with enter initial state
        setPhase('enter');
        // Trigger enter-active on next frame for CSS transition
        const raf = requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setPhase('enter-active');
          });
        });
        return () => cancelAnimationFrame(raf);
      }
    } else {
      // Begin exit
      if (reducedMotion) {
        setPhase('exited');
        if (unmountOnExit) setMounted(false);
        onExited?.();
      } else {
        setPhase('exit');
        const raf = requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setPhase('exit-active');
          });
        });
        return () => cancelAnimationFrame(raf);
      }
    }
  }, [show, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle transition end
  const handleTransitionEnd = useCallback(
    (e) => {
      // Only respond to transitions on our own node
      if (e.target !== nodeRef.current) return;

      if (phase === 'enter-active') {
        setPhase('entered');
        onEntered?.();
      } else if (phase === 'exit-active') {
        setPhase('exited');
        if (unmountOnExit) setMounted(false);
        onExited?.();
      }
    },
    [phase, unmountOnExit, onEntered, onExited]
  );

  // Don't render if unmounted
  if (!mounted && unmountOnExit) {
    return null;
  }

  // Compute CSS classes based on phase
  let transitionClasses = '';
  switch (phase) {
    case 'enter':
      transitionClasses = `${prefix}-enter`;
      break;
    case 'enter-active':
      transitionClasses = `${prefix}-enter ${prefix}-enter-active`;
      break;
    case 'entered':
      transitionClasses = '';
      break;
    case 'exit':
      transitionClasses = `${prefix}-exit`;
      break;
    case 'exit-active':
      transitionClasses = `${prefix}-exit ${prefix}-exit-active`;
      break;
    case 'exited':
      transitionClasses = `${prefix}-exit-active`;
      break;
    default:
      transitionClasses = '';
  }

  // When exited but still mounted (unmountOnExit=false), hide visually
  const hiddenStyle =
    phase === 'exited' && !show ? { display: 'none' } : undefined;

  return (
    <div
      ref={nodeRef}
      className={`motion-stable ${transitionClasses} ${className}`.trim()}
      onTransitionEnd={handleTransitionEnd}
      style={hiddenStyle}
      aria-hidden={phase === 'exited' && !show ? true : undefined}
    >
      {children}
    </div>
  );
}

export { useReducedMotion };
export default Transition;
