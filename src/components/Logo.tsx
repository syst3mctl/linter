interface Props {
  className?: string;
}

/**
 * lintctl mark — three stacked code lines (varying widths) with a green
 * checkmark stroke that crosses them. Echoes usectl's geometric green
 * glyph + monospace wordmark style.
 */
export function Logo({ className }: Props) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ''}`}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Three "code lines" — top brightest, dimmer downward */}
        <rect x="2" y="6" width="14" height="2.5" rx="1.25" fill="#11A32A" />
        <rect
          x="2"
          y="13"
          width="10"
          height="2.5"
          rx="1.25"
          fill="#11A32A"
          opacity="0.55"
        />
        <rect
          x="2"
          y="20"
          width="12"
          height="2.5"
          rx="1.25"
          fill="#11A32A"
          opacity="0.55"
        />
        {/* Check mark crossing through the lines */}
        <path
          d="M18 18 L22.5 22.5 L30 12.5"
          stroke="#11A32A"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-[18px] font-semibold tracking-tight text-ink">
          lintctl
        </span>
      </div>
    </div>
  );
}
