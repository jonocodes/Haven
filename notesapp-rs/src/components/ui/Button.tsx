import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive' | 'link'
type ButtonSize = 'sm' | 'md'

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-blue-500 text-white hover:bg-blue-600',
  outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
  ghost: 'text-gray-500 hover:text-gray-700',
  destructive: 'text-red-400 hover:text-red-600',
  link: 'text-sm text-gray-400 hover:text-gray-600',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded',
  md: 'px-4 py-1.5 text-sm rounded',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({ className, variant = 'default', size = 'sm', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        variant !== 'link' ? sizeClasses[size] : '',
        className,
      )}
      {...props}
    />
  )
}
