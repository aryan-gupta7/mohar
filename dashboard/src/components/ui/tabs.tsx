// shadcn/ui Tabs (Radix), restyled as an underlined strip.
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "../../lib/utils";
export const Tabs = TabsPrimitive.Root;
export const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(({ className, ...p }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn("flex gap-4 border-b border-line", className)} {...p} />
));
export const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(({ className, ...p }, ref) => (
  <TabsPrimitive.Trigger ref={ref} className={cn("-mb-px border-b-2 border-transparent pb-2 text-xs font-medium text-mute data-[state=active]:border-lime data-[state=active]:text-text", className)} {...p} />
));
export const TabsContent = TabsPrimitive.Content;
