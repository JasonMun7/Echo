import type { ReactNode } from 'react';
import './SpotlightCard.css';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const SpotlightCard = ({
  children,
  className = '',
  style,
}: SpotlightCardProps) => {
  return (
    <div className={`card-spotlight ${className}`} style={style}>
      {children}
    </div>
  );
};

export default SpotlightCard;
