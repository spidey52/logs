import { Alert, Snackbar } from "@mui/material";
import { useStore } from "@tanstack/react-store";
import { dismissToast, toastStore } from "../store/toastStore";

const AUTO_HIDE_MS = 4000;

export function ToastHost() {
  const current = useStore(toastStore, (s) => s.current);

  if (!current) return null;

  return (
    <Snackbar
      key={current.id}
      open
      autoHideDuration={AUTO_HIDE_MS}
      onClose={(_, reason) => {
        if (reason === "clickaway") return;
        dismissToast();
      }}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
    >
      <Alert
        severity={current.severity}
        variant="filled"
        onClose={dismissToast}
        sx={{ width: "100%", borderRadius: 1, alignItems: "center" }}
      >
        {current.message}
      </Alert>
    </Snackbar>
  );
}
