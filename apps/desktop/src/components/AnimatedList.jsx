import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'motion/react';

const AnimatedItem = ({ children, delay = 0, index, onMouseEnter, onClick, interactive = true }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.5, triggerOnce: false });
  return (
    <motion.div
      ref={ref}
      data-index={index}
      onMouseEnter={interactive ? onMouseEnter : undefined}
      onClick={interactive ? onClick : undefined}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={inView ? { scale: 1, opacity: 1 } : { scale: 0.7, opacity: 0 }}
      transition={{ duration: 0.2, delay }}
      className={`mb-4 ${interactive ? 'cursor-pointer' : ''}`}
    >
      {children}
    </motion.div>
  );
};

const AnimatedList = ({
  items = [],
  onItemSelect,
  showGradients = true,
  enableArrowNavigation = true,
  className = '',
  scrollContainerClassName = '',
  itemClassName = '',
  displayScrollbar = true,
  initialSelectedIndex = -1,
  renderItem,
  maxHeight = '400px',
  fillHeight = false,
  interactive = true,
  keyExtractor,
}) => {
  const listRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
  const [keyboardNav, setKeyboardNav] = useState(false);
  const [topGradientOpacity, setTopGradientOpacity] = useState(0);
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState(1);

  const handleItemMouseEnter = useCallback(index => {
    setSelectedIndex(index);
  }, []);

  const handleItemClick = useCallback(
    (item, index) => {
      setSelectedIndex(index);
      if (onItemSelect) {
        onItemSelect(item, index);
      }
    },
    [onItemSelect]
  );

  const handleScroll = useCallback(e => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    setTopGradientOpacity(Math.min(scrollTop / 50, 1));
    const bottomDistance = scrollHeight - (scrollTop + clientHeight);
    setBottomGradientOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 50, 1));
  }, []);

  useEffect(() => {
    if (!enableArrowNavigation) return;
    const handleKeyDown = e => {
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setKeyboardNav(true);
        setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
      } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setKeyboardNav(true);
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          e.preventDefault();
          if (onItemSelect) {
            onItemSelect(items[selectedIndex], selectedIndex);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex, onItemSelect, enableArrowNavigation]);

  useEffect(() => {
    if (!keyboardNav || selectedIndex < 0 || !listRef.current) return;
    const container = listRef.current;
    const selectedItem = container.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedItem) {
      const extraMargin = 50;
      const containerScrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const itemTop = selectedItem.offsetTop;
      const itemBottom = itemTop + selectedItem.offsetHeight;
      if (itemTop < containerScrollTop + extraMargin) {
        container.scrollTo({ top: itemTop - extraMargin, behavior: 'smooth' });
      } else if (itemBottom > containerScrollTop + containerHeight - extraMargin) {
        container.scrollTo({
          top: itemBottom - containerHeight + extraMargin,
          behavior: 'smooth'
        });
      }
    }
    setKeyboardNav(false);
  }, [selectedIndex, keyboardNav]);

  const scrollStyle = {
    scrollbarWidth: displayScrollbar ? 'thin' : 'none',
    scrollbarColor: 'var(--echo-border-hover, #333) var(--echo-surface-solid, #0d0520)',
    ...(fillHeight ? { flex: 1, minHeight: 0 } : { maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight })
  };

  return (
    <div className={`relative w-full ${fillHeight ? 'flex flex-col min-h-0 flex-1' : ''} ${className}`}>
      <div
        ref={listRef}
        className={`overflow-y-auto p-4 ${scrollContainerClassName} ${fillHeight ? 'flex-1 min-h-0' : ''} ${
          displayScrollbar ? '[&::-webkit-scrollbar]:w-[8px] [&::-webkit-scrollbar-thumb]:rounded-[4px]' : 'scrollbar-hide'
        }`}
        style={scrollStyle}
        onScroll={handleScroll}
      >
        {items.map((item, index) => (
          <AnimatedItem
            key={keyExtractor ? keyExtractor(item, index) : index}
            delay={0.1}
            index={index}
            interactive={interactive}
            onMouseEnter={() => handleItemMouseEnter(index)}
            onClick={() => handleItemClick(item, index)}
          >
            {renderItem
              ? renderItem(item, index, interactive && selectedIndex === index)
              : (
                <div className={`p-4 rounded-lg ${itemClassName}`} style={{
                  background: selectedIndex === index ? 'var(--echo-surface-hover, #222)' : 'var(--echo-surface, #111)',
                  color: 'var(--echo-text, #fff)'
                }}>
                  <p className="m-0">{typeof item === 'string' ? item : JSON.stringify(item)}</p>
                </div>
              )}
          </AnimatedItem>
        ))}
      </div>
      {showGradients && (
        <>
          <div
            className="absolute top-0 left-0 right-0 h-[50px] pointer-events-none transition-opacity duration-300 ease"
            style={{
              opacity: topGradientOpacity,
              background: `linear-gradient(to bottom, var(--echo-bg) 0%, transparent 100%)`
            }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-[100px] pointer-events-none transition-opacity duration-300 ease"
            style={{
              opacity: bottomGradientOpacity,
              background: `linear-gradient(to top, var(--echo-bg) 0%, transparent 100%)`
            }}
          />
        </>
      )}
    </div>
  );
};

export default AnimatedList;
