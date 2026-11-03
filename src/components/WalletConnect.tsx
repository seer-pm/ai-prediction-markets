import { Button } from "@/components/ui";
import { WalletIcon } from "@/components/ui/icons";
import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";

export const WalletConnect = () => {
  const { isConnecting } = useAccount();
  const { open } = useAppKit();

  return (
    <Button
      variant="primary"
      loading={isConnecting}
      onClick={() => open({ view: "Connect" })}
      iconLeft={<WalletIcon />}
    >
      {isConnecting ? (
        "Connecting"
      ) : (
        // A phone's header holds the full lockup, this and the menu: there the button is its icon,
        // with the label kept for screen readers, and the onboarding rail below it spells it out.
        <span className="max-sm:sr-only">Connect wallet</span>
      )}
    </Button>
  );
};
