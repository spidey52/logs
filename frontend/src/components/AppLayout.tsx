import MenuIcon from "@mui/icons-material/Menu";
import {
  AppBar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { healthCheck } from "../api/client";
import { nav } from "../lib/nav";
import { qk } from "../lib/queryKeys";
import { ProjectPicker } from "./ProjectPicker";
import { ProjectWorkspaceSync } from "./ProjectWorkspaceSync";

const drawerWidth = 260;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const loc = useLocation();
  return (
    <List sx={{ px: 1.5, py: 1 }}>
      {nav.map((item) => {
        const active = loc.pathname === item.to || loc.pathname.startsWith(`${item.to}/`);
        return (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            onClick={onNavigate}
            selected={active}
            sx={{
              borderRadius: 1,
              mb: 0.25,
              py: 0.75,
              "&.Mui-selected": {
                bgcolor: alpha("#1d4ed8", 0.12),
                "&:hover": { bgcolor: alpha("#1d4ed8", 0.18) },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: active ? "primary.main" : "text.secondary" }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{ fontWeight: active ? 700 : 500, fontSize: "0.8125rem" }}
            />
          </ListItemButton>
        );
      })}
    </List>
  );
}

export function AppLayout() {
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);

  const health = useQuery({
    queryKey: qk.health,
    queryFn: healthCheck,
    refetchInterval: 30_000,
  });
  const online = health.data === true;
  const offline = health.isSuccess && health.data === false;

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Toolbar sx={{ px: 2.5, gap: 1 }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 1,
            background: "linear-gradient(135deg, #1d4ed8 0%, #7c3aed 100%)",
            display: "grid",
            placeItems: "center",
            color: "white",
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          AL
        </Box>
        <Box>
          <Typography variant="subtitle2" fontWeight={800} lineHeight={1.2}>
            API Logs
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
            Log ingest & search
          </Typography>
        </Box>
      </Toolbar>
      <Divider sx={{ mx: 2 }} />
      <NavList onNavigate={() => isSm && setMobileOpen(false)} />
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <ProjectWorkspaceSync />
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          bgcolor: alpha("#fff", 0.85),
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${alpha("#64748b", 0.12)}`,
          color: "text.primary",
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(true)}
            sx={{ mr: 2, display: { md: "none" } }}
            aria-label="open menu"
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ mr: 1.5, flexShrink: 0, width: { xs: 140, sm: 200 } }}>
            <ProjectPicker label="Project" />
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 1,
              py: 0.35,
              borderRadius: 1,
              bgcolor: health.isLoading ? alpha("#64748b", 0.1) : online ? alpha("#059669", 0.12) : alpha("#dc2626", 0.12),
              border: `1px solid ${
                health.isLoading ? alpha("#64748b", 0.25) : online ? alpha("#059669", 0.35) : alpha("#dc2626", 0.35)
              }`,
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: health.isLoading ? "grey.400" : online ? "success.main" : "error.main",
                boxShadow: (t) =>
                  `0 0 0 3px ${alpha(
                    health.isLoading ? t.palette.grey[400] : online ? t.palette.success.main : t.palette.error.main,
                    0.25,
                  )}`,
              }}
            />
            <Typography
              variant="caption"
              fontWeight={700}
              color={health.isLoading ? "text.secondary" : online ? "success.dark" : "error.dark"}
            >
              API {health.isLoading ? "…" : online ? "online" : offline ? "offline" : "…"}
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": { boxSizing: "border-box", width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
              borderRight: `1px solid ${alpha("#64748b", 0.12)}`,
              bgcolor: alpha("#fff", 0.72),
              backdropFilter: "blur(12px)",
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: { md: `calc(100% - ${drawerWidth}px)` },
          mt: "64px",
          height: "calc(100vh - 64px)",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          boxSizing: "border-box",
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
