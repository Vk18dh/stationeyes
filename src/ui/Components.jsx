import React from 'react';
import { Palette } from './theme.js';

/**
 * The destination, drawn like a real Indian Railways platform board.
 */
export function PlatformBoard({
  platform,
  caption = 'Your target',
  numberSize = 'text-7xl',
  spokenLabel,
  className = '',
}) {
  const label = spokenLabel || `${caption}: Platform ${platform}`;

  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`w-full rounded-xl p-2.5 flex flex-col items-center select-none shadow-lg ${className}`}
      style={{
        backgroundColor: Palette.boardYellow,
        border: '4px solid #000000',
      }}
    >
      <div
        className="w-full flex flex-col items-center py-2 px-3 rounded-lg"
        style={{ border: '3px solid #000000' }}
      >
        <span className="text-black text-xl font-bold uppercase tracking-wider">{caption}</span>
        <span className="text-black text-3xl font-black uppercase tracking-tight">Platform</span>
        <span
          className={`text-black font-black leading-none my-1 tracking-tighter ${numberSize}`}
          style={{ fontSize: typeof numberSize === 'number' ? `${numberSize}px` : undefined }}
        >
          {platform}
        </span>
      </div>
    </div>
  );
}

/**
 * High-contrast primary action button with large touch target.
 */
export function BigButton({
  title,
  onClick,
  subtitle,
  icon,
  container = Palette.boardYellow,
  content = Palette.ink,
  border = 'none',
  enabled = true,
  minHeight = '96px',
  className = '',
  ariaLabel,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      aria-label={ariaLabel || (subtitle ? `${title}, ${subtitle}` : title)}
      style={{
        backgroundColor: enabled ? container : Palette.disabled,
        color: enabled ? content : Palette.ink,
        border: border,
        minHeight: minHeight,
      }}
      className={`w-full rounded-2xl px-5 py-4 flex items-center text-left transition-transform active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-md ${className}`}
    >
      {icon && (
        <span className="text-4xl mr-4 flex-shrink-0 select-none" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-2xl sm:text-3xl font-black leading-tight tracking-tight">{title}</div>
        {subtitle && (
          <div className="text-lg sm:text-xl font-medium opacity-90 leading-snug mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * Outline button with dark interior and crisp paper-white border.
 */
export function OutlineButton({
  title,
  onClick,
  subtitle,
  icon,
  minHeight = '72px',
  enabled = true,
  className = '',
}) {
  return (
    <BigButton
      title={title}
      onClick={onClick}
      subtitle={subtitle}
      icon={icon}
      container={Palette.ink}
      content={Palette.paper}
      border={`3px solid ${Palette.paper}`}
      minHeight={minHeight}
      enabled={enabled}
      className={className}
    />
  );
}

/**
 * Scrollable container ensuring accessibility on all screen sizes and large fonts.
 */
export function ScreenColumn({ children, className = '' }) {
  return (
    <div
      className={`min-h-screen w-full max-w-lg mx-auto flex flex-col justify-start p-5 pb-12 gap-4 box-border overflow-y-auto ${className}`}
    >
      {children}
    </div>
  );
}

export function Heading({ children, className = '' }) {
  return (
    <h1
      className={`text-3xl sm:text-4xl font-black text-white leading-tight tracking-tight m-0 ${className}`}
    >
      {children}
    </h1>
  );
}

export function Body({ children, color = Palette.paper, className = '' }) {
  return (
    <p
      className={`text-xl sm:text-2xl font-medium leading-relaxed m-0 ${className}`}
      style={{ color }}
    >
      {children}
    </p>
  );
}

/**
 * Loading overlay with high-contrast text.
 */
export function CheckingOverlay({ text = 'Checking…' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: Palette.scrim }}
    >
      <div className="flex flex-col items-center">
        <div
          className="text-4xl sm:text-5xl font-black animate-pulse text-center tracking-tight"
          style={{ color: Palette.boardYellow }}
        >
          {text}
        </div>
        <div className="mt-4 w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    </div>
  );
}
