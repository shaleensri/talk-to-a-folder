import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'text-sm font-medium ring-offset-background transition-all duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-40',
    'select-none active:scale-[0.97]',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-indigo-600 text-white shadow hover:bg-indigo-500 active:bg-indigo-700',
        secondary:
          'bg-zinc-800 text-zinc-100 border border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600',
        outline:
          'border border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600 hover:text-zinc-100',
        ghost:
          'bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
        destructive:
          'bg-red-900/30 text-red-400 border border-red-900/50 hover:bg-red-900/50 hover:border-red-800',
        link: 'text-indigo-400 underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-7 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-md px-6 text-base',
        icon: 'h-9 w-9',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
