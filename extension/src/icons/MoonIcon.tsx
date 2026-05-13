import React from 'react';
import moonSrc from './moon.svg';

type Props = {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

export default function MoonIcon({ size = 24, className, style }: Props) {
  return (
    <img
      src={moonSrc}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
    />
  );
}
