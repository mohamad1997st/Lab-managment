import { Link } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  Container,
  Divider,
  Stack,
  Typography,
  Chip
} from "@mui/material";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import AssignmentIcon from "@mui/icons-material/Assignment";
import BugReportIcon from "@mui/icons-material/BugReport";
import DescriptionIcon from "@mui/icons-material/Description";

import tissue101 from "../assets/tissue101.jpeg"; // ✅ عدّل الاسم/المسار حسب ملفك

export default function Welcome() {
  return (
    <Box
      sx={{
        minHeight: "calc(100vh - 64px)",
        py: { xs: 3, md: 5 },
        background:
          "radial-gradient(1200px 500px at 10% 10%, rgba(25,118,210,0.12) 0%, rgba(255,255,255,1) 55%), radial-gradient(900px 500px at 90% 20%, rgba(46,125,50,0.10) 0%, rgba(255,255,255,1) 55%)"
      }}
    >
      <Container maxWidth="lg">
        <Card
          elevation={0}
          sx={{
            borderRadius: 4,
            overflow: "hidden",
            border: "1px solid rgba(0,0,0,0.10)",
            boxShadow: "0 18px 60px rgba(0,0,0,0.10)"
          }}
        >
          {/* ✅ Single Row */}
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              minHeight: { xs: "auto", md: "calc(100vh - 170px)" } // ✅ تقريباً طول الصفحة
            }}
          >
            {/* LEFT: Steps */}
            <Box
              sx={{
                flex: 1,
                p: { xs: 3, md: 4 },
                bgcolor: "#fff"
              }}
            >
              <Stack spacing={2.2}>
                <Stack spacing={1}>
                  <Typography variant="h4" fontWeight={900}>
                    Mother Roots Lab System
                  </Typography>
                  <Typography sx={{ opacity: 0.8 }}>
                    Tissue culture workflow overview + quick access to the system pages.
                  </Typography>

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip label="Inventory" variant="outlined" icon={<Inventory2Icon />} />
                    <Chip label="Daily Operations" variant="outlined" icon={<AssignmentIcon />} />
                    <Chip label="Contamination" variant="outlined" icon={<BugReportIcon />} />
                    <Chip label="Reports" variant="outlined" icon={<DescriptionIcon />} />
                  </Stack>
                </Stack>

                <Divider />

                <Typography variant="h6" fontWeight={900}>
                  Tissue Culture Steps (Simple Guide)
                </Typography>

                <Step
                  n="1"
                  title="Disinfestation"
                  desc="Clean the explant, remove surface debris, then disinfect to reduce fungi and bacteria before placing on sterile medium."
                />
                <Step
                  n="2"
                  title="Induce Callus"
                  desc="On the right medium + hormones, cells can form callus (undifferentiated tissue) that can regenerate plant organs."
                />
                <Step
                  n="3"
                  title="Induce Shoots"
                  desc="Transfer callus / nodes to a shoot induction medium to stimulate multiple shoots formation."
                />
                <Step
                  n="4"
                  title="Rooting"
                  desc="Move healthy shoots to rooting medium (auxin-based) until roots develop."
                />
                <Step
                  n="5"
                  title="Acclimatization"
                  desc="Gradually adapt plantlets to ex vitro conditions (humidity/light) before transfer to greenhouse."
                />

                <Divider />

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                  <Button
                    component={Link}
                    to="/inventory"
                    variant="contained"
                    size="large"
                    sx={{ fontWeight: 800 }}
                    startIcon={<Inventory2Icon />}
                  >
                    Go to Inventory
                  </Button>

                  <Button
                    component={Link}
                    to="/daily-operations"
                    variant="outlined"
                    size="large"
                    sx={{ fontWeight: 800 }}
                    startIcon={<AssignmentIcon />}
                  >
                    Daily Operations
                  </Button>

                  <Button
                    component={Link}
                    to="/reports"
                    variant="outlined"
                    size="large"
                    sx={{ fontWeight: 800 }}
                    startIcon={<DescriptionIcon />}
                  >
                    Reports
                  </Button>
                </Stack>
              </Stack>
            </Box>

            {/* RIGHT: Image full height */}
            <Box
              sx={{
                width: { xs: "100%", md: 420 },
                borderLeft: { md: "1px solid rgba(0,0,0,0.08)" },
                bgcolor: "#fafafa",
                display: "flex",
                alignItems: "stretch",
                p: { xs: 1.5, md: 2 },
                boxSizing: "border-box"
              }}
            >
              <Box
                component="img"
                src={tissue101}
                alt="Plant Tissue Culture 101"
                sx={{
                  width: "100%",
                  height: { xs: 520, md: "100%" }, // ✅ بالموبايل طول ثابت، بالديسكتوب طول الصفحة
                  objectFit: "contain",            // ✅ بدون crop
                  display: "block",
                  p: 0
                }}
              />
            </Box>
          </Box>
        </Card>
      </Container>
    </Box>
  );
}

function Step({ n, title, desc }) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 3,
        border: "1px solid rgba(0,0,0,0.08)",
        bgcolor: "rgba(25,118,210,0.03)"
      }}
    >
      <Stack spacing={0.5}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              bgcolor: "rgba(25,118,210,0.12)",
              fontWeight: 900
            }}
          >
            {n}
          </Box>
          <Typography fontWeight={900}>{title}</Typography>
        </Stack>
        <Typography variant="body2" sx={{ opacity: 0.85 }}>
          {desc}
        </Typography>
      </Stack>
    </Box>
  );
}
