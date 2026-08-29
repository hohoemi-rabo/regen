/**
 * ボタン(DESIGN §5.6)。高さ40px(モバイル44px)、角丸8px、14px 600。
 * ホバーで影を強めない。
 */
const variantClass = {
  primary: "bg-accent text-ink-on-dark hover:bg-accent-strong active:bg-accent-strong disabled:bg-surface disabled:text-ink-3 disabled:border disabled:border-line",
  secondary: "bg-surface border border-line text-ink-1 hover:border-accent disabled:text-ink-3 disabled:hover:border-line",
  ghost: "text-accent hover:text-accent-strong disabled:text-ink-3",
} as const;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: { variant?: keyof typeof variantClass } & React.ComponentProps<"button">) {
  return (
    <button
      className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-btn px-4 text-body font-semibold transition-colors duration-fast disabled:cursor-not-allowed sm:h-10 ${variantClass[variant]} ${className}`}
      {...props}
    />
  );
}
