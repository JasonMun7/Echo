declare module "@/components/Threads" {
  import type { ComponentType, HTMLAttributes } from "react";

  interface ThreadsProps extends HTMLAttributes<HTMLDivElement> {
    color?: number[];
    amplitude?: number;
    distance?: number;
    enableMouseInteraction?: boolean;
  }

  const Threads: ComponentType<ThreadsProps>;
  export default Threads;
}
