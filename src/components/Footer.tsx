import { GithubIcon, SecuredByKleros, TelegramIcon, TwitterIcon } from "@/lib/icons";

export default function Footer() {
  return (
    <div className="bg-gradient-to-r from-blue-500 to-purple-600 flex flex-col lg:flex-row justify-between min-h-[64px] items-center max-lg:py-[24px] max-lg:space-y-[24px] px-[24px] text-white mt-auto">
      <div>
        <a href="https://kleros.io/" target="_blank" rel="noopener noreferrer">
          <SecuredByKleros />
        </a>
      </div>
      <div className="flex space-x-[16px] text-white">
        <a href="https://t.me/kleros" target="_blank" rel="noopener noreferrer">
          <TelegramIcon />
        </a>
        <a href="https://x.com/kleros_io" target="_blank" rel="noopener noreferrer">
          <TwitterIcon />
        </a>
        <a href="https://github.com/kleros" target="_blank" rel="noopener noreferrer">
          <GithubIcon />
        </a>
      </div>
    </div>
  );
}
