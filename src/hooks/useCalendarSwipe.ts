import React, { useRef, useCallback } from 'react';

interface UseCalendarSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  minDistance?: number;
  maxTime?: number;
  preventScrollToleranceRatio?: number;
  requireBottomForSwipeUp?: boolean;
  requireTopForSwipeDown?: boolean;
}

/**
 * Checks if a given element or any of its scrollable parent containers
 * are scrolled to the bottom of their scrollable content.
 */
function checkIsAtBottom(element: HTMLElement | null): boolean {
  if (!element) return true;

  // Check element and its parent hierarchy
  let current: HTMLElement | null = element;
  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      if (current.scrollHeight > current.clientHeight + 8) {
        const atBottom = current.scrollTop + current.clientHeight >= current.scrollHeight - 16;
        if (!atBottom) return false;
      }
    }
    current = current.parentElement;
  }

  // Check known app-level scroll containers
  const mainStage = document.getElementById('main-stage-content');
  if (mainStage && mainStage.scrollHeight > mainStage.clientHeight + 8) {
    const atBottom = mainStage.scrollTop + mainStage.clientHeight >= mainStage.scrollHeight - 16;
    if (!atBottom) return false;
  }

  const monthView = document.getElementById('calendar-month-view');
  if (monthView && monthView.scrollHeight > monthView.clientHeight + 8) {
    const atBottom = monthView.scrollTop + monthView.clientHeight >= monthView.scrollHeight - 16;
    if (!atBottom) return false;
  }

  return true;
}

/**
 * Checks if a given element or any of its scrollable parent containers
 * are at the top of their scrollable content.
 */
function checkIsAtTop(element: HTMLElement | null): boolean {
  if (!element) return true;

  let current: HTMLElement | null = element;
  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      if (current.scrollTop > 12) {
        return false;
      }
    }
    current = current.parentElement;
  }

  const mainStage = document.getElementById('main-stage-content');
  if (mainStage && mainStage.scrollTop > 12) {
    return false;
  }

  const monthView = document.getElementById('calendar-month-view');
  if (monthView && monthView.scrollTop > 12) {
    return false;
  }

  return true;
}

export function useCalendarSwipe({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  minDistance = 45,
  maxTime = 700,
  preventScrollToleranceRatio = 1.2,
  requireBottomForSwipeUp = false,
  requireTopForSwipeDown = false,
}: UseCalendarSwipeOptions) {
  const touchStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    target: HTMLElement | null;
    atBottom: boolean;
    atTop: boolean;
  } | null>(null);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
        target,
        atBottom: requireBottomForSwipeUp ? checkIsAtBottom(target) : true,
        atTop: requireTopForSwipeDown ? checkIsAtTop(target) : true,
      };
    },
    [requireBottomForSwipeUp, requireTopForSwipeDown]
  );

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    // Touch tracking continues without prematurely aborting
    if (!touchStartRef.current || e.touches.length !== 1) return;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;

      const { x: startX, y: startY, time: startTime, target, atBottom: startedAtBottom, atTop: startedAtTop } =
        touchStartRef.current;

      touchStartRef.current = null;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = endX - startX;
      const diffY = endY - startY;
      const elapsed = Date.now() - startTime;

      if (elapsed > maxTime) return;

      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);

      if (absX < minDistance && absY < minDistance) return;

      // Determine predominant gesture direction
      const isHorizontal = absX > absY * preventScrollToleranceRatio;
      const isVertical = absY > absX * preventScrollToleranceRatio;

      // 1. Horizontal Swipes (Left = Next, Right = Previous)
      if (isHorizontal && absX >= minDistance) {
        if (diffX < 0 && onSwipeLeft) {
          onSwipeLeft();
        } else if (diffX > 0 && onSwipeRight) {
          onSwipeRight();
        }
        return;
      }

      // 2. Vertical Swipes (Up = Next, Down = Previous)
      if (isVertical && absY >= minDistance) {
        if (diffY < 0 && onSwipeUp) {
          // Swipe UP (finger moves up) -> Next Period
          if (requireBottomForSwipeUp) {
            const currentlyAtBottom = checkIsAtBottom(target);
            if (startedAtBottom && currentlyAtBottom) {
              onSwipeUp();
            }
          } else {
            onSwipeUp();
          }
        } else if (diffY > 0 && onSwipeDown) {
          // Swipe DOWN (finger moves down) -> Previous Period
          if (requireTopForSwipeDown) {
            const currentlyAtTop = checkIsAtTop(target);
            if (startedAtTop && currentlyAtTop) {
              onSwipeDown();
            }
          } else {
            onSwipeDown();
          }
        }
      }
    },
    [
      onSwipeLeft,
      onSwipeRight,
      onSwipeUp,
      onSwipeDown,
      minDistance,
      maxTime,
      preventScrollToleranceRatio,
      requireBottomForSwipeUp,
      requireTopForSwipeDown,
    ]
  );

  const onTouchCancel = useCallback(() => {
    touchStartRef.current = null;
  }, []);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  };
}
