"use client";

import { Button } from "@/components/ui";

/** Loads the page again, for when the signal is back. */
export function TryAgain() {
  return (
    <Button variant="primary" size="lg" block icon="sync" onClick={() => location.reload()}>
      Try again
    </Button>
  );
}
