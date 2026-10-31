import { useTranslation } from "react-i18next";
import type { uploadTaskImage } from "@/lib/upload-task-image";
import CommentEditor from "@/components/activity/comment-editor";

type TaskDescriptionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  taskId?: string;
  projectId?: string;
  ensureTaskId?: () => Promise<string | null>;
  uploadAsset?: (
    file: File,
  ) => Promise<Awaited<ReturnType<typeof uploadTaskImage>>>;
};

export default function TaskDescriptionEditor({
  value,
  onChange,
  placeholder,
  taskId,
  projectId,
  ensureTaskId,
  uploadAsset,
}: TaskDescriptionEditorProps) {
  const { t } = useTranslation();

  return (
    <CommentEditor
      value={value}
      onChange={onChange}
      placeholder={placeholder ?? t("tasks:detail.addDescription")}
      taskId={taskId}
      projectId={projectId}
      ensureTaskId={ensureTaskId}
      uploadAsset={uploadAsset}
      uploadSurface="description"
      className="[&_.projects-comment-editor-content_.ProseMirror]:min-h-[11rem] [&_.projects-comment-editor-content_.ProseMirror]:max-h-none [&_.projects-comment-editor-content_.ProseMirror]:overflow-visible [&_.projects-comment-editor-content_.ProseMirror]:px-0 [&_.projects-comment-editor-content_.ProseMirror]:pt-1 [&_.projects-comment-editor-content_.ProseMirror]:pb-2"
    />
  );
}
