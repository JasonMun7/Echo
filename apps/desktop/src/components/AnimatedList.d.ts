import type { ReactNode } from "react";

export interface AnimatedListProps<T = unknown> {
  items?: T[];
  onItemSelect?: (item: T, index: number) => void;
  showGradients?: boolean;
  enableArrowNavigation?: boolean;
  className?: string;
  scrollContainerClassName?: string;
  itemClassName?: string;
  displayScrollbar?: boolean;
  initialSelectedIndex?: number;
  renderItem?: (item: T, index: number, selected: boolean) => ReactNode;
  maxHeight?: string | number;
  fillHeight?: boolean;
  interactive?: boolean;
  keyExtractor?: (item: T, index: number) => string | number;
}

declare const AnimatedList: <T = unknown>(props: AnimatedListProps<T>) => JSX.Element;
export default AnimatedList;
