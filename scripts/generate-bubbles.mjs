#!/usr/bin/env node
// Renders the GitHub contribution calendar as a "bubble bobble" style
// animated SVG: each day is a bubble that pops into place, columns firing
// in left-to-right like bubbles being loaded into a bubble-shooter board.

import { writeFile, mkdir } from "node:fs/promises";

const LOGIN = process.env.GH_LOGIN || "themaker00001";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("Missing GH_TOKEN / GITHUB_TOKEN env var.");
  process.exit(1);
}

const QUERY = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              weekday
            }
          }
        }
      }
    }
  }
`;

async function fetchCalendar() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "bubble-bobble-contrib-graph",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data.user.contributionsCollection.contributionCalendar;
}

// Puzzle-Bobble style palette, brightest -> dimmest.
const PALETTE = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93"];

function levelFor(count, max) {
  if (count === 0) return 0;
  const q = max <= 0 ? 0 : count / max;
  if (q > 0.75) return 4;
  if (q > 0.5) return 3;
  if (q > 0.25) return 2;
  return 1;
}

function bubbleRadius(level) {
  return [1.6, 3.2, 4, 4.7, 5.4][level];
}

function buildSvg(calendar, theme) {
  const weeks = calendar.weeks;
  const max = Math.max(1, ...weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)));

  const cell = 13;
  const marginX = 24;
  const marginTop = 34;
  const marginBottom = 14;
  const cols = weeks.length;
  const rows = 7;

  const width = marginX * 2 + cols * cell;
  const height = marginTop + rows * cell + marginBottom;

  const isDark = theme === "dark";
  const bg = "transparent";
  const emptyFill = isDark ? "#2d3341" : "#e7ecf3";
  const emptyStroke = isDark ? "#3a4152" : "#d3dae4";
  const textColor = isDark ? "#c9d1d9" : "#3b4252";
  const cannonBody = isDark ? "#8b95a8" : "#5c6470";

  let bubbles = "";
  let maxDelay = 0;

  weeks.forEach((week, colIndex) => {
    week.contributionDays.forEach((day) => {
      const row = day.weekday;
      const level = levelFor(day.contributionCount, max);
      const cx = marginX + colIndex * cell + cell / 2;
      const cy = marginTop + row * cell + cell / 2;
      const delay = colIndex * 0.028 + row * 0.012;
      maxDelay = Math.max(maxDelay, delay);

      if (level === 0) {
        bubbles += `<circle cx="${cx}" cy="${cy}" r="${bubbleRadius(0)}" fill="${emptyFill}" stroke="${emptyStroke}" stroke-width="0.6"/>`;
        return;
      }

      const r = bubbleRadius(level);
      const color = PALETTE[level - 1];
      const title = `${day.date}: ${day.contributionCount} contribution${day.contributionCount === 1 ? "" : "s"}`;

      bubbles += `
        <g transform-origin="${cx} ${cy}" opacity="0">
          <title>${title}</title>
          <animateTransform attributeName="transform" type="scale" additive="sum"
            values="0 0;1.25 1.25;0.9 0.9;1 1" keyTimes="0;0.55;0.8;1"
            begin="${delay.toFixed(3)}s" dur="0.5s" fill="freeze" calcMode="spline"
            keySplines="0.3 0 0.7 1;0.3 0 0.7 1;0.3 0 0.7 1"/>
          <animate attributeName="opacity" from="0" to="1" begin="${delay.toFixed(3)}s" dur="0.15s" fill="freeze"/>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>
          <circle cx="${cx - r * 0.35}" cy="${cy - r * 0.35}" r="${r * 0.32}" fill="#ffffff" opacity="0.55"/>
        </g>`;
    });
  });

  const cannonX = marginX - 14;
  const cannonY = height - marginBottom + 2;
  const fireDelay = (maxDelay + 0.2).toFixed(2);

  const caption = `${LOGIN} — ${calendar.totalContributions} contributions, bubble-bobble style`;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="'Segoe UI', Helvetica, Arial, sans-serif">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <text x="${marginX}" y="18" font-size="12" fill="${textColor}" font-weight="600">${caption}</text>
  <g>
    <rect x="${cannonX - 6}" y="${cannonY - 4}" width="12" height="6" rx="2" fill="${cannonBody}"/>
    <circle cx="${cannonX}" cy="${cannonY - 8}" r="5" fill="${PALETTE[0]}">
      <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.85;1" dur="0.35s" begin="${fireDelay}s" fill="freeze"/>
    </circle>
    <circle cx="${cannonX}" cy="${cannonY - 8}" r="4.5" fill="${cannonBody}" opacity="0">
      <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.85;1" dur="0.35s" begin="${fireDelay}s" fill="freeze"/>
      <animateTransform attributeName="transform" type="scale" additive="sum" values="1 1;1.3 1.3;1 1" keyTimes="0;0.5;1" begin="${(Number(fireDelay) + 0.35).toFixed(2)}s" dur="1.6s" repeatCount="indefinite"/>
    </circle>
  </g>
  ${bubbles}
</svg>`;
}

async function main() {
  const calendar = await fetchCalendar();
  await mkdir("dist", { recursive: true });
  await writeFile("dist/bubble-contrib-light.svg", buildSvg(calendar, "light"));
  await writeFile("dist/bubble-contrib-dark.svg", buildSvg(calendar, "dark"));
  console.log(`Rendered bubble graph for ${LOGIN}: ${calendar.totalContributions} total contributions.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
