"use client";

import { Button, type ButtonProps } from "@/components/ui/button";

interface ConfirmButtonProps extends ButtonProps {
  message: string;
}

export function ConfirmButton({
  message,
  children,
  onClick,
  ...props
}: ConfirmButtonProps) {
  return (
    <Button
      {...props}
      onClick={(e) => {
        if (!confirm(message)) {
          e.preventDefault();
        } else if (onClick) {
          onClick(e);
        }
      }}
    >
      {children}
    </Button>
  );
}
