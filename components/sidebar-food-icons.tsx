import type React from "react"

const sharedProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

export function SauceBottleIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedProps} className={className} {...props}>
      <path d="M10 2h4v3h-4z" />
      <path d="M9.5 5h5L16 8.5V18a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V8.5L9.5 5Z" />
      <path d="M8.5 11h7" />
      <path d="M11 15c.8-.8 1.2-.8 2 0" />
    </svg>
  )
}

export function CoxinhaIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedProps} className={className} {...props}>
      <path d="M12 3c0 0-5 5.2-5 10a5 5 0 0 0 10 0c0-4.8-5-10-5-10Z" />
      <path d="M8.5 17.5c1 .9 2.1 1.5 3.5 1.5s2.5-.6 3.5-1.5" />
      <path d="M9 21h6" />
    </svg>
  )
}
