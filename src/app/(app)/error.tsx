"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="card-surface mx-auto mt-10 max-w-md p-6 text-center">
      <h2 className="text-base font-semibold">Something went wrong</h2>
      <p className="mt-1 text-sm text-muted-foreground">The page could not be loaded. A data provider may be temporarily unavailable. Nothing was changed.</p>
      <Button onClick={() => retry()} className="mt-4" size="sm">
        Try again
      </Button>
    </div>
  );
}
