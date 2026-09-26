import React, { useRef, useCallback } from 'react';

interface UseCalendarSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  minDistance?: number;
  maxTime?: number;
  preventScrollToleranceRatio?: number;
}

export function useCalendarSwipe({
  onSwipeLeft,
  onSwipeRight,
  minDistance = 45,
  maxTime = 700,
  preventScrollToleranceRatio = 1.3,
}: UseCalendarSwipeOptions) {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isVerticalScrollRef = useRef<boolean>(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
    isVerticalScrollRef.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartRef.current.x;
    const diffY = currentY - touchStartRef.current.y;

    // If movement is predominantly vertical, flag it as scrolling so horizontal swipe is aborted
    if (Math.abs(diffY) > Math.abs(diffX) * 1.1 && Math.abs(diffY) > 8) {
      isVerticalScrollRef.current = true;
    }
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;

      // If it was identified as vertical scrolling, do not trigger any calendar swipe navigation
      if (isVerticalScrollRef.current) {
        touchStartRef.current = null;
        isVerticalScrollRef.current = false;
        return;
      }

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = endX - touchStartRef.current.x;
      const diffY = endY - touchStartRef.current.y;
      const elapsed = Date.now() - touchStartRef.current.time;

      touchStartRef.current = null;
      isVerticalScrollRef.current = false;

      // Check thresholds for horizontal swipe navigation
      const isHorizontal = Math.abs(diffX) > Math.abs(diffY) * preventScrollToleranceRatio;
      const isSufficientDistance = Math.abs(diffX) >= minDistance;
      const isWithinTime = elapsed <= maxTime;

      if (isHorizontal && isSufficientDistance && isWithinTime) {
        if (diffX < 0 && onSwipeLeft) {
          // Swiped left -> move forward / next period
          onSwipeLeft();
        } else if (diffX > 0 && onSwipeRight) {
          // Swiped right -> move backward / previous period
          onSwipeRight();
        }
      }
    },
    [onSwipeLeft, onSwipeRight, minDistance, maxTime, preventScrollToleranceRatio]
  );

  const onTouchCancel = useCallback(() => {
    touchStartRef.current = null;
    isVerticalScrollRef.current = false;
  }, []);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  };
}
