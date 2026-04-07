import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Box, Paper, Stack, Typography } from "@mui/material";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import DashboardIcon from "@mui/icons-material/Dashboard";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import ScienceIcon from "@mui/icons-material/Science";
import SettingsIcon from "@mui/icons-material/Settings";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import ParkIcon from "@mui/icons-material/Park";
import GroupsIcon from "@mui/icons-material/Groups";
import AssignmentIcon from "@mui/icons-material/Assignment";
import BugReportIcon from "@mui/icons-material/BugReport";
import TuneIcon from "@mui/icons-material/Tune";
import DescriptionIcon from "@mui/icons-material/Description";
import InsightsIcon from "@mui/icons-material/Insights";
import SpaIcon from "@mui/icons-material/Spa";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import AlternateEmailIcon from "@mui/icons-material/AlternateEmail";

const DEFAULT = {
  title: "Mother Roots",
  body: "Choose a section from the menu to start."
};

export default function PageIntro() {
  const { pathname } = useLocation();

  const content = useMemo(() => {
    if (pathname === "/") {
      return {
        title: "Welcome",
        icon: HomeOutlinedIcon,
        body: "Quick access to your dashboard, inventory, daily operations, reports, and performance."
      };
    }
    if (pathname.startsWith("/dashboard")) {
      return {
        title: "Dashboard",
        icon: DashboardIcon,
        body: "See lab setup progress, workspace totals, pending invites, and quick actions from one place."
      };
    }
    if (pathname.startsWith("/inventory")) {
      return {
        title: "Inventory",
        icon: Inventory2Icon,
        body: "Manage mother jars stock by species and subculture. Keep counts accurate to avoid operation errors."
      };
    }
    if (pathname.startsWith("/lab")) {
      return {
        title: "Lab Profile",
        icon: ScienceIcon,
        body: "Set the lab identity and commercial contact details for this workspace."
      };
    }
    if (pathname.startsWith("/owner-settings")) {
      return {
        title: "Owner Settings",
        icon: SettingsIcon,
        body: "Manage owner-only workspace settings and controls for this commercial lab."
      };
    }
    if (pathname.startsWith("/subscription")) {
      return {
        title: "Subscription",
        icon: CreditCardIcon,
        body: "Review plan status, trial dates, and manual quotas for this workspace while billing is still in MVP mode."
      };
    }
    if (pathname.startsWith("/newsletter")) {
      return {
        title: "Newsletter",
        icon: AlternateEmailIcon,
        body: "Review newsletter signups captured from the public footer and track interest for future updates."
      };
    }
    if (pathname.startsWith("/users")) {
      return {
        title: "Users",
        icon: ManageAccountsIcon,
        body: "Invite managers and staff, manage account roles, and handle password resets for this lab."
      };
    }
    if (pathname.startsWith("/species")) {
      return {
        title: "Species",
        icon: ParkIcon,
        body: "Maintain the species catalog used by this lab."
      };
    }
    if (pathname.startsWith("/employees")) {
      return {
        title: "Employees",
        icon: GroupsIcon,
        body: "Maintain the employee roster used across daily operations and reports."
      };
    }
    if (pathname.startsWith("/daily-operations")) {
      return {
        title: "Daily Operations",
        icon: AssignmentIcon,
        body: "Record daily work: used mother jars, produced new jars, and phase of culture. This is the main production log."
      };
    }
    if (pathname.startsWith("/contamination")) {
      return {
        title: "Contamination",
        icon: BugReportIcon,
        body: "Track contamination/loss and keep production numbers realistic. Use filters to review problems over time."
      };
    }
    if (pathname.startsWith("/inventory-adjustments")) {
      return {
        title: "Adjustments",
        icon: TuneIcon,
        body: "Manual corrections to inventory when needed (loss, fix, notes). These changes affect the final stock."
      };
    }
    if (pathname.startsWith("/reports")) {
      return {
        title: "Reports",
        icon: DescriptionIcon,
        body: "Export PDFs and view summaries for inventory and operations. Use filters to generate focused reports."
      };
    }
    if (pathname.startsWith("/performance")) {
      return {
        title: "Performance",
        icon: InsightsIcon,
        body: "Visualize employee improvement and species upgrades over time using charts."
      };
    }
    return { ...DEFAULT, icon: SpaIcon };
  }, [pathname]);

  // hide on login page
  if (pathname.startsWith("/login") || pathname.startsWith("/invite/") || pathname.startsWith("/reset-password/")) return null;

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", mt: 2, px: 2 }}>
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: 2,
          border: "1px solid rgba(148, 163, 184, 0.35)",
          background: "linear-gradient(180deg, rgba(25,118,210,0.08), rgba(255,255,255,0.0))"
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
          {content.icon ? <content.icon sx={{ color: "#166534" }} /> : null}
          <Typography variant="h6" sx={{ fontWeight: 900 }}>
            {content.title}
          </Typography>
        </Stack>
        <Typography variant="body2" sx={{ opacity: 0.8 }}>
          {content.body}
        </Typography>
      </Paper>
    </Box>
  );
}
