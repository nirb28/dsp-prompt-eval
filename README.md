# dsp-prompt-eval

## Evaluation Console (React + Node)

A simple UI for running evaluations with a configurable engine, viewing results, and comparing runs.

### Prerequisites

- Node.js 18+
- npm 9+
  

### Install

```bash
npm run install:all
```
npm install

This installs dependencies for both `server/` and `ui/`.

### Develop

```bash
npm run dev
```

This starts:
- Server on http://localhost:5050
- UI (Vite) on http://localhost:5173

If you prefer to run separately:

```bash
# terminal 1
npm --prefix server run dev

# terminal 2
npm --prefix ui run dev
```

### Using the App

1. Open http://localhost:5173
2. Configure the path to your evaluation config (default placeholder: `configs/eval.yaml`)
3. Enter provider environment variables (e.g., `OPENAI_API_KEY`) in the UI. These are sent to the server for the current run only and are not persisted.
4. Click "Start evaluation". The server runs the evaluation with your configuration and stores artifacts per run.
5. View the HTML report and parsed metrics under the Results tab.
6. Use the Compare tab to compare two runs (pass rate, totals).

### Where runs are stored

- Runs are saved under `server/runs/<timestamp>/`
- Artifacts:
  - `report.html` (rendered in the UI)
  - `results.json` (parsed for metrics)
  - `logs.txt` (stdout/stderr from `promptfoo`)

### Environment variables

The server process inherits your shell environment. The UI can also pass variables for a specific run. Common variables include:

- `NVAPI_KEY`

These are not persisted to disk by the server.
