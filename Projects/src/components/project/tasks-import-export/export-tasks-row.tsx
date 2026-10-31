import { saveAs } from "file-saver";
import { Loader2, Upload, DownloadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsRow } from "@/components/settings/settings-row";
import { Button } from "@/components/ui/button";
import useExportTasks from "@/hooks/mutations/task/use-export-tasks";
import { toast, toastSubject } from "@/lib/toast";
import type { ProjectWithTasks } from "@/types/project";

type ExportTasksRowProps = {
  project: ProjectWithTasks;
};

export function ExportTasksRow({ project }: ExportTasksRowProps) {
  const { t } = useTranslation();
  const { mutateAsync: exportTasks, isPending } = useExportTasks();

  const handleExport = async () => {
    const loadingToast = toast.loading(t("settings:tasksImportExport.exporting"));
    try {
      const exportData = await exportTasks(project.id);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });

      saveAs(blob, `${project.slug}-tasks-export.json`);

      toast.dismiss(loadingToast);
      toast.success(t("settings:tasksImportExport.exportSuccess"), {
        description: toastSubject(project.name),
        icon: DownloadIcon,
      });
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(t("settings:tasksImportExport.exportError"), {
        description:
          error instanceof Error && error.message ? error.message : undefined,
      });
      console.error(error);
    }
  };

  return (
    <SettingsRow
      icon={<Upload />}
      title={t("settings:tasksImportExport.exportTasks")}
      description={t("settings:tasksImportExport.exportDescription")}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-24"
        onClick={handleExport}
        disabled={isPending}
      >
        {isPending ? <Loader2 className="animate-spin" /> : null}
        {t("settings:tasksImportExport.export")}
      </Button>
    </SettingsRow>
  );
}
