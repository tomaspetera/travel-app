// Claude (Agent SDK) pro GitHub Actions: opraví chybu z issue (@claude), denní kontrolu jedné oblasti aplikace nebo
// ruční úkol. Mění jen soubory v repozitáři – větev, commit, PR a komentář udělá workflow (claude-agent.yml), ať
// Claude nemá přístup ke git push ani GitHubu. Platí se z kreditu Anthropic API (ANTHROPIC_API_KEY).
// Výstup: $RUNNER_TEMP/claude-summary.md – první řádek = název PR, dál český popis; při chybě exit 1 s důvodem.
import { query } from '@anthropic-ai/claude-agent-sdk';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const env = process.env;
const repo = env.GITHUB_WORKSPACE || process.cwd();
const mode = env.CLAUDE_MODE || 'task';
const out = join(env.RUNNER_TEMP || '/tmp', 'claude-summary.md');

// denní kontrola: každý den jedna oblast (podle dne v roce), ať se za pár dní projde celá aplikace
const AREAS = [
  'Lety – hledání, výsledky, filtry, kalendář a mřížka termínů (public/js/flights.js, public/js/searchhelp.js, server/lib/search.js)',
  'Průvodce Cestou – trasa, ubytování, auto, program, shrnutí (public/js/trip.js, server/lib/stays.js, server/lib/stayplan.js)',
  'Objevuj – místa, výlety, celá země, trasy pěšky a na kole (public/js/places.js, server/lib/poi.js, server/lib/mapy.js)',
  'Přehled – radar cen, hlídání cen, Co je nového, odložené nabídky (public/js/app.js, public/js/alerts.js, public/js/pins.js)',
  'Zdroje cen na serveru – Ryanair, Wizz Air, Kiwi.com, Travelpayouts, Xotelo: chyby, časové limity, mezipaměť (server/providers/, server/lib/)',
  'Data – data/*.json (doprava z letiště do města, země, vstupní podmínky): rozpory, zastaralé údaje, chybějící hodnoty, testy k nim',
  'Vzhled – CSS pro telefon (public/css/atlas.css, flights.css, trip.css) a počítač (public/css/desktop*.css): přetékání, nekonzistence',
];
const day = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 864e5);

const tasks = {
  issue: `Úkol z GitHub issue #${env.ISSUE_NUMBER || '?'} („${env.ISSUE_TITLE || ''}“):\n\n${env.ISSUE_BODY || ''}\n\n` +
    (env.COMMENT_BODY ? `Poslední komentář v issue:\n\n${env.COMMENT_BODY}\n\n` : '') +
    'Udělej, co issue žádá. Když je to otázka, jen odpověz (nic neměň).',
  check: `Denní kontrola oblasti: ${AREAS[day % AREAS.length]}.\n\n` +
    'Najdi v této oblasti skutečné chyby (špatná logika, čísla nebo data, rozbité odkazy, české texty, které si odporují, ' +
    'stavy, které se nevynulují, přetékání na telefonu) a oprav ty, které ověříš testem nebo jasným důkazem v kódu. ' +
    'Nic nevymýšlej navíc – když nic skutečného nenajdeš, nic neměň.',
  task: env.CLAUDE_TASK || 'Spusť testy a shrň stav repozitáře.',
};

const prompt = `${tasks[mode] || tasks.task}

Pravidla: drž se CLAUDE.md. Malé, ověřené změny ve stylu okolního kódu. K opravě logiky přidej nebo uprav test v test/
a spusť \`npm test\` – musí projít. Na živou aplikaci (https://atlas-letenky.onrender.com) smíš jen GET /api/health a
/api/places, nikdy /api/search. Commity, větve a PR nedělej – udělá je workflow z tvých změn v souborech.

Na úplný konec napiš shrnutí česky: první řádek krátký název změny (bude to název PR, bez „#“, do 80 znaků; popiš,
co se v aplikaci změnilo, např. „Hlídání: prošlé datum už nehlásí zlevnění“, ne „Hotovo“ ani „Funkce je hotová“), pak prázdný řádek a
odrážky: co bylo špatně, co se změnilo a jak je to ověřené, a zvlášť nálezy, které jsi neopravil, s důvodem.
Když jsi nic neměnil, první řádek začni „Beze změn:“.`;

const allowedTools = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep',
  'Bash(npm test)', 'Bash(node --test:*)', 'Bash(git status)', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)',
  'WebFetch(domain:atlas-letenky.onrender.com)',
];

let result = null;
for await (const m of query({
  prompt,
  options: {
    cwd: repo,
    model: env.CLAUDE_MODEL || 'claude-opus-5-5',
    maxTurns: Number(env.CLAUDE_MAX_TURNS || 80),
    maxBudgetUsd: Number(env.CLAUDE_MAX_USD || 8),
    permissionMode: 'dontAsk', // co není v allowedTools, se zamítne (nikdo tu neodpovídá na dotazy)
    allowedTools,
    disallowedTools: ['WebSearch'],
    settingSources: ['project'], // CLAUDE.md z repozitáře
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    env: { ...env, CLAUDE_AGENT_SDK_CLIENT_APP: 'atlas-github' },
  },
})) {
  if (m.type === 'assistant' && m.error) console.log(`::warning::chyba odpovědi: ${m.error}`);
  if (m.type === 'result') result = m;
}

if (!result) { console.log('::error::Claude neskončil výsledkem'); process.exit(1); }
console.log(`Claude: ${result.subtype}, ${result.num_turns} kroků, ~${(result.total_cost_usd || 0).toFixed(2)} $`);
if (result.subtype !== 'success' || result.is_error) {
  const why = (result.errors || [result.result || '']).join(' | ').slice(0, 1500);
  console.log(`::error::Claude skončil chybou (${result.subtype}${result.api_error_status ? `, HTTP ${result.api_error_status}` : ''}): ${why}`);
  process.exit(1);
}
writeFileSync(out, `${(result.result || '').trim()}\n\n---\n_Claude (Agent SDK, ${result.num_turns} kroků, ~${(result.total_cost_usd || 0).toFixed(2)} $ z kreditu API)_\n`);
