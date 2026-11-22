import { Astrolabe } from './Astrolabe';

/** Magillion's own card back, shown while a card turns over. */
export function CardBack() {
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[18px] p-[9px]"
      style={{
        background: 'linear-gradient(145deg, #5b4a2a, #c8aa6e 25%, #6e5730 50%, #d8bd82 72%, #4a3b20)',
      }}
    >
      <div
        className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[11px]"
        style={{
          background:
            'radial-gradient(70% 55% at 50% 50%, #2a2236 0%, #15121e 55%, #0b0d13 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(232,217,174,.35), inset 0 0 40px rgba(0,0,0,.8)',
        }}
      >
        <div
          className="absolute inset-[10%] rounded-[50%]"
          style={{ border: '1px solid rgba(200,170,110,.45)', boxShadow: '0 0 30px rgba(200,170,110,.15) inset' }}
        />
        <Astrolabe size={170} />
        <p className="gold-text mt-3 font-display text-lg font-semibold tracking-[0.2em]">Magillion</p>
      </div>
    </div>
  );
}
