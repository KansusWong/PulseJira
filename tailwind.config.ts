import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      /* Design tokens: use bg-[var(--bg-surface)] syntax in components (matches plan convention) */
      colors: {
        /* Legacy aliases — keep existing Tailwind classes working */
        background: "var(--background)",
        foreground: "var(--foreground)",
        border: "var(--border)",
        paper: "var(--paper)",
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          subtle: "var(--accent-subtle)",
          ghost: "var(--accent-ghost)",
          foreground: "var(--accent-foreground)",
        },
        /* Design-token surface colors */
        "bg-base": "var(--bg-base)",
        "bg-surface": "var(--bg-surface)",
        "bg-elevated": "var(--bg-elevated)",
        "bg-glass": "var(--bg-glass)",
        "bg-hover": "var(--bg-hover)",
        /* Design-token text colors */
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        /* Design-token border colors */
        "border-subtle": "var(--border-subtle)",
        "border-default": "var(--border-default)",
        "border-accent": "var(--border-accent)",
        /* Agent accent colors */
        "accent-pm": "var(--accent-pm)",
        "accent-tech-lead": "var(--accent-tech-lead)",
        "accent-critic": "var(--accent-critic)",
        "accent-researcher": "var(--accent-researcher)",
        "accent-blue-team": "var(--accent-blue-team)",
        "accent-arbitrator": "var(--accent-arbitrator)",
      },
      borderRadius: {
        "sm-token": "var(--radius-sm)",
        "md-token": "var(--radius-md)",
        "lg-token": "var(--radius-lg)",
        "xl-token": "var(--radius-xl)",
        "full-token": "var(--radius-full)",
      },
      spacing: {
        "space-xs": "var(--space-xs)",
        "space-sm": "var(--space-sm)",
        "space-md": "var(--space-md)",
        "space-lg": "var(--space-lg)",
        "space-xl": "var(--space-xl)",
        "space-2xl": "var(--space-2xl)",
      },
      boxShadow: {
        "token-sm": "var(--shadow-sm)",
        "token-md": "var(--shadow-md)",
        "token-lg": "var(--shadow-lg)",
        "token-glow": "var(--shadow-glow)",
      },
      fontSize: {
        "token-xl": "var(--text-xl)",
        "token-md": "var(--text-md)",
        "token-base": "var(--text-base)",
        "token-sm": "var(--text-sm)",
        "token-label": "var(--text-label)",
      },
      fontFamily: {
        code: "var(--font-code)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
      animation: {
        "shimmer": "shimmer 1.5s infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "slide-in-right": "slide-in-right 0.25s ease-out both",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 8px rgba(245,158,11,0.15)" },
          "50%": { boxShadow: "0 0 20px rgba(245,158,11,0.35)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(16px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
export default config;
