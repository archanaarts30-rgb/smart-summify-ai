import React from 'react';
import sunSrc from './sun.svg';

type Props = {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

export default function SunIcon({ size = 24, className, style }: Props) {
  return (
    <img
      src={sunSrc}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
    />
  );
}
