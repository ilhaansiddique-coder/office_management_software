import React from 'react';

interface ProductIconProps {
  className?: string;
}

export const ProductIcon: React.FC<ProductIconProps> = ({ className = "w-full h-full" }) => {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Package/Box shape */}
      <rect
        x="3"
        y="6"
        width="18"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Top flap */}
      <path
        d="M3 8L12 4L21 8"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Bottom flap */}
      <path
        d="M3 18L12 14L21 18"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Package details */}
      <circle
        cx="8"
        cy="11"
        r="1"
        fill="currentColor"
      />
      <circle
        cx="16"
        cy="11"
        r="1"
        fill="currentColor"
      />
      {/* Package lines */}
      <line
        x1="12"
        y1="6"
        x2="12"
        y2="18"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.5"
      />
    </svg>
  );
};
