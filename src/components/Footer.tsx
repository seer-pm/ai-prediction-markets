import { seerApps } from "@seer-pm/ui-kit";
import { EcosystemFooter } from "@seer-pm/ui-kit/react";
import { GUIDE_URL } from "@/utils/constants";
import { PATHS } from "@/utils/views";

const DEEP_LINKS = [
  { name: "Markets", url: PATHS.markets },
  { name: "Leaderboard", url: PATHS.leaderboard },
  { name: "Guide", url: GUIDE_URL },
];

const TAGLINE = seerApps.find((app) => app.id === "deep")?.summary;

/**
 * The footer every Seer site closes with, with Deep's own pages first. Its column takes the page
 * container's width and gutters (`CONTAINER` in App.tsx) so the edges line up.
 */
export default function Footer() {
  return (
    <div className="mt-auto [--seer-footer-gutter:16px] [--seer-footer-max-width:86rem] sm:[--seer-footer-gutter:24px] lg:[--seer-footer-gutter:32px]">
      <EcosystemFooter
        appName="Deep"
        homeUrl={PATHS.markets}
        tagline={TAGLINE}
        groups={[{ title: "Deep", links: DEEP_LINKS }]}
      />
    </div>
  );
}
