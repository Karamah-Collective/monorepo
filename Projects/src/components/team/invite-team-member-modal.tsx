import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useQueryClient } from "@tanstack/react-query";
import { SendIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import useInviteWorkspaceUser from "@/hooks/mutations/workspace-user/use-invite-workspace-user";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { useProjectMemberDirectory } from "@/hooks/queries/workspace-users/use-project-member-directory";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast, toastSubject } from "@/lib/toast";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import InvitationLinkField from "./invitation-link-field";
import WorkspaceProjectAccessFields, {
  type WorkspaceProjectAccessValue,
} from "./workspace-project-access-fields";

type Props = {
  open: boolean;
  onClose: () => void;
};

const teamMemberSchema = z.object({
  email: z.string(),
});

type TeamMemberFormValues = z.infer<typeof teamMemberSchema>;

function InviteTeamMemberModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const { mutateAsync } = useInviteWorkspaceUser();
  const queryClient = useQueryClient();
  const { data: workspace } = useActiveWorkspace();
  const workspaceId = workspace?.id;
  const { canInviteUsers, isCheckingPermissions } = useWorkspacePermission();
  const canInvite = canInviteUsers();
  const [createdInvitation, setCreatedInvitation] = useState<{
    id: string;
    email: string;
  } | null>(null);
  const [chosenAccess, setProjectAccess] =
    useState<WorkspaceProjectAccessValue | null>(null);
  const [showProjectAccessError, setShowProjectAccessError] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { data: projects, isLoading: isLoadingProjects } = useGetProjects({
    workspaceId: workspaceId ?? "",
    includeArchived: true,
    enabled: open,
  });
  const workspaceProjects = (projects ?? []) as readonly {
    id: string;
    name: string;
    archivedAt?: string | null;
  }[];

  const form = useForm<TeamMemberFormValues>({
    resolver: standardSchemaResolver(teamMemberSchema),
    defaultValues: {
      email: "",
    },
  });
  const emailValue = form.watch("email");
  const { data: directoryMembers = [], isFetching: isFetchingDirectory } =
    useProjectMemberDirectory(workspaceId ?? "", emailValue, open);
  const projectAccess = chosenAccess ?? {
    workspaceRole: "member",
    projectRoles: {},
  } satisfies WorkspaceProjectAccessValue;

  const onSubmit = async ({ email }: TeamMemberFormValues) => {
    if (!workspaceId) {
      toast.error(t("team:inviteModal.error"));
      return;
    }
    if (!canInvite) {
      // Defense-in-depth: parent gates the trigger, but if the modal is
      // somehow open without permission we refuse rather than firing a
      // mutation the server will reject.
      toast.error(t("team:inviteModal.error"));
      return;
    }
    const availableProjectIds = new Set(workspaceProjects.map((project) => project.id));
    const projectRoles = Object.fromEntries(
      Object.entries(projectAccess.projectRoles).filter(([projectId]) =>
        availableProjectIds.has(projectId),
      ),
    );
    const projectIds = Object.keys(projectRoles);
    const workspaceRole = projectAccess.workspaceRole;
    if (workspaceRole === "none" && projectIds.length === 0) {
      setShowProjectAccessError(true);
      return;
    }
    try {
      const invitation = await mutateAsync({
        email: email.trim().toLowerCase(),
        workspaceId,
        role: workspaceRole,
        workspaceRole,
        projectAccess: projectIds.length ? "selected" : "all",
        projectIds,
        projectRoles,
      }); // TODO: role and email
      await queryClient.refetchQueries({
        queryKey: ["workspace-users", workspaceId],
      });

      toast.success(t("team:inviteModal.success"), {
        description: toastSubject(email),
        icon: SendIcon,
      });

      // Keep the one-use link visible so the inviter can verify or copy the exact invitation.
      if (invitation?.id) {
        setCreatedInvitation({ id: invitation.id, email });
        form.reset();
        setProjectAccess(null);
        setShowSuggestions(false);
        return;
      }

      closeModal();
    } catch (error) {
      toast.error(t("team:inviteModal.error"), {
        description:
          error instanceof Error && error.message ? error.message : undefined,
      });
    }
  };

  const closeModal = () => {
    if (workspaceId) {
      void queryClient.invalidateQueries({
        queryKey: ["workspace-users", workspaceId],
      });
    }
    onClose();
  };

  const resetAfterClose = (isOpen: boolean) => {
    if (isOpen) return;
    setCreatedInvitation(null);
    form.reset();
    setProjectAccess(null);
    setShowProjectAccessError(false);
    setShowSuggestions(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeModal();
      }}
      onOpenChangeComplete={resetAfterClose}
    >
      <DialogPopup className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>
            {createdInvitation
              ? t("team:inviteModal.createdTitle")
              : t("team:inviteModal.title")}
          </DialogTitle>
        </DialogHeader>

        {createdInvitation ? (
          <>
            <DialogPanel className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("team:inviteModal.shareLinkDescription", {
                  email: createdInvitation.email,
                })}
              </p>
              <InvitationLinkField invitationId={createdInvitation.id} />
            </DialogPanel>
            <DialogFooter>
              <Button size="sm" onClick={closeModal}>
                {t("team:inviteModal.done")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
              <DialogPanel className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("team:inviteModal.emailLabel")}</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={t("team:inviteModal.emailPlaceholder")}
                            autoFocus
                            autoComplete="off"
                            onFocus={() => setShowSuggestions(true)}
                            onChange={(event) => {
                              field.onChange(event);
                              setShowSuggestions(true);
                            }}
                          />
                        </FormControl>
                        {showSuggestions && emailValue.trim() && directoryMembers.length > 0 ? (
                            <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
                            {directoryMembers.map((member) => (
                              <button
                                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                                key={member.id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  form.setValue("email", member.email, { shouldValidate: true });
                                  setShowSuggestions(false);
                                }}
                              >
                                <span className="flex min-w-0 flex-1 flex-col">
                                  <span className="truncate font-medium">{member.name}</span>
                                  <span className="truncate text-xs text-muted-foreground">{member.email}</span>
                                </span>
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Karamah</span>
                              </button>
                            ))}
                            </div>
                          ) : isFetchingDirectory && emailValue.trim() ? (
                            <p className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg">Searching colleagues…</p>
                          ) : null}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <WorkspaceProjectAccessFields
                  allowWorkspaceAccess={canInvite && !isCheckingPermissions}
                  value={projectAccess}
                  onChange={(next) => {
                    setProjectAccess(next);
                    setShowProjectAccessError(false);
                  }}
                  projects={workspaceProjects}
                  isLoadingProjects={isLoadingProjects}
                  disabled={form.formState.isSubmitting || isCheckingPermissions}
                  error={
                    showProjectAccessError
                      ? t("team:projectAccess.selectAtLeastOne")
                      : undefined
                  }
                />
              </DialogPanel>

              <DialogFooter>
                <DialogClose
                  render={<Button variant="outline" size="sm" type="button" />}
                >
                  {t("common:actions.cancel")}
                </DialogClose>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!workspaceId || !canInvite || isCheckingPermissions}
                >
                  {t("team:inviteModal.sendInvitation")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogPopup>
    </Dialog>
  );
}

export default InviteTeamMemberModal;
