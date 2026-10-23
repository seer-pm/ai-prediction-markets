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
        // One node, so the button's gap does not land inside the label. A phone's header holds
        // the lockup, this and the menu, and nothing wider.
        <span>
          Connect<span className="max-sm:sr-only"> wallet</span>
        </span>
      )}
    </Button>
  );
};
