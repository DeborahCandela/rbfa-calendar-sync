import fs from "node:fs/promises";
import path from "node:path";

// Teams configuration
const TEAMS = [
  {
    name: "K.V. Bonheiden U15 B",
    filename: "bonheiden-u15b.ics",
    // Team ID or URL
    searchClub: "Bonheiden",
    teamCategory: "U15 B"
  },
  {
    name: "V.C. Rijmenam U10",
    filename: "rijmenam-u10.ics",
    searchClub: "Rijmenam",
    teamCategory: "U10"
  }
];

const ENDPOINT = "https://datalake-prod2018.rbfa.be/graphql";
const AUTH = "Basic " + Buffer.from("website:xu8e4j2kWRMDmmdqjj7S3EioFFvYNuExDtbJHfVXhJqhBgDEc8").toString("base64");

const QUERY = `query GetTeamCalendar($teamId: ID!, $language: Language!, $sortByDate: SortDirection) {
  teamCalendar(teamId: $teamId, language: $language, sortByDate: $sortByDate) {
    id
    startTime
    state
    homeTeam { name }
    awayTeam { name }
    outcome { status homeTeamGoals awayTeamGoals }
    series { name }
  }
}`;

function buildIcs(calendarName, fixtures) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RBFA Calendar Sync//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${calendarName}`,
    "X-WR-TIMEZONE:Europe/Brussels",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Brussels",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE"
  ];

  for (const m of fixtures) {
    const start = new Date(m.startTime);
    const end = new Date(start.getTime() + 90 * 60 * 1000); // 90 min match duration

    const fmtDate = (d) => {
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    };

    const isCancelled = m.state === "CANCELLED" || m.state === "POSTPONED";
    const statusPrefix = isCancelled ? "[AFGELAST] " : "";
    let summary = `${statusPrefix}${m.homeTeam?.name || "TBD"} - ${m.awayTeam?.name || "TBD"}`;
    if (m.outcome?.homeTeamGoals != null && m.outcome?.awayTeamGoals != null) {
      summary += ` (${m.outcome.homeTeamGoals}-${m.outcome.awayTeamGoals})`;
    }

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:rbfa-${m.id}@rbfa-calendar-sync`);
    lines.push(`DTSTAMP:${fmtDate(new Date())}`);
    lines.push(`DTSTART:${fmtDate(start)}`);
    lines.push(`DTEND:${fmtDate(end)}`);
    lines.push(`SUMMARY:${summary}`);
    if (m.series?.name) {
      lines.push(`DESCRIPTION:${m.series.name}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

async function fetchFixtures(teamId) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": AUTH,
      "Origin": "https://www.voetbalvlaanderen.be",
      "Referer": "https://www.voetbalvlaanderen.be/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    },
    body: JSON.stringify({
      operationName: "GetTeamCalendar",
      query: QUERY,
      variables: { teamId, language: "nl", sortByDate: "asc" }
    })
  });

  const data = await res.json();
  return data?.data?.teamCalendar || [];
}

async function main() {
  const distDir = path.resolve("dist");
  await fs.mkdir(distDir, { recursive: true });

  // Bonheiden U15 B matches
  console.log("Fetching Bonheiden U15 B...");
  try {
    // You can also pass the teamId directly from your team URL
    const bonheidenFixtures = await fetchFixtures("bonheiden-u15b");
    const icsContent = buildIcs("K.V. Bonheiden U15 B", bonheidenFixtures);
    await fs.writeFile(path.join(distDir, "bonheiden-u15b.ics"), icsContent, "utf8");
  } catch (err) {
    console.error("Error updating Bonheiden:", err);
  }

  // Rijmenam U10 matches
  console.log("Fetching Rijmenam U10...");
  try {
    const rijmenamFixtures = await fetchFixtures("rijmenam-u10");
    const icsContent = buildIcs("V.C. Rijmenam U10", rijmenamFixtures);
    await fs.writeFile(path.join(distDir, "rijmenam-u10.ics"), icsContent, "utf8");
  } catch (err) {
    console.error("Error updating Rijmenam:", err);
  }

  // Create an index.html preview page
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>RBFA Calendar Feeds</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    h1 { font-size: 24px; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Voetbal Kalender Feeds</h1>
  <p>Gebruik deze links om je ploegen te abonneren in Cozi:</p>
  <div class="card">
    <h3>K.V. Bonheiden U15 B</h3>
    <p><a href="bonheiden-u15b.ics">Download .ics</a> of kopieer de link:</p>
    <code>bonheiden-u15b.ics</code>
  </div>
  <div class="card">
    <h3>V.C. Rijmenam U10</h3>
    <p><a href="rijmenam-u10.ics">Download .ics</a> of kopieer de link:</p>
    <code>rijmenam-u10.ics</code>
  </div>
</body>
</html>`;
  await fs.writeFile(path.join(distDir, "index.html"), html, "utf8");
  console.log("Sync finished successfully.");
}

main().catch(console.error);
