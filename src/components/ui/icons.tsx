import type { SVGProps } from "react";

/**
 * Interface glyphs for the primitive set. Uniform API (all take standard SVG
 * props, all inherit `currentColor`, all 16px on a 16 grid) — unlike
 * `src/lib/icons.tsx`, which is a mix of string-sized and attribute-sized
 * components with hard-coded fills. That file keeps the brand marks and logos.
 */

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

export const CheckIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M3 8.5 6.2 11.5 13 4.5" />
  </svg>
);

export const XIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export const ChevronDownIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 6l4 4 4-4" />
  </svg>
);

export const ChevronRightIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M6 4l4 4-4 4" />
  </svg>
);

export const ArrowRightIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" />
  </svg>
);

export const AlertIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 5v3.5M8 11h.01" />
  </svg>
);

export const InfoIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.5v3.5M8 5h.01" />
  </svg>
);

export const CopyIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 3.5h-7a1 1 0 0 0-1 1v7" />
  </svg>
);

export const UploadIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M8 11V3M5 6l3-3 3 3M2.5 11v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V11" />
  </svg>
);

export const DownloadIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M8 3v8M5 8l3 3 3-3M2.5 11v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V11" />
  </svg>
);

export const ExternalIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M9.5 3.5H12.5V6.5M12.5 3.5 7.5 8.5" />
    <path d="M12 9.5v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
  </svg>
);

export const SearchIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="7.2" cy="7.2" r="4.2" />
    <path d="m10.4 10.4 2.6 2.6" />
  </svg>
);

export const WalletIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M2.5 5.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1" />
    <rect x="2.5" y="5.5" width="11" height="7" rx="1" />
    <path d="M10.5 9h.01" />
  </svg>
);

export const BookIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M2.5 3.5h4a2 2 0 0 1 1.5 1.9V13a1.6 1.6 0 0 0-1.3-.9H2.5z" />
    <path d="M13.5 3.5h-4A2 2 0 0 0 8 5.4V13a1.6 1.6 0 0 1 1.3-.9h4.2z" />
  </svg>
);

export const FilterIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M2.5 4h11L9.5 8.6v3.6l-3 1.3V8.6z" />
  </svg>
);

export const TrashIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M3 4.5h10M6.5 4.5V3.2a.7.7 0 0 1 .7-.7h1.6a.7.7 0 0 1 .7.7v1.3" />
    <path d="M4.3 4.5 5 13a.8.8 0 0 0 .8.7h4.4a.8.8 0 0 0 .8-.7l.7-8.5" />
  </svg>
);

/**
 * The one brand mark in this set. Unlike its neighbours it is a filled glyph, not a stroked one —
 * the X logo has no stroked form — but it still inherits `currentColor` and sits on the 16 grid.
 */
export const XLogoIcon = (props: IconProps) => (
  <svg {...base(props)} stroke="none" fill="currentColor">
    <path d="M12.6 1.5h2.45l-5.36 6.13L16 14.5h-4.94l-3.87-5.06-4.43 5.06H.31l5.73-6.55L0 1.5h5.06l3.5 4.63L12.6 1.5Zm-.86 11.54h1.36L4.32 2.89H2.86l8.88 10.15Z" />
  </svg>
);
