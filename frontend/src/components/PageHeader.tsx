import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  children?: ReactNode;
};

/** Page name on the left; filters/actions on the right. */
export function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={1.5}
      alignItems={{ xs: "stretch", md: "center" }}
      justifyContent="space-between"
      sx={{ flexShrink: 0, width: "100%" }}
    >
      <Typography variant="h6" component="h1" fontWeight={700} sx={{ flexShrink: 0, lineHeight: 1.2, pr: { md: 2 } }}>
        {title}
      </Typography>
      {children ? (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: { xs: "flex-start", md: "flex-end" },
            gap: 1.5,
            minWidth: 0,
            flex: { md: 1 },
          }}
        >
          {children}
        </Box>
      ) : null}
    </Stack>
  );
}
