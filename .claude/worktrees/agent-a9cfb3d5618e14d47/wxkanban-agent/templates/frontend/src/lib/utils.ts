import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// [SCOPE 036 / T010] BEGIN — src/lib/utils.ts — cn helper
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
// [SCOPE 036 / T010] END
