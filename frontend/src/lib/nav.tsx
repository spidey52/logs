import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import DnsOutlinedIcon from "@mui/icons-material/DnsOutlined";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import PersonSearchOutlinedIcon from "@mui/icons-material/PersonSearchOutlined";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import { useLocation } from "react-router-dom";

export const nav = [
  { to: "/dashboard", label: "Overview", icon: <AssessmentOutlinedIcon /> },
  { to: "/logs", label: "API logs", icon: <ListAltOutlinedIcon /> },
  { to: "/caller-logs", label: "Caller logs", icon: <PersonSearchOutlinedIcon /> },
  { to: "/slow", label: "Slow requests", icon: <SpeedOutlinedIcon /> },
  { to: "/projects", label: "Projects", icon: <DnsOutlinedIcon /> },
  { to: "/callers", label: "Callers", icon: <PeopleOutlineIcon /> },
] as const;

export function useNavTitle() {
  const { pathname } = useLocation();
  const item = nav.find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  return item?.label ?? "API logs";
}
