"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const components = {
  p: ({ children, ...props }: React.ComponentProps<"p">) => (
    <p className="text-base text-gray-600" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }: React.ComponentProps<"ul">) => (
    <ul className="my-2 flex flex-col gap-2 list-disc pl-5" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: React.ComponentProps<"ol">) => (
    <ol className="my-2 flex flex-col gap-2 list-decimal pl-5" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }: React.ComponentProps<"li">) => (
    <li className="text-base text-gray-600" {...props}>
      {children}
    </li>
  ),
  strong: ({ children, ...props }: React.ComponentProps<"strong">) => (
    <strong className="font-semibold text-[#150A35]" {...props}>
      {children}
    </strong>
  ),
  code: ({
    className,
    children,
    ...props
  }: React.ComponentProps<"code">) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <div
          className={cn(
            "my-2 rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] p-4 shadow-sm overflow-x-auto echo-card",
          )}
        >
          <code className="text-sm text-[#150A35] block whitespace-pre" {...props}>
            {children}
          </code>
        </div>
      );
    }
    return (
      <code
        className="rounded border border-[#A577FF]/20 bg-[#F5F7FC] px-1 text-sm text-[#150A35]"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }: React.ComponentProps<"pre">) => (
    <pre className="m-0 overflow-x-auto" {...props}>
      {children}
    </pre>
  ),
};

interface ChatMessageContentProps {
  children: string;
  className?: string;
}

export function ChatMessageContent({ children, className }: ChatMessageContentProps) {
  return (
    <div className={cn("prose prose-sm max-w-none", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
