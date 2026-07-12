import { alpha, createTheme } from "@mui/material/styles";

const primary = "#1d4ed8";
const primaryLight = "#3b82f6";

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: primary, light: primaryLight, dark: "#1e3a8a" },
    secondary: { main: "#7c3aed", light: "#a78bfa", dark: "#5b21b6" },
    success: { main: "#059669", light: "#34d399" },
    warning: { main: "#d97706", light: "#fbbf24" },
    error: { main: "#dc2626", light: "#f87171" },
    info: { main: "#0284c7", light: "#38bdf8" },
    background: {
      default: "#f1f5f9",
      paper: "#ffffff",
    },
    divider: alpha("#64748b", 0.16),
  },
  typography: {
    fontFamily: '"Plus Jakarta Sans", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 13,
    h4: { fontWeight: 700, letterSpacing: "-0.02em", fontSize: "1.35rem" },
    h5: { fontWeight: 700, letterSpacing: "-0.02em", fontSize: "1.05rem" },
    h6: { fontWeight: 600, fontSize: "0.95rem" },
    subtitle1: { fontWeight: 600, fontSize: "0.875rem" },
    subtitle2: { fontWeight: 600, fontSize: "0.8125rem" },
    body1: { fontSize: "0.8125rem" },
    body2: { fontSize: "0.75rem" },
    caption: { fontSize: "0.6875rem" },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: `${alpha("#64748b", 0.4)} transparent`,
          "&::-webkit-scrollbar": { width: 8, height: 8 },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: alpha("#64748b", 0.35),
            borderRadius: 4,
            border: "2px solid transparent",
            backgroundClip: "padding-box",
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600, borderRadius: 6 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)",
          border: `1px solid ${alpha("#64748b", 0.12)}`,
          transition: "box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease",
          "&:hover": {
            boxShadow: "0 10px 40px -12px rgba(15, 23, 42, 0.15)",
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 4 },
      },
    },
  },
});
