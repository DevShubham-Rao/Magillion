/** The format notice, set as a gilded ribbon. */
export function FormatBanner() {
  return (
    <div className="flex items-center justify-center gap-3 px-4" role="note">
      <span aria-hidden="true" className="hidden h-px w-24 bg-gradient-to-r from-transparent to-gold/70 sm:block" />
      <svg viewBox="0 0 12 12" width={10} height={10} aria-hidden="true">
        <path d="M6 0 L12 6 L6 12 L0 6 Z" fill="#C8AA6E" />
      </svg>
      <p className="text-center font-display text-[11px] font-semibold tracking-[0.14em] text-gold-pale sm:text-[13px]">
        Constructed Format: Commander Legal Pool Only
      </p>
      <svg viewBox="0 0 12 12" width={10} height={10} aria-hidden="true">
        <path d="M6 0 L12 6 L6 12 L0 6 Z" fill="#C8AA6E" />
      </svg>
      <span aria-hidden="true" className="hidden h-px w-24 bg-gradient-to-l from-transparent to-gold/70 sm:block" />
    </div>
  );
}
