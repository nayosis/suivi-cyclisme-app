import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "../format";
import { PALETTE, useIsDark } from "../palette";

interface StackedBarChartProps {
  title: string;
  unit: string;
  bikeNames: string[];
  bikeColors: Record<string, string>;
  data: Record<string, string | number>[];
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: Record<string, string | number>;
}

/** Segment topmost non-nul (dans l'ordre de la pile) pour une categorie donnee. */
function topBikeFor(payload: Record<string, string | number> | undefined, bikeNames: string[]): string | null {
  if (!payload) return null;
  for (let i = bikeNames.length - 1; i >= 0; i--) {
    if (Number(payload[bikeNames[i]]) > 0) return bikeNames[i];
  }
  return null;
}

/** Barre empilee : coins arrondis uniquement sur le segment reellement au sommet
 * de chaque barre (et pas sur "la derniere serie de la liste", qui peut valoir 0
 * pour telle ou telle categorie). */
function makeStackedShape(bike: string, bikeNames: string[]) {
  return (props: BarShapeProps) => {
    const { x = 0, y = 0, width = 0, height = 0, fill, payload } = props;
    if (height <= 0 || width <= 0) return <g />;
    const isTop = topBikeFor(payload, bikeNames) === bike;
    const r = isTop ? Math.min(4, width / 2, height) : 0;
    if (r <= 0) {
      return <rect x={x} y={y} width={width} height={height} fill={fill} />;
    }
    const d = `
      M${x},${y + height}
      L${x},${y + r}
      Q${x},${y} ${x + r},${y}
      L${x + width - r},${y}
      Q${x + width},${y} ${x + width},${y + r}
      L${x + width},${y + height}
      Z
    `;
    return <path d={d} fill={fill} />;
  };
}

export function StackedBarChart({ title, unit, bikeNames, bikeColors, data }: StackedBarChartProps) {
  const isDark = useIsDark();
  const colors = isDark ? PALETTE.dark : PALETTE.light;
  const hasData = data.some((row) => bikeNames.some((b) => Number(row[b]) > 0));

  return (
    <div className="card chart-card">
      <div className="chart-card__title">{title}</div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={240}>
          <RBarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={colors.gridline} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: colors.baseline }}
              tick={{ fill: colors.mutedInk, fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: colors.mutedInk, fontSize: 11 }}
              width={44}
            />
            <Tooltip
              cursor={{ fill: colors.gridline, opacity: 0.4 }}
              contentStyle={{
                background: colors.surface,
                border: `1px solid ${colors.gridline}`,
                borderRadius: 8,
                fontSize: 12.5,
              }}
              labelStyle={{ color: colors.secondaryInk, fontWeight: 600, marginBottom: 4 }}
              formatter={(value) => [`${formatNumber(Number(value))} ${unit}`, ""]}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, color: colors.secondaryInk }}
            />
            {bikeNames.map((bike) => (
              <Bar
                key={bike}
                dataKey={bike}
                stackId="bikes"
                fill={bikeColors[bike] ?? colors.mutedInk}
                maxBarSize={28}
                shape={makeStackedShape(bike, bikeNames)}
              />
            ))}
          </RBarChart>
        </ResponsiveContainer>
      ) : (
        <div className="empty-state">Pas de données</div>
      )}
    </div>
  );
}
