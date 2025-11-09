import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from project root .env (one level up from server/)
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

const RUNS_DIR = path.join(__dirname, 'runs');
const BASE_DIR = path.resolve(process.env.BASE_DIR || path.resolve(__dirname, '..'));
const LAST_RUN_DIR = path.isAbsolute(process.env.LAST_RUN_DIR || '')
  ? process.env.LAST_RUN_DIR
  : path.join(BASE_DIR, process.env.LAST_RUN_DIR || '.last-run');

function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

ensureDir(RUNS_DIR);

function nowId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) + '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function copyIfExists(src, dst) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    return true;
  }
  return false;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// List available runs
app.get('/api/runs', (_req, res) => {
  ensureDir(RUNS_DIR);
  const items = fs
    .readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const infoPath = path.join(RUNS_DIR, d.name, 'run.json');
      let meta = { id: d.name };
      if (fs.existsSync(infoPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
        } catch (_) {}
      }
      return meta;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ runs: items });
});

// Trigger a new eval run using promptfoo
app.post('/api/run', async (req, res) => {
  const { configPath, env = {} } = req.body || {};
  if (!configPath) {
    return res.status(400).json({ error: 'configPath is required' });
  }

  const runId = nowId();
  const runDir = path.join(RUNS_DIR, runId);
  ensureDir(runDir);

  // Persist minimal metadata
  const meta = {
    id: runId,
    configPath,
    createdAt: new Date().toISOString(),
    status: 'running'
  };
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(meta, null, 2));

  // Build environment
  const childEnv = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (typeof k === 'string') childEnv[k] = String(v ?? '');
  }

  // Resolve config path relative to BASE_DIR if not absolute
  const resolvedConfig = path.isAbsolute(configPath)
    ? configPath
    : path.join(BASE_DIR, configPath);

  // Build CLI command from environment (generic to hide underlying tool)
  // EVAL_CLI: executable (default to npx or npx.cmd on Windows)
  // EVAL_ARGS: base arguments (e.g., "toolname eval")
  const defaultCli = /^win/i.test(process.platform) ? 'npx.cmd' : 'npx';
  const cli = (process.env.EVAL_CLI && process.env.EVAL_CLI.trim()) || defaultCli;
  const baseArgs = (process.env.EVAL_ARGS && process.env.EVAL_ARGS.trim()) || 'eval';
  const cliArgsBase = baseArgs.split(/\s+/).filter(Boolean);
  const args = [...cliArgsBase, '-c', resolvedConfig];
  const child = spawn(cli, args, {
    cwd: BASE_DIR,
    env: childEnv,
    shell: false
  });

  let logBuf = '';
  child.stdout.on('data', (d) => {
    const s = d.toString();
    logBuf += s;
    process.stdout.write(s);
  });
  child.stderr.on('data', (d) => {
    const s = d.toString();
    logBuf += s;
    process.stderr.write(s);
  });

  child.on('close', (code) => {
    // Copy artifacts from last run directory if present
    const reportSrc = path.join(LAST_RUN_DIR, 'report.html');
    const resultsSrc = path.join(LAST_RUN_DIR, 'results.json');

    const reportDst = path.join(runDir, 'report.html');
    const resultsDst = path.join(runDir, 'results.json');

    const reportOk = copyIfExists(reportSrc, reportDst);
    const resultsOk = copyIfExists(resultsSrc, resultsDst);

    const finalMeta = {
      ...meta,
      status: code === 0 ? 'completed' : 'failed',
      exitCode: code,
      artifacts: {
        report: reportOk ? 'report.html' : null,
        results: resultsOk ? 'results.json' : null
      },
      logsPath: 'logs.txt'
    };

    fs.writeFileSync(path.join(runDir, 'logs.txt'), logBuf);
    fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(finalMeta, null, 2));
  });

  res.json({ runId, status: 'started' });
});

// Serve report
app.get('/api/runs/:id/report', (req, res) => {
  const runDir = path.join(RUNS_DIR, req.params.id);
  const filePath = path.join(runDir, 'report.html');
  if (!fs.existsSync(filePath)) return res.status(404).send('Report not found');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  fs.createReadStream(filePath).pipe(res);
});

// Serve results JSON
app.get('/api/runs/:id/results', (req, res) => {
  const runDir = path.join(RUNS_DIR, req.params.id);
  const filePath = path.join(runDir, 'results.json');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'results.json not found' });
  res.setHeader('Content-Type', 'application/json');
  fs.createReadStream(filePath).pipe(res);
});

// Serve logs
app.get('/api/runs/:id/logs', (req, res) => {
  const runDir = path.join(RUNS_DIR, req.params.id);
  const filePath = path.join(runDir, 'logs.txt');
  if (!fs.existsSync(filePath)) return res.status(404).send('Logs not found');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  fs.createReadStream(filePath).pipe(res);
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`BASE_DIR: ${BASE_DIR}`);
  console.log(`LAST_RUN_DIR: ${LAST_RUN_DIR}`);
});
