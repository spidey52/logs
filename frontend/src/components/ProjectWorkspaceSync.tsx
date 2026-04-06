import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { useEffect } from "react";
import { listProjects } from "../api/client";
import { qk } from "../lib/queryKeys";
import { readPersistedProjectId, setSelectedProjectId, uiStore } from "../store/uiStore";

/**
 * Keeps `uiStore.selectedProjectId` valid when the projects list loads or changes.
 * Mount once under the app shell (TanStack Store + Query — not React Context).
 */
export function ProjectWorkspaceSync() {
  const q = useQuery({
    queryKey: qk.projects,
    queryFn: () => listProjects(),
  });

  const selectedProjectId = useStore(uiStore, (s) => s.selectedProjectId);

  useEffect(() => {
    if (!q.isSuccess) return;
    const projects = q.data ?? [];
    if (!projects.length) {
      if (selectedProjectId !== null) setSelectedProjectId(null);
      return;
    }
    const ok = selectedProjectId != null && projects.some((p) => p.id === selectedProjectId);
    if (!ok) {
      const saved = readPersistedProjectId();
      const match = saved ? projects.find((p) => p.id === saved) : null;
      setSelectedProjectId(match?.id ?? projects[0]!.id);
    }
  }, [q.isSuccess, q.data, selectedProjectId]);

  return null;
}
