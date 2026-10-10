"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { signInAsDemo } from "@/lib/auth/actions";
import styles from "./Auth.module.css";

/** Local development only: sign in as the made-up demo household without a passkey. */
export function DemoSignIn() {
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className={styles.stack}>
      <Button
        variant="ghost"
        block
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await signInAsDemo();
            if (result?.error) setProblem(result.error);
          })
        }
      >
        Developer: sign in as the demo household
      </Button>
      <p role="alert" className={styles.problem}>
        {problem}
      </p>
    </div>
  );
}
