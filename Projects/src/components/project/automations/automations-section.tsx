import { useTranslation } from "react-i18next";
import { AutomationCard } from "@/components/project/automations/automation-card";
import { AutomationsEmpty } from "@/components/project/automations/automations-empty";
import { AutomationsSkeleton } from "@/components/project/automations/automations-skeleton";
import { ConnectMoreNote } from "@/components/project/automations/connect-more-note";
import { useRepositoryConnections } from "@/components/project/automations/use-repository-connections";
import { planRuleChange } from "@/components/project/automations/plan-rule-change";
import type { RepositoryProviderId } from "@/components/project/automations/repository-providers";
import type { WorkflowEvent } from "@/components/project/automations/workflow-events";
import { useDeleteWorkflowRule } from "@/hooks/mutations/workflow-rule/use-delete-workflow-rule";
import { useUpsertWorkflowRule } from "@/hooks/mutations/workflow-rule/use-upsert-workflow-rule";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import { useGetWorkflowRules } from "@/hooks/queries/workflow-rule/use-get-workflow-rules";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast, toastSubject } from "@/lib/toast";

type AutomationsSectionProps = {
  projectId: string;
};

export function AutomationsSection({ projectId }: AutomationsSectionProps) {
  const { t } = useTranslation();
  const connections = useRepositoryConnections(projectId);
  const { data: columns = [], isLoading: columnsLoading } =
    useGetColumns(projectId);
  const { data: rules = [], isLoading: rulesLoading } =
    useGetWorkflowRules(projectId);
  const { mutateAsync: upsertRule } = useUpsertWorkflowRule();
  const { mutateAsync: deleteRule } = useDeleteWorkflowRule();
  const { canUpdateProjects } = useWorkspacePermission();
  const canEdit = canUpdateProjects();

  const changeRule = async (
    provider: RepositoryProviderId,
    event: WorkflowEvent,
    columnId: string | null,
  ) => {
    const change = planRuleChange(rules, provider, event, columnId);
    try {
      if (change.type === "upsert") {
        await upsertRule({
          projectId,
          data: {
            integrationType: provider,
            eventType: event,
            columnId: change.columnId,
          },
        });
        toast.success(t("settings:workflowEditor.toastSaved"), {
          description: toastSubject(
            `${provider} · ${t(`settings:workflowEditor.events.${event}`)}`,
          ),
        });
      }
      if (change.type === "delete") {
        await deleteRule({ id: change.id, projectId });
        toast.success(t("settings:workflowEditor.toastRemoved"), {
          description: toastSubject(
            `${provider} · ${t(`settings:workflowEditor.events.${event}`)}`,
          ),
        });
      }
    } catch (error) {
      toast.error(t("settings:workflowEditor.toastError"), {
        description:
          error instanceof Error && error.message ? error.message : undefined,
      });
    }
  };

  if (
    columnsLoading ||
    rulesLoading ||
    connections.some((connection) => connection.status.state === "loading")
  ) {
    return <AutomationsSkeleton />;
  }

  const connected = connections.filter(
    (connection) =>
      connection.status.state === "connected" ||
      connection.status.state === "paused",
  );
  const disconnected = connections.filter(
    (connection) => connection.status.state === "disconnected",
  );

  if (connected.length === 0) {
    return <AutomationsEmpty projectId={projectId} />;
  }

  return (
    <>
      {connected.map((connection) => (
        <AutomationCard
          key={connection.id}
          connection={connection}
          columns={columns}
          rules={rules.filter((rule) => rule.integrationType === connection.id)}
          canEdit={canEdit}
          onChange={(event, columnId) =>
            changeRule(connection.id, event, columnId)
          }
        />
      ))}
      {disconnected.length > 0 ? (
        <ConnectMoreNote
          projectId={projectId}
          providers={disconnected.map((connection) => connection.name)}
        />
      ) : null}
    </>
  );
}
