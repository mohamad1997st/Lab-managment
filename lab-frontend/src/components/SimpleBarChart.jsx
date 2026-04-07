import { Box, Typography } from "@mui/material";

export default function SimpleBarChart({
  title = "",
  bars = [],
  width = 900,
  height = 260,
}) {
  const padL = 44;
  const padR = 12;
  const padT = 18;
  const padB = 34;

  const w = Math.max(width, 320);
  const h = Math.max(height, 160);

  if (!Array.isArray(bars) || bars.length === 0) {
    return (
      <Box sx={{ p: 2, border: "1px solid #e5e7eb", borderRadius: 2 }}>
        {title ? (
          <Typography fontWeight={900} sx={{ mb: 1 }}>
            {title}
          </Typography>
        ) : null}
        <Typography sx={{ opacity: 0.7 }}>No data</Typography>
      </Box>
    );
  }

  const values = bars.map((b) => Number(b.value ?? 0)).filter((v) => Number.isFinite(v));
  const maxY = Math.max(...values, 0) || 1;

  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const gap = 10;
  const barW = Math.max((plotW - gap * (bars.length - 1)) / bars.length, 8);

  const xAt = (i) => padL + i * (barW + gap);
  const yAt = (v) => padT + plotH - (v / maxY) * plotH;

  return (
    <Box sx={{ p: 2, border: "1px solid #e5e7eb", borderRadius: 2 }}>
      {title ? (
        <Typography fontWeight={900} sx={{ mb: 1 }}>
          {title}
        </Typography>
      ) : null}

      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img">
        {/* axes */}
        <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="#cbd5e1" />
        <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#cbd5e1" />

        {/* bars */}
        {bars.map((b, i) => {
          const v = Number(b.value ?? 0);
          const value = Number.isFinite(v) ? v : 0;
          const x = xAt(i);
          const y = yAt(value);
          const barH = padT + plotH - y;
          const fill = b.color || "#1976d2";

          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} fill={fill} rx="3" />
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="#334155">
                {Math.round(value)}
              </text>
              <text
                x={x + barW / 2}
                y={h - 12}
                textAnchor="middle"
                fontSize="10"
                fill="#64748b"
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

