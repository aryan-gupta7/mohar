import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
/** shadcn/ui's class-name helper. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
