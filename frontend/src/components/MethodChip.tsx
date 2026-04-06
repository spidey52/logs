import { Chip, type ChipProps } from "@mui/material";

const map: Record<string, ChipProps["color"]> = {
  GET: "success",
  POST: "primary",
  PUT: "warning",
  PATCH: "secondary",
  DELETE: "error",
  HEAD: "info",
  OPTIONS: "default",
};

export function MethodChip({ method, size = "small" }: { method: string; size?: ChipProps["size"] }) {
  const m = method.toUpperCase();
  const color = map[m] ?? "default";
  return (
    <Chip
      label={m}
      color={color}
      size={size}
      variant={color === "default" ? "outlined" : "filled"}
      sx={{
        fontWeight: 700,
        fontSize: "0.7rem",
        letterSpacing: "0.04em",
        minWidth: 56,
      }}
    />
  );
}
