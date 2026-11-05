import CommentEditor from "@/components/activity/comment-editor";

type MarkdownRendererProps = {
  content: string;
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <CommentEditor
      value={content}
      readOnly
      showBubbleMenu={false}
      proseClassName="projects-tiptap-prose"
      contentClassName="projects-tiptap-content"
      className="[&_.projects-tiptap-content_.ProseMirror]:max-h-none [&_.projects-tiptap-content_.ProseMirror]:overflow-visible [&_.projects-tiptap-content_.ProseMirror]:px-0 [&_.projects-tiptap-content_.ProseMirror]:py-0"
    />
  );
}
