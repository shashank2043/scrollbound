'use client';

import React from 'react';

interface CircularProgressProps {
  /** Progress percentage between 0 and 100. If omitted, an indeterminate spinner is shown. */
  progress?: number;
  /** Size in pixels (default: 48) */
  size?: number;
  /** Stroke width in pixels (default: 4) */
  strokeWidth?: number;
  /** Primary accent color or CSS variable (default: var(--sb-accent, #2563eb)) */
  color?: string;
  /** Optional label displayed below the circle */
  label?: string;
  /** Optional sub-label */
  sublabel?: string;
  className?: string;
}

export function CircularProgress({
  progress,
  size = 48,
  strokeWidth = 4,
  color = 'var(--sb-accent, #2563eb)',
  label,
  sublabel,
  className = '',
}: CircularProgressProps) {
  const isDeterminate = typeof progress === 'number' && !isNaN(progress);
  const clampedProgress = isDeterminate ? Math.max(0, Math.min(100, progress)) : 0;

  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = isDeterminate
    ? circumference - (clampedProgress / 100) * circumference
    : circumference * 0.25;

  return (
    <div className={`inline-flex flex-col items-center justify-center ${className}`}>
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className={`transform -rotate-90 ${!isDeterminate ? 'animate-spin' : ''}`}
        >
          {/* Background circle track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-black/10 dark:text-white/10"
          />

          {/* Foreground progress bar */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={isDeterminate ? 'transition-all duration-300 ease-out' : ''}
          />
        </svg>

        {/* Text inside the circle if determinate */}
        {isDeterminate && size >= 48 && (
          <div className="absolute inset-0 flex items-center justify-center font-mono font-semibold text-xs tracking-tighter">
            {Math.round(clampedProgress)}%
          </div>
        )}
      </div>

      {label && <div className="mt-3 text-sm font-medium">{label}</div>}
      {sublabel && <div className="mt-0.5 text-xs opacity-60">{sublabel}</div>}
    </div>
  );
}
