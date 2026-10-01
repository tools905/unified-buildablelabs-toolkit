"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

// A dashed box that accepts files dragged from the desktop. The children are a render function
// so they can react to a file being held over the box.
export function FileDropZone({
  onFiles,
  disabled = false,
  onBlockedDrop,
  className,
  children,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  onBlockedDrop?: () => void;
  className?: string;
  children: (dragging: boolean) => React.ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave also fire for every child element, so count them to know when the file really left.
  const depth = useRef(0);
  const carriesFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes("Files");

  return (
    <div
      className={cn("border border-dashed p-3 transition-colors", dragging ? "border-primary bg-primary/10" : "border-border", className)}
      onDragEnter={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        if (!disabled) setDragging(true);
      }}
      onDragOver={(event) => {
        if (!carriesFiles(event)) return;
        // Without this the browser would open the dropped file instead of handing it to us.
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      }}
      onDragLeave={(event) => {
        if (!carriesFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        if (disabled) onBlockedDrop?.();
        else onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {children(dragging)}
    </div>
  );
}
