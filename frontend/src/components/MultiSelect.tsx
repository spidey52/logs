import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  ClickAwayListener,
  Collapse,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Popper,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type MultiSelectOption<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
};

export type MultiSelectGroup<T extends string = string> = {
  id: string;
  label: string;
  options: MultiSelectOption<T>[];
};

export type MultiSelectProps<T extends string = string> = {
  label: string;
  options?: MultiSelectOption<T>[];
  groups?: MultiSelectGroup<T>[];
  /** Async search — when set, search is server-driven instead of local filter. */
  loadOptions?: (query: string) => Promise<MultiSelectOption<T>[]>;
  /** Keep labels for selected values that may be missing from the current result set. */
  selectedOptions?: MultiSelectOption<T>[];
  value: T[];
  onChange: (next: T[]) => void;
  searchPlaceholder?: string;
  /** Fixed trigger width (preferred). Falls back to `minWidth` if omitted. */
  width?: number | string;
  minWidth?: number | string;
  menuWidth?: number;
  disabled?: boolean;
};

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function MultiSelect<T extends string = string>({
  label,
  options,
  groups,
  loadOptions,
  selectedOptions,
  value,
  onChange,
  searchPlaceholder = "Search",
  width,
  minWidth = 140,
  menuWidth = 260,
  disabled,
}: MultiSelectProps<T>) {
  const triggerWidth = width ?? minWidth;
  const asyncMode = Boolean(loadOptions);
  const loadRef = useRef(loadOptions);
  loadRef.current = loadOptions;

  const known = useRef(new Map<T, MultiSelectOption<T>>());

  const remember = (list: MultiSelectOption<T>[]) => {
    for (const o of list) known.current.set(o.value, o);
  };

  useEffect(() => {
    if (selectedOptions?.length) remember(selectedOptions);
  }, [selectedOptions]);

  const staticGroups = useMemo<MultiSelectGroup<T>[]>(() => {
    if (groups?.length) return groups;
    return [{ id: "all", label: "", options: options ?? [] }];
  }, [groups, options]);

  useEffect(() => {
    if (asyncMode) return;
    remember(staticGroups.flatMap((g) => g.options));
  }, [asyncMode, staticGroups]);

  const staticTotal = useMemo(() => staticGroups.reduce((n, g) => n + g.options.length, 0), [staticGroups]);
  const selected = useMemo(() => new Set(value), [value]);
  const hasGroups = !asyncMode && staticGroups.some((g) => g.label);

  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [remote, setRemote] = useState<MultiSelectOption<T>[]>([]);
  const [loading, setLoading] = useState(false);

  const debouncedQuery = useDebouncedValue(query, asyncMode ? 280 : 0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !asyncMode) return;
    let cancelled = false;
    setLoading(true);
    loadRef
      .current?.(debouncedQuery.trim())
      .then((opts) => {
        if (cancelled) return;
        remember(opts);
        setRemote(opts);
      })
      .catch(() => {
        if (!cancelled) setRemote([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, asyncMode, debouncedQuery]);

  const filtered = useMemo(() => {
    if (asyncMode) {
      const remoteValues = new Set(remote.map((o) => o.value));
      const pinned = value
        .filter((v) => !remoteValues.has(v))
        .map((v) => known.current.get(v))
        .filter((o): o is MultiSelectOption<T> => Boolean(o));
      return [{ id: "all", label: "", options: [...pinned, ...remote] }];
    }

    const q = query.trim().toLowerCase();
    if (!q) return staticGroups;
    return staticGroups
      .map((g) => ({
        ...g,
        options: g.options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)),
      }))
      .filter((g) => g.options.length > 0);
  }, [asyncMode, remote, value, query, staticGroups]);

  const toggle = (opt: T) => {
    onChange(selected.has(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };

  const empty = filtered.every((g) => g.options.length === 0);

  return (
    <Box sx={{ width: triggerWidth, minWidth: triggerWidth, maxWidth: triggerWidth, flexShrink: 0 }}>
      <Button
        ref={anchorRef}
        disabled={disabled}
        variant="outlined"
        color="inherit"
        disableRipple
        onClick={() => setOpen((v) => !v)}
        endIcon={
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            {value.length > 0 ? (
              <Chip
                label={value.length}
                size="small"
                color="primary"
                sx={{
                  height: 18,
                  minWidth: 18,
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  "& .MuiChip-label": { px: 0.6 },
                }}
              />
            ) : null}
            <ExpandMoreIcon sx={{ fontSize: 16, transform: open ? "rotate(180deg)" : undefined }} />
          </Box>
        }
        sx={{
          height: 36,
          width: "100%",
          justifyContent: "space-between",
          textTransform: "none",
          px: 1.25,
          borderColor: open ? "primary.main" : "divider",
        }}
      >
        <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
          {label}
        </Typography>
      </Button>

      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        style={{ zIndex: 1400 }}
        modifiers={[{ name: "offset", options: { offset: [0, 4] } }]}
      >
        <ClickAwayListener onClickAway={() => setOpen(false)}>
          <Paper variant="outlined" sx={{ width: menuWidth, overflow: "hidden" }}>
            <Box sx={{ p: "10px" }}>
              <TextField
                inputRef={searchRef}
                size="small"
                fullWidth
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" color="disabled" />
                    </InputAdornment>
                  ),
                  endAdornment: loading ? (
                    <InputAdornment position="end">
                      <CircularProgress size={14} />
                    </InputAdornment>
                  ) : null,
                }}
                sx={{ mb: 1 }}
              />

              <Box sx={{ maxHeight: 280, overflow: "auto" }}>
                {empty && !loading ? (
                  <Typography color="text.secondary" sx={{ py: 2, textAlign: "center", fontSize: "0.8125rem" }}>
                    No matches
                  </Typography>
                ) : (
                  filtered.map((group, i) => {
                    const count = group.options.filter((o) => selected.has(o.value)).length;
                    const expanded = Boolean(query.trim()) || !collapsed[group.id];
                    const title = count > 0 && group.label ? `${group.label} (${count})` : group.label;

                    return (
                      <Box key={group.id}>
                        {i > 0 ? <Divider sx={{ my: 0.5 }} /> : null}

                        {hasGroups && group.label ? (
                          <Box sx={{ display: "flex", alignItems: "center", minHeight: 32 }}>
                            <Typography color="text.secondary" sx={{ flex: 1, fontWeight: 600, fontSize: "0.8125rem" }}>
                              {title}
                            </Typography>
                            <IconButton
                              size="small"
                              aria-label={expanded ? "Collapse" : "Expand"}
                              onClick={() => setCollapsed((s) => ({ ...s, [group.id]: expanded }))}
                            >
                              <ExpandMoreIcon
                                fontSize="small"
                                sx={{ transform: expanded ? "rotate(180deg)" : undefined }}
                              />
                            </IconButton>
                          </Box>
                        ) : null}

                        <Collapse in={expanded} timeout="auto">
                          <List dense disablePadding>
                            {group.options.map((opt) => (
                              <ListItemButton
                                key={opt.value}
                                dense
                                disableRipple
                                onClick={() => toggle(opt.value)}
                                sx={{ py: 0.5, px: 0, minHeight: 34, alignItems: "flex-start" }}
                              >
                                <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
                                  <Checkbox
                                    size="small"
                                    checked={selected.has(opt.value)}
                                    tabIndex={-1}
                                    disableRipple
                                    sx={{ p: 0 }}
                                  />
                                </ListItemIcon>
                                {opt.icon ? <Box sx={{ mr: 0.75, mt: 0.35, display: "flex", lineHeight: 0 }}>{opt.icon}</Box> : null}
                                <ListItemText
                                  primary={opt.label}
                                  secondary={opt.description}
                                  primaryTypographyProps={{ fontSize: "0.8125rem", noWrap: true }}
                                  secondaryTypographyProps={{
                                    fontSize: "0.7rem",
                                    noWrap: true,
                                    fontFamily: "ui-monospace, monospace",
                                  }}
                                  sx={{ m: 0 }}
                                />
                              </ListItemButton>
                            ))}
                          </List>
                        </Collapse>
                      </Box>
                    );
                  })
                )}
              </Box>

              {value.length > 0 ? (
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {asyncMode ? `${value.length} selected` : `${value.length} of ${staticTotal}`}
                  </Typography>
                  <Button size="small" onClick={() => onChange([])} sx={{ textTransform: "none", minWidth: 0, p: 0 }}>
                    Clear
                  </Button>
                </Box>
              ) : null}
            </Box>
          </Paper>
        </ClickAwayListener>
      </Popper>
    </Box>
  );
}
