import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

type RunMeta = {
  id: string;
  configPath?: string;
  createdAt?: string;
  status?: 'running' | 'completed' | 'failed';
  exitCode?: number;
  artifacts?: { report: string | null; results: string | null };
};

type Results = any;

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5050';

function useRuns() {
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/runs`);
      setRuns(res.data.runs ?? []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  return { runs, loading, refresh };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

export default function App() {
  const { runs, loading, refresh } = useRuns();
  const [tab, setTab] = useState<'configure' | 'evaluate' | 'results' | 'compare'>('configure');

  const [configPath, setConfigPath] = useState<string>('configs/eval.yaml');
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string }[]>([
    { key: 'OPENAI_API_KEY', value: '' },
  ]);
  const envObject = useMemo(() => {
    const o: Record<string, string> = {};
    envPairs.forEach(({ key, value }) => {
      if (key) o[key] = value;
    });
    return o;
  }, [envPairs]);

  const [starting, setStarting] = useState(false);
  const [startedRunId, setStartedRunId] = useState<string | null>(null);

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [resultsJson, setResultsJson] = useState<Results | null>(null);

  useEffect(() => {
    if (!selectedRunId) return;
    const load = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/runs/${selectedRunId}/results`);
        setResultsJson(res.data);
      } catch {
        setResultsJson(null);
      }
    };
    load();
  }, [selectedRunId]);

  const onAddEnv = () => setEnvPairs([...envPairs, { key: '', value: '' }]);
  const onRun = async () => {
    setStarting(true);
    try {
      const res = await axios.post(`${API_BASE}/api/run`, { configPath, env: envObject });
      setStartedRunId(res.data.runId);
      setTab('results');
      await new Promise((r) => setTimeout(r, 1000));
      await refresh();
    } catch (e: any) {
      alert(`Failed to start run: ${e?.response?.data?.error || e.message}`);
    } finally {
      setStarting(false);
    }
  };

  const latestReportUrl = selectedRunId
    ? `${API_BASE}/api/runs/${selectedRunId}/report`
    : undefined;

  const passRate = useMemo(() => {
    try {
      if (!resultsJson) return undefined;
      const items = resultsJson.results || resultsJson.items || [];
      if (!Array.isArray(items) || items.length === 0) return undefined;
      const passes = items.filter((i: any) => i?.pass === true || i?.passed === true).length;
      return Math.round((passes / items.length) * 100);
    } catch {
      return undefined;
    }
  }, [resultsJson]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0b1020', color: '#e5e7eb' }}>
      <aside style={{ width: 260, borderRight: '1px solid #1f2a44', padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Evaluation Console</div>
        <div>
          <button onClick={() => setTab('configure')} style={btn(tab === 'configure')}>Configure</button>
          <button onClick={() => setTab('evaluate')} style={btn(tab === 'evaluate')}>Evaluate</button>
          <button onClick={() => setTab('results')} style={btn(tab === 'results')}>Results</button>
          <button onClick={() => setTab('compare')} style={btn(tab === 'compare')}>Compare</button>
        </div>
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>Runs</div>
          <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
            {loading && <div>Loading…</div>}
            {runs.map((r) => (
              <div key={r.id} style={{ marginBottom: 8 }}>
                <button
                  onClick={() => setSelectedRunId(r.id)}
                  style={{
                    ...smallBtn(selectedRunId === r.id),
                    width: '100%',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{r.id}</div>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>{r.status}</div>
                </button>
              </div>
            ))}
          </div>
          <button onClick={refresh} style={{ ...smallBtn(false), marginTop: 8, width: '100%' }}>Refresh</button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: 24 }}>
        {tab === 'configure' && (
          <section>
            <h2 style={{ marginTop: 0 }}>Configuration</h2>
            <Field label="Configuration file path">
              <input
                value={configPath}
                onChange={(e) => setConfigPath(e.target.value)}
                placeholder="configs/eval.yaml"
                style={inputStyle}
              />
            </Field>

            <div style={{ marginTop: 16, fontWeight: 600 }}>Provider Environment Variables</div>
            {envPairs.map((p, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  value={p.key}
                  onChange={(e) => {
                    const next = [...envPairs];
                    next[idx] = { ...p, key: e.target.value };
                    setEnvPairs(next);
                  }}
                  placeholder="OPENAI_API_KEY"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <input
                  value={p.value}
                  onChange={(e) => {
                    const next = [...envPairs];
                    next[idx] = { ...p, value: e.target.value };
                    setEnvPairs(next);
                  }}
                  placeholder="value (not persisted)"
                  style={{ ...inputStyle, flex: 2 }}
                />
              </div>
            ))}
            <button onClick={onAddEnv} style={{ ...smallBtn(false), marginTop: 8 }}>+ Add variable</button>
          </section>
        )}

        {tab === 'evaluate' && (
          <section>
            <h2 style={{ marginTop: 0 }}>Run Evaluation</h2>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button onClick={onRun} disabled={starting} style={primaryBtn}>
                {starting ? 'Starting…' : 'Start evaluation'}
              </button>
              {startedRunId && <div>Started: {startedRunId}</div>}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
              The server runs your evaluation with the selected configuration. Artifacts are stored per run.
            </div>
          </section>
        )}

        {tab === 'results' && (
          <section>
            <h2 style={{ marginTop: 0 }}>Results</h2>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <span>Selected run:</span>
              <select
                value={selectedRunId ?? ''}
                onChange={(e) => setSelectedRunId(e.target.value || null)}
                style={inputStyle}
              >
                <option value="">Select a run</option>
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>{r.id}</option>
                ))}
              </select>
              <button onClick={refresh} style={smallBtn(false)}>Refresh</button>
            </div>

            {passRate !== undefined && (
              <div style={{ marginTop: 12 }}>Pass rate: <strong>{passRate}%</strong></div>
            )}

            {latestReportUrl ? (
              <iframe
                src={latestReportUrl}
                title="report"
                style={{ width: '100%', height: '70vh', border: '1px solid #1f2a44', marginTop: 16, background: '#fff' }}
              />
            ) : (
              <div style={{ marginTop: 16 }}>No run selected.</div>
            )}
          </section>
        )}

        {tab === 'compare' && (
          <CompareView runs={runs} />
        )}
      </main>
    </div>
  );
}

function CompareView({ runs }: { runs: RunMeta[] }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [ra, setRa] = useState<any>(null);
  const [rb, setRb] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      setRa(null); setRb(null);
      if (a) {
        try { setRa((await axios.get(`${API_BASE}/api/runs/${a}/results`)).data); } catch {}
      }
      if (b) {
        try { setRb((await axios.get(`${API_BASE}/api/runs/${b}/results`)).data); } catch {}
      }
    };
    load();
  }, [a, b]);

  const metric = (r: any) => {
    try {
      const items = r?.results || r?.items || [];
      const passes = items.filter((i: any) => i?.pass || i?.passed).length;
      return { count: items.length, passes, rate: items.length ? Math.round((passes / items.length) * 100) : 0 };
    } catch { return { count: 0, passes: 0, rate: 0 }; }
  };

  const ma = metric(ra);
  const mb = metric(rb);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Compare Runs</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={a} onChange={(e) => setA(e.target.value)} style={inputStyle}>
          <option value="">Select run A</option>
          {runs.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
        </select>
        <select value={b} onChange={(e) => setB(e.target.value)} style={inputStyle}>
          <option value="">Select run B</option>
          {runs.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Run A</div>
          <div>Total: {ma.count}</div>
          <div>Passes: {ma.passes}</div>
          <div>Pass rate: {ma.rate}%</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Run B</div>
          <div>Total: {mb.count}</div>
          <div>Passes: {mb.passes}</div>
          <div>Pass rate: {mb.rate}%</div>
        </div>
      </div>
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  background: '#0f172a',
  border: '1px solid #1f2a44',
  color: '#e5e7eb',
  borderRadius: 6,
  padding: '8px 10px'
};

const primaryBtn: React.CSSProperties = {
  background: '#2563eb',
  border: '1px solid #1e40af',
  color: 'white',
  borderRadius: 6,
  padding: '8px 12px',
  cursor: 'pointer'
};

function btn(active: boolean): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: active ? '#111827' : 'transparent',
    border: '1px solid #1f2a44',
    color: '#e5e7eb',
    borderRadius: 6,
    padding: '8px 10px',
    cursor: 'pointer',
    marginBottom: 6
  };
}

function smallBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? '#1f2937' : 'transparent',
    border: '1px solid #1f2a44',
    color: '#e5e7eb',
    borderRadius: 6,
    padding: '6px 8px',
    cursor: 'pointer'
  };
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #1f2a44',
  borderRadius: 8,
  padding: 12,
  background: '#0f172a'
};
