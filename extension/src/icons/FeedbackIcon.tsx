import React from 'react';
import feedbackSrc from './feedback.svg';

type Props = {
  /** Rendered pixel size (viewBox stays 24). */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

export default function FeedbackIcon({ size = 18, className, style }: Props) {
  return (
    <img
      src={feedbackSrc}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
    />
  );
}
