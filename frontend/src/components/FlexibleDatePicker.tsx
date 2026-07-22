import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import { Box, Button, InputAdornment, TextField, ToggleButton, ToggleButtonGroup } from "@mui/material";
import moment from "moment";
import { forwardRef, useState, type ComponentProps, type ComponentType } from "react";
import DatePicker from "react-datepicker";

export type DatePickerMode = "single" | "range";

/** Always two dates. In single mode, `start` and `end` are the same calendar day. */
export type DateRangeValue = {
  start: Date;
  end: Date;
};

type DatePickerProps = ComponentProps<typeof DatePicker>;

type ReservedPickerProps =
  | "selected"
  | "startDate"
  | "endDate"
  | "selectsRange"
  | "selectsMultiple"
  | "onChange"
  | "onSelect"
  | "onDayMouseEnter"
  | "open"
  | "onInputClick"
  | "onClickOutside"
  | "onCalendarClose"
  | "customInput"
  | "value"
  | "children"
  | "shouldCloseOnSelect";

type FlexibleOwnProps = {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  mode?: DatePickerMode;
  defaultMode?: DatePickerMode;
  onModeChange?: (mode: DatePickerMode) => void;
  /** Moment format for the trigger label. */
  dateFormat?: string;
  width?: number | string;
  hideModeSwitch?: boolean;
  onDayMouseEnter?: (date: Date) => void;
  onCalendarOpen?: () => void;
  onCalendarClose?: () => void;
};

export type FlexibleDatePickerProps = FlexibleOwnProps &
  Omit<DatePickerProps, ReservedPickerProps | keyof FlexibleOwnProps>;

type DraftRange = { start: Date; end: Date | null };
type ShortcutKey = "today" | "yesterday" | "thisMonth" | "thisYear";

function startOfDay(d: Date) {
  return moment(d).startOf("day").toDate();
}

function endOfDay(d: Date) {
  return moment(d).endOf("day").toDate();
}

function toDateRange(start: Date, end: Date | null | undefined, mode: DatePickerMode): DateRangeValue {
  const s = startOfDay(start);
  if (mode === "single" || !end) return { start: s, end: endOfDay(s) };
  const e = endOfDay(end);
  return s <= e ? { start: s, end: e } : { start: startOfDay(end), end: endOfDay(start) };
}

function formatDateRangeLabel(value: DateRangeValue, mode: DatePickerMode, dateFormat: string) {
  const a = moment(value.start).format(dateFormat);
  const b = moment(value.end).format(dateFormat);
  return mode === "single" || a === b ? a : `${a} – ${b}`;
}

function draftInputLabel(draft: DraftRange, hover: Date | null, dateFormat: string) {
  if (!draft.end) {
    if (hover) return formatDateRangeLabel(toDateRange(draft.start, hover, "range"), "range", dateFormat);
    return `${moment(draft.start).format(dateFormat)} → …`;
  }
  return formatDateRangeLabel(toDateRange(draft.start, draft.end, "range"), "range", dateFormat);
}

function dayAllowed(d: Date, minDate?: Date | null, maxDate?: Date | null) {
  const day = moment(d).startOf("day");
  if (minDate && day.isBefore(moment(minDate).startOf("day"))) return false;
  if (maxDate && day.isAfter(moment(maxDate).startOf("day"))) return false;
  return true;
}

function clampRange(start: Date, end: Date, minDate?: Date | null, maxDate?: Date | null): DateRangeValue | null {
  let s = moment(start).startOf("day");
  let e = moment(end).endOf("day");
  if (minDate && s.isBefore(moment(minDate).startOf("day"))) s = moment(minDate).startOf("day");
  if (maxDate && e.isAfter(moment(maxDate).endOf("day"))) e = moment(maxDate).endOf("day");
  if (s.isAfter(e, "day")) return null;
  return toDateRange(s.toDate(), e.toDate(), "range");
}

/** Indian financial year: 1 Apr → 31 Mar. */
function financialYearBounds(ref = moment()) {
  const fyStartYear = ref.month() >= 3 ? ref.year() : ref.year() - 1;
  return {
    start: moment({ year: fyStartYear, month: 3, day: 1 }).startOf("day"),
    end: moment({ year: fyStartYear + 1, month: 2, day: 1 }).endOf("month"),
  };
}

function rangeMatches(value: DateRangeValue, range: DateRangeValue | null) {
  return (
    !!range &&
    moment(value.start).isSame(range.start, "day") &&
    moment(value.end).isSame(range.end, "day")
  );
}

const TriggerInput = forwardRef<
  HTMLInputElement,
  {
    value?: string;
    onClick?: () => void;
    disabled?: boolean;
    placeholder: string;
    label: string;
    pending?: boolean;
  }
>(function TriggerInput({ onClick, disabled, placeholder, label, pending }, ref) {
  return (
    <TextField
      size="small"
      value={label}
      onClick={disabled ? undefined : onClick}
      inputRef={ref}
      disabled={disabled}
      placeholder={placeholder}
      fullWidth
      InputProps={{
        readOnly: true,
        startAdornment: (
          <InputAdornment position="start">
            <CalendarTodayOutlinedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          </InputAdornment>
        ),
      }}
      sx={{
        width: "100%",
        "& .MuiOutlinedInput-root": { height: 36, cursor: disabled ? "default" : "pointer" },
        "& .MuiInputBase-input": {
          cursor: disabled ? "default" : "pointer",
          py: 0,
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: pending ? "text.secondary" : "text.primary",
          fontStyle: pending ? "italic" : "normal",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        },
      }}
    />
  );
});

const shortcutToggleSx = {
  width: "100%",
  display: "flex",
  "& .MuiToggleButtonGroup-grouped": {
    border: "1px solid",
    borderColor: "divider",
    "&:not(:first-of-type)": {
      marginLeft: "-1px",
      borderLeft: "1px solid",
      borderColor: "divider",
    },
    "&:first-of-type": { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
    "&:last-of-type": { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  },
  "& .MuiToggleButton-root": {
    flex: 1,
    px: 0.5,
    py: 0.4,
    minWidth: 0,
    minHeight: 28,
    fontSize: "0.7rem",
    fontWeight: 600,
    lineHeight: 1.2,
    textTransform: "none" as const,
    color: "text.secondary",
    whiteSpace: "nowrap" as const,
    "&.Mui-selected": {
      bgcolor: "action.selected",
      color: "text.primary",
      fontWeight: 700,
      zIndex: 1,
      "&:hover": { bgcolor: "action.selected" },
    },
  },
};

const modeBtnSx = (active: boolean) => ({
  textTransform: "none" as const,
  minWidth: 0,
  px: 1,
  py: 0.25,
  fontSize: "0.7rem",
  fontWeight: active ? 700 : 600,
  color: active ? "primary.main" : "text.secondary",
});

const calendarSx = {
  "& .flexible-datepicker-wrapper": { width: "100%", display: "block" },
  "& .react-datepicker__input-container": { width: "100%", display: "block" },
  "& .flexible-datepicker-calendar.react-datepicker": {
    display: "flex",
    flexDirection: "column",
  },
  "& .flexible-datepicker-calendar .react-datepicker__month-container": {
    float: "none",
  },
  "& .flexible-datepicker-calendar .react-datepicker__children-container": {
    width: "100% !important",
    margin: "0 !important",
    padding: "0 !important",
    boxSizing: "border-box",
  },
};

function CalendarFooter({
  value,
  mode,
  hideModeSwitch,
  onModeChange,
  onDayShortcut,
  onRangeShortcut,
  minDate,
  maxDate,
}: {
  value: DateRangeValue;
  mode: DatePickerMode;
  hideModeSwitch?: boolean;
  onModeChange: (mode: DatePickerMode) => void;
  onDayShortcut: (d: Date) => void;
  onRangeShortcut: (start: Date, end: Date) => void;
  minDate?: Date | null;
  maxDate?: Date | null;
}) {
  const today = moment().startOf("day");
  const yesterday = moment().subtract(1, "day").startOf("day");
  const thisMonth = clampRange(moment().startOf("month").toDate(), moment().endOf("month").toDate(), minDate, maxDate);
  const fy = financialYearBounds();
  const thisYear = clampRange(fy.start.toDate(), fy.end.toDate(), minDate, maxDate);

  const shortcutKey: ShortcutKey | null = (() => {
    if (mode === "single" || moment(value.start).isSame(value.end, "day")) {
      if (moment(value.start).isSame(today, "day")) return "today";
      if (moment(value.start).isSame(yesterday, "day")) return "yesterday";
    }
    if (rangeMatches(value, thisMonth)) return "thisMonth";
    if (rangeMatches(value, thisYear)) return "thisYear";
    return null;
  })();

  const shortcuts: {
    key: ShortcutKey;
    label: string;
    title: string;
    disabled: boolean;
    onClick: () => void;
  }[] = [
    {
      key: "today",
      label: "Today",
      title: "Today",
      disabled: !dayAllowed(today.toDate(), minDate, maxDate),
      onClick: () => onDayShortcut(today.toDate()),
    },
    {
      key: "yesterday",
      label: "Ydy",
      title: "Yesterday",
      disabled: !dayAllowed(yesterday.toDate(), minDate, maxDate),
      onClick: () => onDayShortcut(yesterday.toDate()),
    },
  ];

  // Month / year only in range mode — in single mode they silently expanded the
  // query to a full month and looked like a “one date” selection bug.
  if (mode === "range") {
    shortcuts.push(
      {
        key: "thisMonth",
        label: "Mon",
        title: "This month",
        disabled: !thisMonth,
        onClick: () => thisMonth && onRangeShortcut(thisMonth.start, thisMonth.end),
      },
      {
        key: "thisYear",
        label: "Year",
        title: `Financial year ${fy.start.format("D MMM YYYY")} – ${fy.end.format("D MMM YYYY")}`,
        disabled: !thisYear,
        onClick: () => thisYear && onRangeShortcut(thisYear.start, thisYear.end),
      },
    );
  }

  return (
    <Box
      sx={{
        width: "100%",
        boxSizing: "border-box",
        px: 1.25,
        pt: 1,
        pb: 0.75,
        borderTop: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
      }}
    >
      <ToggleButtonGroup exclusive size="small" value={shortcutKey} sx={shortcutToggleSx}>
        {shortcuts.map((s) => (
          <ToggleButton
            key={s.key}
            value={s.key}
            title={s.title}
            disabled={s.disabled}
            onClick={(e) => {
              e.preventDefault();
              if (!s.disabled) s.onClick();
            }}
          >
            {s.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {hideModeSwitch ? null : (
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 0.5 }}>
          <Button size="small" variant="text" onClick={() => onModeChange("single")} sx={modeBtnSx(mode === "single")}>
            Single
          </Button>
          <Button size="small" variant="text" onClick={() => onModeChange("range")} sx={modeBtnSx(mode === "range")}>
            Range
          </Button>
        </Box>
      )}
    </Box>
  );
}

export function FlexibleDatePicker({
  value,
  onChange,
  mode: modeProp,
  defaultMode = "single",
  onModeChange,
  dateFormat = "MMM D, YYYY",
  width = 220,
  hideModeSwitch = false,
  disabled,
  minDate,
  maxDate,
  placeholderText,
  onDayMouseEnter,
  onCalendarOpen,
  onCalendarClose,
  ...pickerProps
}: FlexibleDatePickerProps) {
  const [internalMode, setInternalMode] = useState<DatePickerMode>(defaultMode);
  const mode = modeProp ?? internalMode;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftRange | null>(null);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  const resetUi = () => {
    setDraft(null);
    setHoverDate(null);
  };

  const close = () => {
    setOpen(false);
    resetUi();
    onCalendarClose?.();
  };

  const changeMode = (next: DatePickerMode) => {
    if (modeProp === undefined) setInternalMode(next);
    onModeChange?.(next);
    resetUi();
    onChange(
      next === "single"
        ? toDateRange(value.start, value.start, "single")
        : toDateRange(value.start, value.end, "range"),
    );
  };

  const commitSingle = (d: Date) => {
    resetUi();
    onChange(toDateRange(d, d, "single"));
    setOpen(false);
  };

  const commitRange = (start: Date, end: Date) => {
    resetUi();
    onChange(toDateRange(start, end, "range"));
    setOpen(false);
  };

  const applyDayShortcut = (d: Date) => {
    if (mode === "single") commitSingle(d);
    else commitRange(d, d);
  };

  const applyRangeShortcut = (start: Date, end: Date) => {
    if (mode === "single") {
      if (modeProp === undefined) setInternalMode("range");
      onModeChange?.("range");
    }
    commitRange(start, end);
  };

  const pending = mode === "range" && draft != null;
  const inputLabel = pending
    ? draftInputLabel(draft, hoverDate, dateFormat)
    : formatDateRangeLabel(value, mode, dateFormat);

  const footer = (
    <CalendarFooter
      value={value}
      mode={mode}
      hideModeSwitch={hideModeSwitch}
      onModeChange={changeMode}
      onDayShortcut={applyDayShortcut}
      onRangeShortcut={applyRangeShortcut}
      minDate={minDate}
      maxDate={maxDate}
    />
  );

  const Picker = DatePicker as ComponentType<Record<string, unknown>>;
  const shared: Record<string, unknown> = {
    ...pickerProps,
    open,
    disabled,
    minDate,
    maxDate,
    customInput: (
      <TriggerInput
        label={inputLabel}
        pending={pending}
        placeholder={placeholderText ?? (mode === "single" ? "Select date" : "Select range")}
        disabled={disabled}
      />
    ),
    wrapperClassName: "flexible-datepicker-wrapper",
    calendarClassName: "flexible-datepicker-calendar",
    onInputClick: () => {
      resetUi();
      setOpen(true);
      onCalendarOpen?.();
    },
    onClickOutside: close,
    onCalendarClose: close,
  };

  const picker =
    mode === "single" ? (
      <Picker
        {...shared}
        selected={value.start}
        shouldCloseOnSelect
        onChange={(d: Date | null) => {
          if (d) commitSingle(d);
        }}
      >
        {footer}
      </Picker>
    ) : (
      <Picker
        {...shared}
        selectsRange
        startDate={draft ? draft.start : value.start}
        endDate={draft ? draft.end : value.end}
        shouldCloseOnSelect={false}
        swapRange
        onDayMouseEnter={(date: Date) => {
          if (draft?.start && !draft.end) setHoverDate(date);
          onDayMouseEnter?.(date);
        }}
        onChange={(dates: [Date | null, Date | null]) => {
          const [start, end] = dates;
          if (!start) return;
          if (draft && !draft.end) {
            if (!end) {
              setDraft({ start, end: null });
              setHoverDate(null);
              return;
            }
            commitRange(start, end);
            return;
          }
          setDraft({ start, end: null });
          setHoverDate(null);
        }}
      >
        {footer}
      </Picker>
    );

  return (
    <Box sx={{ width, minWidth: width, maxWidth: width, flexShrink: 0, ...calendarSx }}>
      {picker}
    </Box>
  );
}
