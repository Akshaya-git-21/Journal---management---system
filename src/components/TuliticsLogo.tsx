import React from 'react';

const tuliticsLogo = "https://tulitics.vercel.app/images/logo.png";

interface TuliticsLogoProps {
  className?: string;
  iconSize?: 'sm' | 'md' | 'lg' | 'xl' | number;
  showText?: boolean;
  textColorClass?: string;
  subTitle?: string;
  usePng?: boolean;
}

export default function TuliticsLogo({
  className = '',
  iconSize = 'md',
  showText = true,
  textColorClass = 'text-[#155e42]',
  subTitle,
  usePng = true,
}: TuliticsLogoProps) {
  // Determine pixel sizes
  let sizePx = 40;
  if (iconSize === 'sm') sizePx = 32;
  else if (iconSize === 'md') sizePx = 40;
  else if (iconSize === 'lg') sizePx = 48;
  else if (iconSize === 'xl') sizePx = 56;
  else if (typeof iconSize === 'number') sizePx = iconSize;

  const calculatedHeight = sizePx;
  // Logo aspect ratio is roughly 3.75 based on 300x80 layout
  const calculatedWidth = Math.round(sizePx * 3.75);

  return (
    <div className={`flex flex-col items-start select-none ${className}`}>
      <img
        src={tuliticsLogo}
        alt="Tulitics"
        className="object-contain"
        width={calculatedWidth}
        height={calculatedHeight}
        referrerPolicy="no-referrer"
      />
      {showText && subTitle && (
        <span className="text-[9px] font-mono tracking-widest text-slate-400 font-bold block mt-1 uppercase">
          {subTitle}
        </span>
      )}
    </div>
  );
}
