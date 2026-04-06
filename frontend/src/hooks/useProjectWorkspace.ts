import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { useMemo } from "react";
import { listProjects } from "../api/client";
import { qk } from "../lib/queryKeys";
import { setSelectedProjectId, uiStore } from "../store/uiStore";
import type { Project } from "../types";

/**
 * Server: TanStack Query (`projects`). Client selection: TanStack Store (`selectedProjectId`).
 * Sync effect lives in `<ProjectWorkspaceSync />`. This is not React Context.
 */
export function useProjectWorkspace() {
  const q = useQuery({
    queryKey: qk.projects,
    queryFn: () => listProjects(),
  });

  const selectedProjectId = useStore(uiStore, (s) => s.selectedProjectId);

  const selected = useMemo(() => {
    const projects = q.data ?? [];
    return projects.find((p) => p.id === selectedProjectId) ?? null;
  }, [q.data, selectedProjectId]);

  const setSelected = (p: Project | null) => setSelectedProjectId(p?.id ?? null);

  return {
    projects: q.data ?? [],
    selected,
    setSelected,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error instanceof Error ? q.error.message : q.error ? String(q.error) : null,
    refreshProjects: q.refetch,
  };
}
