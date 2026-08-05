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
      size="sm"
      loading={isConnecting}
      onClick={() => open({ view: "Connect" })}
      iconLeft={isConnecting ? undefined : <WalletIcon />}
    >
      {isConnecting ? "Connecting" : "Connect wallet"}
    </Button>
  );
};
