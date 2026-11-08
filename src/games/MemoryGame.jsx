import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { shuffledPairs } from './arcade.js';
import { useDemo } from '../state/DemoContext.jsx';
import { useResultRecorder } from './GameResultsContext.jsx';
import { pairsResult } from './leaderboards.js';
const symbols = ['✦','●','▲','◆','♥','☀'];
export default function MemoryGame() {
  const { t } = useLanguage(), g = t.games;
  const [deck,setDeck] = useState(shuffledPairs), [open,setOpen] = useState([]), [found,setFound] = useState([]), [turns,setTurns] = useState(0);
  const timer = useRef(null);
  const runId = useRef(null), reported = useRef(null);
  const {profile} = useDemo(), {save,notice} = useResultRecorder();
  const saveRef = useRef(save); saveRef.current=save;
  useEffect(() => () => clearTimeout(timer.current),[]);
  useEffect(() => {
    if (found.length !== 6 || reported.current === runId.current) return;
    const result=pairsResult(deck,found,turns,runId.current,profile.id);
    if (result) { reported.current=runId.current; saveRef.current(result); }
  },[found,deck,turns,profile.id]);
  function reveal(index) {
    if (open.length >= 2 || open.includes(index) || found.includes(deck[index])) return;
    if (!runId.current) runId.current='run-'+crypto.randomUUID();
    const selected = [...open,index]; setOpen(selected);
    if (selected.length === 2) { setTurns((v) => v+1); timer.current = setTimeout(() => { if (deck[selected[0]] === deck[selected[1]]) setFound((v) => [...v,deck[index]]); setOpen([]); },650); }
  }
  function reset() { clearTimeout(timer.current); runId.current=null; reported.current=null; setDeck(shuffledPairs()); setOpen([]); setFound([]); setTurns(0); }
  return <section className="content-card memory-game"><p>{g.memoryHint}</p><div className="game-score"><span>{g.pairs}: {found.length}/6</span><span>{g.moves}: {turns}</span></div><div className="memory-grid">{deck.map((value,index) => { const visible = open.includes(index) || found.includes(value); return <button className={visible ? 'memory-card revealed' : 'memory-card'} type="button" key={index} disabled={found.includes(value) || open.length === 2} aria-label={g.card + ' ' + (index+1) + (visible ? ': ' + symbols[value] : '')} aria-pressed={visible} onClick={() => reveal(index)}>{visible ? symbols[value] : <span aria-hidden="true">DC</span>}</button>; })}</div><p role="status" className="save-status">{found.length === 6 ? g.complete + ' · ' + g.moves + ': ' + turns : ''}</p><button className="button button-secondary" type="button" onClick={reset}>{g.restart}</button>{notice}</section>;
}
