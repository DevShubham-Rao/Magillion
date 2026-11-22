export function SiteFooter() {
  return (
    <footer className="relative z-10 mx-auto mt-auto w-full max-w-3xl px-6 pb-8 pt-16 text-center text-xs leading-relaxed text-ash/80">
      <p>
        Card data, images and EDHREC ranks from{' '}
        <a className="underline decoration-ash/40 underline-offset-2 hover:text-parchment" href="https://scryfall.com" target="_blank" rel="noreferrer">
          Scryfall
        </a>
        . Popularity from{' '}
        <a className="underline decoration-ash/40 underline-offset-2 hover:text-parchment" href="https://edhrec.com" target="_blank" rel="noreferrer">
          EDHREC
        </a>
        .
      </p>
      <p className="mt-2">
        Magillion is unofficial Fan Content permitted under the Fan Content Policy. Not approved or endorsed by Wizards.
        Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
      </p>
    </footer>
  );
}
