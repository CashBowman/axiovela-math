import {createPortal} from 'react-dom';
import React, {useEffect, useState} from 'react';
import './updates.css';

const guidance = {
  AppImage: 'Save your work and finish assistants and exports, then close Axiovela Math. Open the downloaded AppImage (enable “Allow executing” in its file properties if needed). Keep the previous app until the new copy works.',
  'tar.gz': 'Save your work and finish assistants and exports, then close Axiovela Math. Extract the downloaded archive into a new application folder and open axiovela-math. Keep the previous app until the new copy works.',
};

export default function UpdateNotice() {
  const api = window.methodflowDesktop;
  const [state, setState] = useState(null), [open, setOpen] = useState(false), [dismissed, setDismissed] = useState(null), [format, setFormat] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    if (!api?.update) return;
    let mounted = true;
    api.update('state').then(s => { if (mounted) setState(s); }).catch(() => {});
    const stop = api.onUpdate(setState), stopOpen = api.onUpdateOpen(() => setOpen(true));
    return () => { mounted = false; stop(); stopOpen(); };
  }, [api]);
  if (!state) return null;
  const act = async (action, value) => { setError(''); try { setState(await api.update(action, value)); } catch (e) { setError(e.message); } };
  const busy = ['checking', 'downloading'].includes(state.status);
  const selected = state.formats.includes(format) ? format : state.format;
  const notice = state.release && dismissed !== state.release.version;
  return <>{createPortal(<aside className="update-notice" aria-label="Application updates">
    {!open && notice && <button className="update-badge" onClick={() => setOpen(true)}>Update available · {state.release.version}</button>}
    {open && <section className="update-panel" aria-label="Update details">
      <div className="update-heading"><strong>{state.release ? `Update available · ${state.release.version}` : 'Application updates'}</strong><button aria-label="Close update details" onClick={() => { setOpen(false); setDismissed(state.release?.version); }}>×</button></div>
      <small>Installed {state.currentVersion} · Guided installation</small>
      <label>Release channel <select aria-label="Release channel" disabled={busy} value={state.channel} onChange={e => { setDismissed(null); void act('channel', e.target.value); }}><option value="stable">Stable</option><option value="beta">Beta (opt in)</option></select></label>
      {state.channel === 'beta' && <small>Includes prereleases. Switching to stable never downgrades your app.</small>}
      {state.release && <p className="update-notes">{state.release.notes || 'See the release page for details.'}</p>}
      <div role="status" aria-live="polite">{state.status === 'checking' ? 'Checking for updates…' : state.status === 'current' ? 'No newer release found in this channel.' : state.status === 'ready' ? 'Download verified. Install when your work is finished.' : ''}</div>
      {(error || state.error) && <p role="status">{error || state.error}</p>}
      {state.release && state.status !== 'ready' && <label>Installation format <select aria-label="Installation format" value={selected} disabled={busy} onChange={e => setFormat(e.target.value)}>{state.formats.map(f => <option key={f} value={f}>{f === 'AppImage' ? 'AppImage (single file)' : f === 'tar.gz' ? 'Portable archive' : f}</option>)}</select></label>}
      {state.release && !state.release.verified && <p>{guidance[selected]}</p>}
      {state.status === 'downloading' && <><progress aria-label="Update download" value={state.progress} max="100"/><small>{state.progress}% downloaded · You can keep working</small></>}
      {state.status === 'ready' && <><p>{guidance[state.format]}</p><p>Your projects and saved workspace stay in their current locations.</p></>}
      <div className="update-actions">
        {state.status === 'downloading' ? <button onClick={() => void act('cancel')}>Cancel download</button> : state.status !== 'ready' && <button disabled={busy} onClick={() => void act('check')}>{state.status === 'checking' ? 'Checking…' : 'Check for updates'}</button>}
        {state.release?.verified && !busy && state.status !== 'ready' && <button onClick={() => void act('download', selected)}>{state.error ? 'Retry download' : 'Download update'}</button>}
        {state.status === 'ready' && <button onClick={() => void act('reveal')}>Show downloaded update</button>}
        <button onClick={() => void act('releases')}>Release page</button><button onClick={() => void act('repository')}>GitHub</button>
        <button onClick={() => { setOpen(false); setDismissed(state.release?.version); }}>Later</button>
      </div>
    </section>}
  </aside>,document.body)}</>;
}
