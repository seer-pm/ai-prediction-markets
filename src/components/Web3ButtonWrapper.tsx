import React, { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";

interface Web3ButtonWrapperProps {
  children: React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>;
}

const Web3ButtonWrapper: React.FC<Web3ButtonWrapperProps> = ({ children }) => {
  const { isConnected, isConnecting } = useAccount();
  const { open } = useAppKit();

  const pendingClickRef = useRef<((e: React.MouseEvent<HTMLButtonElement>) => void) | null>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (isConnected) {
      children.props.onClick?.(e);
    } else if (!isConnecting) {
      // Save original handler to run after connection
      pendingClickRef.current = children.props.onClick
        ? (event) => children.props.onClick?.(event)
        : null;

      open(); // open wallet modal
    }
  };

  // When connection succeeds, run pending click handler
  useEffect(() => {
    if (isConnected && pendingClickRef.current) {
      // Fire original onClick without requiring another user click
      pendingClickRef.current(new MouseEvent("click") as any);
      pendingClickRef.current = null;
    }
  }, [isConnected]);

  return React.cloneElement(children, {
    onClick: handleClick,
    disabled: children.props.disabled || isConnecting,
  });
};

export default Web3ButtonWrapper;
