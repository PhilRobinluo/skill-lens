"use client";

import { Button } from "@/components/ui/button";

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  fullPage?: boolean;
}

export function ErrorMessage({
  message,
  onRetry,
  fullPage = true,
}: ErrorMessageProps) {
  const content = (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {message}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center p-6">
        {content}
      </div>
    );
  }

  return content;
}
