/** @jsxImportSource react */
import { memo } from "react";
import {
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";

const defaultComponents = unstable_memoizeMarkdownComponents({
  a: ({ children, ...props }) => (
    <a target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
  code: function Code({ children, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock();
    return (
      <code data-code-block={isCodeBlock || undefined} {...props}>
        {children}
      </code>
    );
  },
});

function MarkdownTextImpl() {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="aui-md"
      components={defaultComponents}
    />
  );
}

export const MarkdownText = memo(MarkdownTextImpl);
