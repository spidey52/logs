import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import JsonView from "@uiw/react-json-view";
import { lightTheme } from "@uiw/react-json-view/light";

type JsonViewerProps = {
  value: unknown;
  emptyLabel?: string;
  collapsed?: number | boolean;
};

function asViewable(value: unknown): object | null {
  if (value == null) return null;
  if (typeof value === "object") return value as object;
  return { value };
}

export function JsonViewer({ value, emptyLabel = "No data", collapsed = 2 }: JsonViewerProps) {
  const data = asViewable(value);

  if (data == null || (typeof data === "object" && !Array.isArray(data) && Object.keys(data).length === 0)) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2, px: 1 }}>
        {emptyLabel}
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 1,
        bgcolor: alpha("#0f172a", 0.03),
        border: (t) => `1px solid ${alpha(t.palette.divider, 0.9)}`,
        overflow: "auto",
        maxHeight: "100%",
        fontSize: 13,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        "& .w-rjv": {
          background: "transparent !important",
          fontFamily: "inherit",
          fontSize: "inherit",
        },
      }}
    >
      <JsonView
        value={data}
        style={{
          ...lightTheme,
          backgroundColor: "transparent",
          fontSize: "0.8125rem",
        }}
        collapsed={collapsed}
        displayDataTypes={false}
        enableClipboard
      />
    </Box>
  );
}
