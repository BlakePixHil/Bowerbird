"use client";

import { useEffect } from "react";
import { forgetThisDevice } from "./forget";

/**
 * On the sign-in page: forgets the pages and waiting changes this device kept, whether the person
 * signed out here, somewhere else, or their session ran out. Draws nothing.
 */
export function ForgetThisDevice() {
  useEffect(() => void forgetThisDevice(), []);
  return null;
}
