import { FormControl, InputLabel, MenuItem, Select, type SelectChangeEvent } from "@mui/material";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";

export function ProjectPicker({ label = "Project" }: { label?: string }) {
  const { projects, selected, setSelected, isLoading } = useProjectWorkspace();

  const onChange = (e: SelectChangeEvent<string>) => {
    const p = projects.find((x) => x.id === e.target.value) ?? null;
    setSelected(p);
  };

  return (
    <FormControl size="small" fullWidth sx={{ minWidth: 0 }} disabled={isLoading || !projects.length}>
      <InputLabel id="project-picker-label">{label}</InputLabel>
      <Select
        labelId="project-picker-label"
        label={label}
        value={selected?.id ?? ""}
        onChange={onChange}
      >
        {projects.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
            <span style={{ opacity: 0.6, marginLeft: 8, fontSize: 12 }}>({p.environment})</span>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
