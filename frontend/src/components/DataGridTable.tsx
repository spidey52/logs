import { Box, CircularProgress, Paper } from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  DataGrid,
  GridOverlay,
  type DataGridProps,
  type GridColDef,
  type GridRowId,
  type GridValidRowModel,
} from "@mui/x-data-grid";

export type DataGridTableProps<R extends GridValidRowModel> = {
  rows: R[];
  columns: GridColDef<R>[];
  loading?: boolean;
  getRowId?: (row: R) => GridRowId;
  emptyMessage?: string;
  /**
   * Container height. Defaults to `100%` so the grid fills its parent.
   * Parent should provide a bounded height (e.g. flex child with `minHeight: 0`).
   */
  height?: number | string;
  /** Server-side pagination */
  paginationMode?: "client" | "server";
  rowCount?: number;
  paginationModel?: { page: number; pageSize: number };
  onPaginationModelChange?: (model: { page: number; pageSize: number }) => void;
  pageSizeOptions?: number[];
  /** Server-side sorting */
  sortingMode?: "client" | "server";
  sortModel?: DataGridProps<R>["sortModel"];
  onSortModelChange?: DataGridProps<R>["onSortModelChange"];
  onRowClick?: DataGridProps<R>["onRowClick"];
  disableColumnMenu?: boolean;
  checkboxSelection?: boolean;
  hideFooter?: boolean;
  sx?: DataGridProps<R>["sx"];
};

const DEFAULT_PAGE_SIZE = 50;

function LoadingOverlay() {
  return (
    <GridOverlay>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: (t) => alpha(t.palette.background.paper, 0.65),
          zIndex: 1,
        }}
      >
        <CircularProgress size={36} />
      </Box>
    </GridOverlay>
  );
}

const GRID_SLOTS = { loadingOverlay: LoadingOverlay };

export function DataGridTable<R extends GridValidRowModel>({
  rows,
  columns,
  loading = false,
  getRowId,
  emptyMessage = "No rows",
  height = "100%",
  paginationMode = "client",
  rowCount,
  paginationModel,
  onPaginationModelChange,
  pageSizeOptions = [DEFAULT_PAGE_SIZE],
  sortingMode = "client",
  sortModel,
  onSortModelChange,
  onRowClick,
  disableColumnMenu = true,
  checkboxSelection,
  hideFooter,
  sx,
}: DataGridTableProps<R>) {
  const pageSize = paginationModel?.pageSize ?? pageSizeOptions[0] ?? DEFAULT_PAGE_SIZE;

  return (
    <Paper
      sx={{
        borderRadius: 1,
        width: "100%",
        height,
        minHeight: 0,
        flex: height === "100%" ? 1 : undefined,
        overflow: "hidden",
        border: (t) => `1px solid ${alpha(t.palette.divider, 0.9)}`,
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <DataGrid
        rows={rows}
        columns={columns}
        loading={loading}
        getRowId={getRowId}
        disableColumnMenu={disableColumnMenu}
        disableRowSelectionOnClick
        checkboxSelection={checkboxSelection}
        hideFooter={hideFooter}
        hideFooterSelectedRowCount
        density="compact"
        paginationMode={paginationMode}
        sortingMode={sortingMode}
        rowCount={paginationMode === "server" ? (rowCount ?? -1) : undefined}
        paginationModel={
          paginationModel ?? {
            page: 0,
            pageSize,
          }
        }
        onPaginationModelChange={onPaginationModelChange}
        pageSizeOptions={pageSizeOptions}
        sortModel={sortModel}
        onSortModelChange={onSortModelChange}
        onRowClick={onRowClick}
        slots={GRID_SLOTS}
        localeText={{
          noRowsLabel: emptyMessage,
        }}
        sx={{
          border: "none",
          height: "100%",
          "& .MuiDataGrid-columnHeaders": {
            bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
            borderBottom: (t) => `1px solid ${t.palette.divider}`,
          },
          "& .MuiDataGrid-columnHeaderTitle": {
            fontWeight: 700,
            fontSize: "0.6875rem",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          },
          "& .MuiDataGrid-cell": {
            fontSize: "0.8125rem",
            display: "flex",
            alignItems: "center",
          },
          "& .MuiDataGrid-row": {
            cursor: onRowClick ? "pointer" : "default",
            "&:hover": {
              bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
            },
          },
          "& .MuiDataGrid-footerContainer": {
            borderTop: (t) => `1px solid ${t.palette.divider}`,
            minHeight: 52,
          },
          ...sx,
        }}
      />
    </Paper>
  );
}
