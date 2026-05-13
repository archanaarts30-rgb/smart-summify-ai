import React from 'react';
import langSrc from './lang_icon.png';

type Props = {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

export default function LangIcon({ size = 18, className, style }: Props) {
  return (
    <img
      src={langSrc}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{ display: 'block', flexShrink: 0, objectFit: 'contain', ...style }}
    />
  );
}
