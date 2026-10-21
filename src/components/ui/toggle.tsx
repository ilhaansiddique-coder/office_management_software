import * as React from "react"
import * as TogglePrimitive from "@radix-ui/react-toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const toggleVariants = cva(
  "btn btn-ghost inline-flex items-center justify-center rounded-lg text-sm font-medium no-animation transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent/15 data-[state=on]:text-accent",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "btn-outline border-base-300 bg-base-100 hover:bg-base-200",
      },
      size: {
        default: "h-10 min-h-10 px-3",
        sm: "h-9 min-h-9 px-2.5",
        lg: "h-11 min-h-11 px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> &
    VariantProps<typeof toggleVariants>
>(({ className, variant, size, ...props }, ref) => (
  <TogglePrimitive.Root
    ref={ref}
    className={cn(toggleVariants({ variant, size, className }))}
    {...props}
  />
))

Toggle.displayName = TogglePrimitive.Root.displayName

export { Toggle, toggleVariants }
