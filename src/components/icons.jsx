const Svg = ({ size = 24, sw = 2, children, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={sw}
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

export const IconFlame = (p) => (
  <Svg {...p}>
    <path d="M12 2.8c.6 3.2-1.3 5-2.8 6.6C7.8 11 6.8 12.6 6.8 15a5.2 5.2 0 0 0 10.4 0c0-2-.9-3.6-2-4.8-.3 1.4-1 2.3-2.1 2.7.5-3.2-.2-6.8-1.1-10.1Z" />
  </Svg>
);

export const IconCalendar = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);

export const IconChart = (p) => (
  <Svg {...p}>
    <path d="M5 20v-7M10 20V6M15 20v-9M20 20V4" />
  </Svg>
);

export const IconMedal = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="14.5" r="5.5" />
    <path d="M8.6 10 6 3.2h4L12 7.6l2-4.4h4L15.4 10" />
  </Svg>
);

export const IconPlus = (p) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconGear = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Svg>
);

export const IconBack = (p) => (
  <Svg {...p}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);

export const IconNext = (p) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);

export const IconUp = (p) => (
  <Svg {...p}>
    <path d="m6 15 6-6 6 6" />
  </Svg>
);

export const IconDown = (p) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const IconCheck = (p) => (
  <Svg sw={3.2} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const IconX = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconShare = (p) => (
  <Svg {...p}>
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
    <path d="M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12" />
  </Svg>
);

export const IconSquarePlus = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
    <path d="M12 8v8M8 12h8" />
  </Svg>
);
