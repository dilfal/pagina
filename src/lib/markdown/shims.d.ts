declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';
  const plugin: (md: InstanceType<typeof MarkdownIt>, options?: { enabled?: boolean; label?: boolean; labelAfter?: boolean }) => void;
  export default plugin;
}

declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it';
  const plugin: (md: InstanceType<typeof MarkdownIt>) => void;
  export default plugin;
}
