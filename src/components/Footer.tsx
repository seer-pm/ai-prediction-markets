import { GithubIcon, SecuredByKleros, TelegramIcon, TwitterIcon } from "@/lib/icons";

const SOCIALS = [
  { href: "https://t.me/kleros", label: "Telegram", Icon: TelegramIcon },
  { href: "https://x.com/kleros_io", label: "X", Icon: TwitterIcon },
  { href: "https://github.com/kleros", label: "GitHub", Icon: GithubIcon },
];

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-rule bg-surface">
      <div className="mx-auto flex max-w-[86rem] flex-col items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:px-8">
        <a
          href="https://kleros.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-3 transition-opacity hover:opacity-70"
        >
          <SecuredByKleros />
        </a>

        <div className="flex items-center gap-4 text-ink-3">
          {SOCIALS.map(({ href, label, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="transition-opacity hover:opacity-70"
            >
              <Icon />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
