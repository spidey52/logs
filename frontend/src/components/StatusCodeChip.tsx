import { Chip, type ChipProps } from "@mui/material";

function tone(code: number): ChipProps["color"] {
  if (code >= 500) return "error";
  if (code >= 400) return "warning";
  if (code >= 300) return "info";
  return "success";
}

export function StatusCodeChip({ code, size = "small" }: { code: number; size?: ChipProps["size"] }) {
  return (
    <Chip
      label={code}
      color={tone(code)}
      size={size}
      variant="filled"
      sx={{
        fontVariantNumeric: "tabular-nums",
        fontWeight: 700,
        minWidth: 44,
        "& .MuiChip-label": { px: 1 },
      }}
    />
  );
}
