import { CssBaseline, ThemeProvider } from "@mui/material";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { LogsPage } from "./pages/LogsPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { UsersPage } from "./pages/UsersPage";
import { appTheme } from "./theme";

/** MUI ThemeProvider uses React context for theme tokens only; app state is TanStack Store + Query. */
export default function App() {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<LogsPage />} />
            <Route path="overview" element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="callers" element={<UsersPage />} />
            <Route path="logs" element={<Navigate to="/" replace />} />
            <Route path="users" element={<Navigate to="/callers" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
