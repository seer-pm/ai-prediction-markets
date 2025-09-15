import React from "react";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";

interface Web3ButtonWrapperProps {
  children: React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>;
}

const Web3ButtonWrapper: React.FC<Web3ButtonWrapperProps> = ({ children }) => {
  const { isConnected, isConnecting } = useAccount();
  const { open } = useAppKit();

  // Override child's onClick
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (isConnected) {
      children.props.onClick?.(e); // call original button's onClick
    } else if (!isConnecting) {
      open(); // open wallet modal
    }
  };

  return React.cloneElement(children, {
    onClick: handleClick,
    disabled: children.props.disabled || isConnecting,
  });
};

export default Web3ButtonWrapper;
