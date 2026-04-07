import { Box, Typography } from "@mui/material";

export default function SimpleLineChart({
  title = "",
  points = [],
  width = 900,
  height = 260,
  yLabel = "",
}) {
  const padL = 44;
  const padR = 12;
  const padT = 18;
  const padB = 34;

  const w = Math.max(width, 320);
  const h = Math.max(height, 160);

  if (!Array.isArray(points) || points.length === 0) {
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

  const values = points.map((p) => Number(p.y ?? 0)).filter((v) => Number.isFinite(v));
  const maxY = Math.max(...values, 0);
  const minY = Math.min(...values, 0);
  const rangeY = maxY - minY || 1;

  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const xAt = (i) => padL + (plotW * (points.length === 1 ? 0.5 : i / (points.length - 1)));
  const yAt = (v) => padT + plotH - ((v - minY) / rangeY) * plotH;

  const d = points
    .map((p, i) => {
      const v = Number(p.y ?? 0);
      const x = xAt(i);
      const y = yAt(Number.isFinite(v) ? v : 0);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }).map((_, i) => minY + (rangeY * i) / yTicks);

  return (
    <Box sx={{ p: 2, border: "1px solid #e5e7eb", borderRadius: 2 }}>
      {title ? (
        <Typography fontWeight={900} sx={{ mb: 1 }}>
          {title}
        </Typography>
      ) : null}

      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img">
        {/* grid + y labels */}
        {tickValues.map((tv, i) => {
          const y = yAt(tv);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#eef2f7" />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#64748b">
                {Math.round(tv)}
              </text>
            </g>
          );
        })}

        {/* axes */}
        <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="#cbd5e1" />
        <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#cbd5e1" />

        {/* line */}
        <path d={d} fill="none" stroke="#1976d2" strokeWidth="2.5" />

        {/* points */}
        {points.map((p, i) => {
          const v = Number(p.y ?? 0);
          const x = xAt(i);
          const y = yAt(Number.isFinite(v) ? v : 0);
          return <circle key={i} cx={x} cy={y} r="3.5" fill="#1976d2" />;
        })}

        {/* x labels (first, middle, last) */}
        {[0, Math.floor((points.length - 1) / 2), points.length - 1]
          .filter((v, idx, arr) => arr.indexOf(v) === idx)
          .map((i) => (
            <text
              key={i}
              x={xAt(i)}
              y={h - 12}
              textAnchor="middle"
              fontSize="10"
              fill="#64748b"
            >
              {points[i]?.xLabel ?? ""}
            </text>
          ))}

        {yLabel ? (
          <text x="10" y="12" fontSize="10" fill="#64748b">
            {yLabel}
          </text>
        ) : null}
      </svg>
    </Box>
  );
}

