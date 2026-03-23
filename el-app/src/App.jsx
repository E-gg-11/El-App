import { useState, useRef, useCallback, useEffect } from 'react'

// ── STORAGE ───────────────────────────────────────────────────────
const LS = {
  get: (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};
const KEYS = ["el_habits","el_sleep","el_workouts","el_matches","el_school","el_xp","el_checkins","el_glowups"];

// ── DATES ─────────────────────────────────────────────────────────
const today   = () => new Date().toISOString().slice(0,10);
const dname   = (iso) => new Date(iso+"T12:00:00").toLocaleDateString("de-DE",{weekday:"short"});
const dfmt    = (iso) => new Date(iso+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});
const last7   = () => Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d.toISOString().slice(0,10);});
const lastN   = (n) => Array.from({length:n},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(n-1-i));return d.toISOString().slice(0,10);});
const wkStart = () => {const d=new Date();const diff=d.getDay()===0?-6:1-d.getDay();d.setDate(d.getDate()+diff);return d.toISOString().slice(0,10);};
const daysUntil = (iso) => iso ? Math.max(0, Math.round((new Date(iso+`T12:00:00`) - new Date()) / 86400000)) : null;

// ── XP ────────────────────────────────────────────────────────────
const XP = {habit:10,sleep:15,workout:20,task:25,match:30,checkin:5};
const XP_PER = 500;
const totalXP  = (log) => Object.values(log||{}).reduce((s,v)=>s+v,0);
const lvlOf    = (xp)  => Math.floor(xp/XP_PER)+1;
const xpInLvl  = (xp)  => xp%XP_PER;
const xpPct    = (xp)  => (xpInLvl(xp)/XP_PER)*100;
const LEVELS = [
  {n:1,title:"Rookie",icon:"🌱"},{n:2,title:"Aufsteiger",icon:"⚡"},
  {n:3,title:"Konsistent",icon:"🔥"},{n:4,title:"Fokussiert",icon:"🎯"},
  {n:5,title:"Diszipliniert",icon:"💪"},{n:6,title:"Elite",icon:"🏆"},
  {n:7,title:"Legende",icon:"👑"},
];
const lvlInfo = (n) => LEVELS[Math.min(n-1,LEVELS.length-1)];

// ── DESIGN ────────────────────────────────────────────────────────
const G = {
  bg:"#07080e", bg2:"#0d0e18", bg3:"#141520", card:"#10111d",
  border:"rgba(255,255,255,0.07)", borderH:"rgba(255,255,255,0.13)",
  accent:"#7c6fff", aS:"rgba(124,111,255,0.13)",
  green:"#36d98a",  gS:"rgba(54,217,138,0.11)",
  gold:"#f5c33a",   goS:"rgba(245,195,58,0.11)",
  rose:"#ff5f7e",   rS:"rgba(255,95,126,0.09)",
  orange:"#ff9640", blue:"#5ab4ff",
  text:"#e6e4f8", muted:"#4e4d65", mutedL:"#7a7994",
  r:"18px", rs:"11px",
  font:"'DM Sans', system-ui, sans-serif",
  serif:"'Fraunces', Georgia, serif",
};

// ── API HELPER – works from file:// via Claude.ai proxy ──────────
// When running as a local HTML file, direct fetch to api.anthropic.com
// may be blocked. We catch network errors and show a friendly message.
const callClaude = async (system, userMsg, maxTokens=800) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=>"");
    throw new Error("HTTP " + res.status + (txt ? ": " + txt.slice(0,120) : ""));
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.content?.[0]?.text || "";
};

const callClaudeJSON = async (system, userMsg, maxTokens=1200) => {
  const text = await callClaude(system, userMsg, maxTokens);
  const clean = text.replace(/^```[\w]*\n?/gm,"").replace(/^```$/gm,"").trim();
  return JSON.parse(clean);
};

// ── SHARED UI ─────────────────────────────────────────────────────
const Card = ({children, style, onClick, glow, glass}) => (
  <div
    onClick={onClick}
    className={onClick ? "card-hover" : ""}
    style={{
      background: glass ? "rgba(16,17,29,.75)" : G.card,
      border: `1px solid ${glow ? glow+"44" : G.border}`,
      borderRadius: G.r, padding:"18px",
      boxShadow: glow ? `0 0 28px ${glow}18, 0 4px 16px rgba(0,0,0,.28)` : "0 2px 14px rgba(0,0,0,.22)",
      backdropFilter: glass ? "blur(18px)" : "none",
      cursor: onClick ? "pointer" : "default",
      transition: "all .22s cubic-bezier(.16,1,.3,1)",
      ...style
    }}
    onMouseEnter={e=>{if(onClick){e.currentTarget.style.borderColor=glow?glow+"66":G.borderH; e.currentTarget.style.boxShadow=glow?`0 0 36px ${glow}28,0 8px 28px rgba(0,0,0,.3)`:"0 8px 28px rgba(0,0,0,.3)";}}}
    onMouseLeave={e=>{if(onClick){e.currentTarget.style.borderColor=glow?glow+"44":G.border; e.currentTarget.style.boxShadow=glow?`0 0 28px ${glow}18,0 4px 16px rgba(0,0,0,.28)`:"0 2px 14px rgba(0,0,0,.22)";}}}
  >{children}</div>
);

const Btn = ({children, onClick, color=G.accent, soft, small, full, style, disabled, loading}) => (
  <button
    onClick={onClick} disabled={disabled||loading}
    className="btn-press"
    style={{
      background: soft ? `${color}1a` : `linear-gradient(135deg,${color} 0%,${color}cc 100%)`,
      color: soft ? color : "#fff",
      border: `1px solid ${soft ? color+"44" : "transparent"}`,
      borderRadius:"50px",
      padding: small ? "6px 16px" : "11px 24px",
      fontSize: small ? ".78rem" : ".88rem",
      fontWeight:600, fontFamily:G.font,
      cursor: disabled||loading ? "not-allowed" : "pointer",
      opacity: disabled ? .4 : 1,
      width: full ? "100%" : undefined,
      boxShadow: !soft&&!disabled ? `0 4px 16px ${color}2e` : "none",
      transition:"all .18s cubic-bezier(.16,1,.3,1)",
      ...style
    }}
    onMouseEnter={e=>{if(!disabled&&!loading){e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow=!soft?`0 8px 24px ${color}40`:"none";}}}
    onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=!soft&&!(disabled)?`0 4px 16px ${color}2e`:"none";}}
  >
    {loading ? <span className="spin" style={{display:"inline-block",fontSize:"1rem"}}>⚙</span> : children}
  </button>
);

const Lbl = ({children, color=G.accent}) => (
  <span style={{display:"inline-block",padding:"3px 12px",borderRadius:"50px",background:`${color}18`,border:`1px solid ${color}33`,color,fontSize:".67rem",fontWeight:700,letterSpacing:".1em",textTransform:"uppercase"}}>{children}</span>
);

const Inp = ({value, onChange, placeholder, type="text", style}) => (
  <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} type={type}
    style={{background:G.bg3,border:`1px solid ${G.border}`,borderRadius:G.rs,padding:"10px 14px",color:G.text,fontSize:".88rem",width:"100%",outline:"none",transition:"border-color .2s, box-shadow .2s",fontFamily:G.font,...style}}
    onFocus={e=>{e.target.style.borderColor=G.accent;e.target.style.boxShadow=`0 0 0 3px ${G.accent}18`;}}
    onBlur={e=>{e.target.style.borderColor=G.border;e.target.style.boxShadow="none";}}
  />
);

const SecHead = ({children, action}) => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
    <div style={{fontSize:".67rem",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:G.mutedL}}>{children}</div>
    {action}
  </div>
);

const RPEBtn = ({val, sel, onClick}) => {
  const c = val<=3?G.green:val<=6?G.gold:G.rose;
  return <button onClick={()=>onClick(val)} style={{width:32,height:32,borderRadius:"50%",border:`2px solid ${sel?c:G.border}`,background:sel?`${c}1e`:"transparent",color:sel?c:G.mutedL,fontSize:".76rem",fontWeight:700,cursor:"pointer",transition:"all .15s",fontFamily:G.font,boxShadow:sel?`0 0 10px ${c}44`:"none"}}>{val}</button>;
};

const Stars = ({val, onChange, size="1.3rem"}) => (
  <div style={{display:"flex",gap:4}}>
    {[1,2,3,4,5].map(i=>(
      <span key={i} onClick={()=>onChange&&onChange(i)} style={{fontSize:size,cursor:onChange?"pointer":"default",opacity:i<=val?1:.2,transition:"all .15s cubic-bezier(.16,1,.3,1)",transform:i<=val?"scale(1.1)":"scale(1)"}}>⭐</span>
    ))}
  </div>
);

const ProgressBar = ({pct, color, height=7, animated=true}) => (
  <div style={{height,background:G.bg3,borderRadius:height/2,overflow:"hidden"}}>
    <div style={{width:`${pct}%`,height:"100%",borderRadius:height/2,background:`linear-gradient(90deg,${color},${color}cc)`,transition:animated?"width .7s cubic-bezier(.16,1,.3,1)":"none",boxShadow:`0 0 8px ${color}44`}}/>
  </div>
);

// ── XP TOAST ─────────────────────────────────────────────────────
function XPToast({amount, onDone}) {
  useEffect(()=>{const t=setTimeout(onDone,1600);return()=>clearTimeout(t);},[]);
  return (
    <div className="xpfly" style={{position:"fixed",top:"32%",left:"50%",zIndex:9999,pointerEvents:"none",background:`linear-gradient(135deg,rgba(245,195,58,.18),rgba(255,150,64,.12))`,border:`1px solid ${G.gold}55`,borderRadius:"50px",padding:"10px 26px",color:G.gold,fontWeight:700,fontSize:"1.1rem",whiteSpace:"nowrap",backdropFilter:"blur(12px)",boxShadow:`0 0 32px ${G.gold}44`}}>
      +{amount} XP ⚡
    </div>
  );
}

// ── TABS ─────────────────────────────────────────────────────────
const TABS = [
  {id:"home",   label:"Home",     icon:"⚡"},
  {id:"training",label:"Training",icon:"💪"},
  {id:"leben",  label:"Leben",    icon:"🌿"},
  {id:"ich",    label:"Ich",      icon:"✨"},
];

// ══════════════════════════════════════════════════════════════════
// HOME
// ══════════════════════════════════════════════════════════════════
function Home({state, addXP, nav}) {
  const {habits,sleep,workouts,xpLog,checkins,school} = state;
  const t = today();
  const todayCI  = checkins.find(c=>c.date===t);
  const [mood,   setMood]    = useState(todayCI?.mood||0);
  const [note,   setNote]    = useState("");
  const [reply,  setReply]   = useState(todayCI?.reply||null);
  const [ciDone, setCiDone]  = useState(!!todayCI);
  const [ciLoad, setCiLoad]  = useState(false);
  const [ciErr,  setCiErr]   = useState(null);

  const xp   = totalXP(xpLog);
  const lv   = lvlOf(xp);
  const info = lvlInfo(lv);
  const doneH = habits.filter(h=>h.log?.[t]).length;
  const lastS = [...sleep].sort((a,b)=>b.date.localeCompare(a.date))[0];
  const mthW  = workouts.filter(w=>w.date.startsWith(t.slice(0,7))).length;
  const openT = (school.tasks??[]).filter(t2=>!t2.done).length;

  const greeting = () => {const h=new Date().getHours();return h<12?"Guten Morgen":h<17?"Hey":"Guten Abend";};

  const doCheckin = async () => {
    if(!mood) return;
    setCiLoad(true); setCiErr(null);
    try {
      const sys = "Du bist ein motivierender Coach für El, 14 Jahre. Antworte auf seinen täglichen Check-in mit 2-3 Sätzen. Sei direkt, motivierend, nie übertrieben. Kein Markdown. Deutsch.";
      const msg = "Stimmung heute: " + mood + "/5 Sterne." + (note ? " Notiz: " + note : "") + ". Kurzes Feedback für den Tag.";
      const r = await callClaude(sys, msg, 150);
      setReply(r); setCiDone(true);
      addXP(XP.checkin, "checkin_"+t);
      state.setCheckins(prev=>[...prev.filter(c=>c.date!==t),{date:t,mood,note,reply:r}]);
    } catch(e) {
      // Graceful fallback – still save checkin without AI reply
      setCiErr("KI offline – Check-in wird trotzdem gespeichert!");
      setCiDone(true);
      addXP(XP.checkin, "checkin_"+t);
      state.setCheckins(prev=>[...prev.filter(c=>c.date!==t),{date:t,mood,note,reply:null}]);
    }
    setCiLoad(false);
  };

  return (
    <div>
      {/* Hero */}
      <div className="fu" style={{padding:"32px 0 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:".78rem",color:G.mutedL,marginBottom:5,fontWeight:500}}>{greeting()},</div>
          <h1 style={{fontFamily:G.serif,fontSize:"2.6rem",fontWeight:700,letterSpacing:"-.03em",lineHeight:1}}>
            El <span style={{color:G.accent,fontStyle:"italic"}}>✦</span>
          </h1>
          <div style={{fontSize:".75rem",color:G.muted,marginTop:6}}>{new Date().toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long"})}</div>
        </div>
        <div style={{textAlign:"center",cursor:"pointer"}} className="float" onClick={()=>nav("ich")}>
          <div style={{fontSize:"2.4rem",marginBottom:2}}>{info.icon}</div>
          <div style={{fontSize:".58rem",color:G.gold,fontWeight:700,background:G.goS,padding:"2px 8px",borderRadius:"50px"}}>LVL {lv}</div>
        </div>
      </div>

      {/* XP bar */}
      <Card className="fu1" glow={G.gold} style={{marginBottom:12,padding:"14px 16px",background:`linear-gradient(135deg,${G.card},rgba(245,195,58,.04))`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontWeight:600,fontSize:".85rem"}}>{info.title}</div>
          <div style={{fontFamily:G.serif,fontSize:"1.3rem",fontWeight:700,color:G.gold}}>{xp} XP</div>
        </div>
        <ProgressBar pct={xpPct(xp)} color={G.gold} />
        <div style={{fontSize:".63rem",color:G.muted,marginTop:4}}>{xpInLvl(xp)} / {XP_PER} XP bis Level {lv+1}</div>
      </Card>

      {/* Quick stats */}
      <div className="fu2" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
        {[
          {l:"Habits",  v:`${doneH}/${habits.length}`, c:G.green,  i:"✅", tab:"leben"},
          {l:"Schlaf",  v:lastS?`${lastS.hours}h`:"—", c:G.accent, i:"🌙", tab:"leben"},
          {l:"Sport",   v:mthW,                         c:G.gold,   i:"💪", tab:"training"},
          {l:"Aufgaben",v:openT,                         c:openT>0?G.rose:G.green, i:"📚", tab:"leben"},
        ].map((s,i)=>(
          <Card key={i} onClick={()=>nav(s.tab)} style={{padding:"11px 6px",textAlign:"center"}}>
            <div style={{fontSize:"1.2rem",marginBottom:4}}>{s.i}</div>
            <div style={{fontFamily:G.serif,fontSize:"1.35rem",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:".56rem",color:G.muted,marginTop:3,fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>{s.l}</div>
          </Card>
        ))}
      </div>

      {/* Daily check-in */}
      <Card className="fu3" glow={ciDone?G.green:G.accent} style={{marginBottom:12}}>
        <SecHead>{ciDone?"✅ Heutiger Check-in":"⚡ Daily Check-in"}</SecHead>
        {!ciDone ? (
          <>
            <div style={{fontSize:".82rem",color:G.mutedL,marginBottom:12}}>Wie läuft der Tag? (+{XP.checkin} XP)</div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:".68rem",color:G.muted,marginBottom:7,fontWeight:600}}>Stimmung</div>
              <Stars val={mood} onChange={setMood}/>
            </div>
            <Inp value={note} onChange={setNote} placeholder="Optional: Was beschäftigt dich?" style={{marginBottom:12}}/>
            {ciErr && <div style={{fontSize:".75rem",color:G.gold,marginBottom:10,padding:"8px 12px",background:G.goS,borderRadius:G.rs}}>{ciErr}</div>}
            <Btn onClick={doCheckin} color={G.accent} disabled={!mood} loading={ciLoad} full>Check-in abschicken</Btn>
          </>
        ) : (
          <>
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:reply?12:0}}>
              <Stars val={todayCI?.mood||mood} size="1.05rem"/>
              {todayCI?.note && <div style={{fontSize:".76rem",color:G.mutedL,fontStyle:"italic"}}>"{todayCI.note}"</div>}
            </div>
            {reply && <div style={{fontSize:".83rem",lineHeight:1.72,color:G.text,background:G.bg3,borderRadius:G.rs,padding:"12px 14px",borderLeft:`3px solid ${G.accent}`}}>{reply}</div>}
          </>
        )}
      </Card>

      {/* Habit week strip */}
      <Card className="fu4">
        <SecHead>Diese Woche</SecHead>
        <div style={{display:"flex",gap:5}}>
          {last7().map(d=>{
            const pct=habits.length?habits.filter(h=>h.log?.[d]).length/habits.length:0;
            const isT=d===t;
            return (
              <div key={d} style={{flex:1,textAlign:"center"}}>
                <div style={{height:38,borderRadius:10,marginBottom:4,background:pct===0?G.bg3:`rgba(54,217,138,${.1+pct*.7})`,border:`1.5px solid ${isT?G.green+"77":pct>0?G.green+"33":G.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:".62rem",fontWeight:700,color:pct>.5?G.green:G.muted,boxShadow:pct>.7?`0 0 8px ${G.green}22`:isT?`0 0 6px ${G.accent}33`:"none",transition:"all .3s ease"}}>
                  {pct>0?`${Math.round(pct*100)}%`:""}
                </div>
                <div style={{fontSize:".56rem",color:isT?G.accent:G.muted,fontWeight:isT?700:400}}>{dname(d)}</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TRAINING
// ══════════════════════════════════════════════════════════════════
function Training({workouts, setWorkouts, matches, setMatches, addXP}) {
  const [sub, setSub] = useState("workout");
  return (
    <div>
      <div className="fu" style={{padding:"28px 0 20px"}}>
        <Lbl color={G.gold}>Training</Lbl>
        <h2 style={{fontFamily:G.serif,fontSize:"2rem",fontWeight:700,marginTop:10,letterSpacing:"-.02em"}}>Sport & Matches</h2>
      </div>
      <div className="fu1" style={{display:"flex",gap:8,marginBottom:18}}>
        {[{id:"workout",l:"💪 Workouts"},{id:"football",l:"⚽ Fußball"}].map(s=>(
          <button key={s.id} onClick={()=>setSub(s.id)} style={{flex:1,padding:"10px",borderRadius:G.rs,border:`1.5px solid ${sub===s.id?G.gold+"66":G.border}`,background:sub===s.id?G.goS:"transparent",color:sub===s.id?G.gold:G.mutedL,fontWeight:600,fontSize:".85rem",cursor:"pointer",transition:"all .2s",fontFamily:G.font}}>
            {s.l}
          </button>
        ))}
      </div>
      {sub==="workout" ? <WorkoutLog workouts={workouts} setWorkouts={setWorkouts} addXP={addXP}/> : <FootballLog matches={matches} setMatches={setMatches} addXP={addXP}/>}
    </div>
  );
}

function WorkoutLog({workouts, setWorkouts, addXP}) {
  const [date,setDate]=useState(today()); const [type,setType]=useState("Fußball");
  const [dur,setDur]=useState(""); const [rpe,setRpe]=useState(0);
  const [note,setNote]=useState(""); const [saved,setSaved]=useState(false);
  const TYPES=["Fußball","Laufen","Radfahren","Krafttraining","Schwimmen","Gehen","Anderes"];
  const ICONS={"Fußball":"⚽","Laufen":"🏃","Radfahren":"🚴","Krafttraining":"🏋️","Schwimmen":"🏊","Gehen":"🚶","Anderes":"💪"};
  const rc=r=>r<=3?G.green:r<=6?G.gold:G.rose;
  const rl=r=>r<=3?"Locker":r<=5?"Moderat":r<=7?"Hart":"Sehr hart";
  const bonus=r=>r>=8?10:r>=6?5:0;

  const add=()=>{
    if(!dur||!rpe)return;
    const earned=XP.workout+bonus(rpe);
    const e={id:Date.now(),date,type,duration:Number(dur),rpe,note,xpEarned:earned};
    setWorkouts(p=>[e,...p]); addXP(earned,"wo_"+e.id);
    setSaved(true); setTimeout(()=>setSaved(false),2000); setDur(""); setRpe(0); setNote("");
  };

  const month=workouts.filter(w=>w.date.startsWith(today().slice(0,7)));

  return (
    <div>
      {month.length>0&&(
        <Card className="fu" style={{marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,textAlign:"center"}}>
            {[{l:"Workouts",v:month.length,c:G.gold},{l:"Minuten",v:month.reduce((s,w)=>s+w.duration,0),c:G.accent},{l:"XP/Monat",v:month.reduce((s,w)=>s+(w.xpEarned||20),0),c:G.green}].map((s,i)=>(
              <div key={i}><div style={{fontFamily:G.serif,fontSize:"1.7rem",fontWeight:700,color:s.c}}>{s.v}</div><div style={{fontSize:".62rem",color:G.mutedL,marginTop:2,textTransform:"uppercase",letterSpacing:".06em",fontWeight:600}}>{s.l}</div></div>
            ))}
          </div>
        </Card>
      )}
      <Card className="fu1" style={{marginBottom:12}}>
        <SecHead>Eintragen</SecHead>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
          {TYPES.map(t2=><button key={t2} onClick={()=>setType(t2)} style={{padding:"5px 10px",borderRadius:"50px",fontSize:".73rem",fontWeight:600,cursor:"pointer",border:`1px solid ${type===t2?G.gold:G.border}`,background:type===t2?G.goS:"transparent",color:type===t2?G.gold:G.mutedL,fontFamily:G.font,transition:"all .15s"}}>{ICONS[t2]} {t2}</button>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div><div style={{fontSize:".66rem",color:G.muted,marginBottom:4,fontWeight:600}}>Datum</div><Inp type="date" value={date} onChange={setDate}/></div>
          <div><div style={{fontSize:".66rem",color:G.muted,marginBottom:4,fontWeight:600}}>Dauer (Min)</div><Inp type="number" value={dur} onChange={setDur} placeholder="90"/></div>
        </div>
        <div style={{marginBottom:8}}>
          <div style={{fontSize:".66rem",color:G.muted,marginBottom:5,fontWeight:600}}>RPE {rpe>0&&<span style={{color:rc(rpe)}}>– {rl(rpe)}{bonus(rpe)>0?" (+"+bonus(rpe)+" Bonus XP)":""}</span>}</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{[1,2,3,4,5,6,7,8,9,10].map(v=><RPEBtn key={v} val={v} sel={rpe===v} onClick={setRpe}/>)}</div>
        </div>
        <Inp value={note} onChange={setNote} placeholder="Notiz..." style={{marginBottom:10}}/>
        <Btn onClick={add} color={G.gold} disabled={!dur||!rpe} full>{saved?"✓ Gespeichert!":"Speichern (+"+(XP.workout+bonus(rpe))+" XP)"}</Btn>
      </Card>
      {workouts.length>0&&(
        <Card className="fu2">
          <SecHead>Verlauf</SecHead>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {workouts.slice(0,6).map(w=>(
              <div key={w.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:G.bg3,borderRadius:G.rs,transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background=G.bg2} onMouseLeave={e=>e.currentTarget.style.background=G.bg3}>
                <span style={{fontSize:"1.1rem"}}>{ICONS[w.type]||"💪"}</span>
                <div style={{flex:1}}><div style={{fontWeight:600,fontSize:".82rem"}}>{w.type}</div><div style={{fontSize:".67rem",color:G.muted}}>{dfmt(w.date)} · {w.duration} Min</div></div>
                <div style={{textAlign:"right"}}><div style={{fontSize:".8rem",fontWeight:700,color:rc(w.rpe)}}>RPE {w.rpe}</div><div style={{fontSize:".6rem",color:G.gold}}>+{w.xpEarned||20} XP</div></div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function FootballLog({matches, setMatches, addXP}) {
  const [date,setDate]=useState(today()); const [opp,setOpp]=useState("");
  const [dur,setDur]=useState("90"); const [goals,setGoals]=useState(""); const [assists,setAssists]=useState("");
  const [pos,setPos]=useState("Mittelfeld"); const [rpe,setRpe]=useState(0); const [rating,setRating]=useState(0);
  const [scoreUs,setScoreUs]=useState(""); const [scoreThem,setScoreThem]=useState("");
  const [note,setNote]=useState(""); const [saved,setSaved]=useState(false);
  const POSITIONS=["Sturm","Rechts Außen","Links Außen","Mittelfeld","Defensive","Abwehr","Tor"];
  const rc=r=>r<=3?G.green:r<=6?G.gold:G.rose;

  const add=()=>{
    if(!opp.trim()||!rpe)return;
    const e={id:Date.now(),date,opponent:opp.trim(),duration:Number(dur)||90,goals:Number(goals)||0,assists:Number(assists)||0,position:pos,rpe,rating,note,scoreUs:scoreUs||"?",scoreThem:scoreThem||"?"};
    setMatches(p=>[e,...p]); addXP(XP.match,"match_"+e.id);
    setSaved(true); setTimeout(()=>setSaved(false),2000);
    setOpp(""); setGoals(""); setAssists(""); setRpe(0); setRating(0); setNote(""); setScoreUs(""); setScoreThem("");
  };

  const tG=matches.reduce((s,m)=>s+m.goals,0);
  const tA=matches.reduce((s,m)=>s+m.assists,0);
  const avgR=matches.length?(matches.reduce((s,m)=>s+m.rpe,0)/matches.length).toFixed(1):0;

  return (
    <div>
      {matches.length>0&&(
        <Card className="fu" style={{marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,textAlign:"center"}}>
            {[{l:"Spiele",v:matches.length,c:G.accent},{l:"Tore",v:tG,c:G.gold},{l:"Assists",v:tA,c:G.green},{l:"Ø RPE",v:avgR,c:G.rose}].map((s,i)=>(
              <div key={i} style={{padding:"10px 4px",background:G.bg3,borderRadius:G.rs}}>
                <div style={{fontFamily:G.serif,fontSize:"1.5rem",fontWeight:700,color:s.c}}>{s.v}</div>
                <div style={{fontSize:".58rem",color:G.mutedL,marginTop:2,textTransform:"uppercase",letterSpacing:".06em",fontWeight:600}}>{s.l}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card className="fu1" style={{marginBottom:12}}>
        <SecHead>Spiel eintragen (+{XP.match} XP)</SecHead>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div><div style={{fontSize:".66rem",color:G.muted,marginBottom:4,fontWeight:600}}>Datum</div><Inp type="date" value={date} onChange={setDate}/></div>
          <div><div style={{fontSize:".66rem",color:G.muted,marginBottom:4,fontWeight:600}}>Gegner</div><Inp value={opp} onChange={setOpp} placeholder="FC Muster"/></div>
        </div>
        <div style={{display:"flex",alignItems:"flex-end",gap:8,marginBottom:8}}>
          <div style={{flex:1}}><div style={{fontSize:".66rem",color:G.muted,marginBottom:4,fontWeight:600}}>Wir</div><Inp type="number" value={scoreUs} onChange={setScoreUs} placeholder="2"/></div>
          <div style={{fontSize:"1.4rem",color:G.muted,paddingBottom:6,fontFamily:G.serif}}>:</div>
          <div style={{flex:1}}><div style={{fontSize:".66rem",color:G.muted,marginBottom:4,fontWeight:600}}>Gegner</div><Inp type="number" value={scoreThem} onChange={setScoreThem} placeholder="1"/></div>
          <div style={{flex:1}}><div style={{fontSize:".66rem",color:G.muted,marginBottom:4,fontWeight:600}}>Dauer</div><Inp type="number" value={dur} onChange={setDur} placeholder="90"/></div>
        </div>
        <div style={{marginBottom:8}}>
          <div style={{fontSize:".66rem",color:G.muted,marginBottom:5,fontWeight:600}}>Position</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{POSITIONS.map(p=><button key={p} onClick={()=>setPos(p)} style={{padding:"4px 10px",borderRadius:"50px",fontSize:".72rem",fontWeight:600,cursor:"pointer",border:`1px solid ${pos===p?G.accent:G.border}`,background:pos===p?G.aS:"transparent",color:pos===p?G.accent:G.mutedL,fontFamily:G.font,transition:"all .15s"}}>{p}</button>)}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div><div style={{fontSize:".66rem",color:G.muted,marginBottom:4,fontWeight:600}}>⚽ Tore</div><Inp type="number" value={goals} onChange={setGoals} placeholder="0"/></div>
          <div><div style={{fontSize:".66rem",color:G.muted,marginBottom:4,fontWeight:600}}>🎯 Assists</div><Inp type="number" value={assists} onChange={setAssists} placeholder="0"/></div>
        </div>
        <div style={{marginBottom:8}}>
          <div style={{fontSize:".66rem",color:G.muted,marginBottom:5,fontWeight:600}}>RPE</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{[1,2,3,4,5,6,7,8,9,10].map(v=><RPEBtn key={v} val={v} sel={rpe===v} onClick={setRpe}/>)}</div>
        </div>
        <div style={{marginBottom:8}}><div style={{fontSize:".66rem",color:G.muted,marginBottom:5,fontWeight:600}}>Meine Leistung</div><Stars val={rating} onChange={setRating}/></div>
        <Inp value={note} onChange={setNote} placeholder="Notiz zum Spiel..." style={{marginBottom:10}}/>
        <Btn onClick={add} color={G.accent} disabled={!opp.trim()||!rpe} full>{saved?"✓ Gespeichert!":"Spiel speichern"}</Btn>
      </Card>
      {matches.length>0&&(
        <Card className="fu2">
          <SecHead>Spiel-Verlauf</SecHead>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {matches.slice(0,6).map(m=>{
              const won=Number(m.scoreUs)>Number(m.scoreThem);
              const draw=String(m.scoreUs)===String(m.scoreThem);
              const col=won?G.green:draw?G.gold:G.rose;
              return (
                <div key={m.id} style={{padding:"11px 14px",background:G.bg3,borderRadius:G.rs,borderLeft:`3px solid ${col}`,transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background=G.bg2} onMouseLeave={e=>e.currentTarget.style.background=G.bg3}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <div style={{fontWeight:600,fontSize:".85rem"}}>vs. {m.opponent}</div>
                    <div style={{fontFamily:G.serif,fontSize:"1.15rem",fontWeight:700,color:col}}>{m.scoreUs}:{m.scoreThem}</div>
                  </div>
                  <div style={{display:"flex",gap:12,fontSize:".7rem",color:G.muted,flexWrap:"wrap"}}>
                    <span>{dfmt(m.date)}</span><span>{m.position}</span>
                    {m.goals>0&&<span style={{color:G.gold}}>⚽ {m.goals}</span>}
                    {m.assists>0&&<span style={{color:G.green}}>🎯 {m.assists}</span>}
                    <span style={{color:rc(m.rpe)}}>RPE {m.rpe}</span>
                    {m.rating>0&&<Stars val={m.rating} size=".82rem"/>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// LEBEN
// ══════════════════════════════════════════════════════════════════
function Leben({habits, setHabits, sleep, setSleep, school, setSchool, addXP}) {
  const [sub, setSub] = useState("habits");
  return (
    <div>
      <div className="fu" style={{padding:"28px 0 20px"}}>
        <Lbl color={G.green}>Leben</Lbl>
        <h2 style={{fontFamily:G.serif,fontSize:"2rem",fontWeight:700,marginTop:10,letterSpacing:"-.02em"}}>Routinen & Ziele</h2>
      </div>
      <div className="fu1" style={{display:"flex",gap:5,marginBottom:18,overflowX:"auto",paddingBottom:2}}>
        {[{id:"habits",l:"✅ Habits"},{id:"sleep",l:"🌙 Schlaf"},{id:"school",l:"📚 Schule"},{id:"lernplan",l:"🎯 Lernplan"}].map(s=>(
          <button key={s.id} onClick={()=>setSub(s.id)} style={{flexShrink:0,padding:"9px 14px",borderRadius:G.rs,border:`1.5px solid ${sub===s.id?G.green+"55":G.border}`,background:sub===s.id?G.gS:"transparent",color:sub===s.id?G.green:G.mutedL,fontWeight:600,fontSize:".78rem",cursor:"pointer",transition:"all .2s",fontFamily:G.font,whiteSpace:"nowrap"}}>
            {s.l}
          </button>
        ))}
      </div>
      {sub==="habits"   && <HabitSection habits={habits} setHabits={setHabits} addXP={addXP}/>}
      {sub==="sleep"    && <SleepSection sleep={sleep} setSleep={setSleep} addXP={addXP}/>}
      {sub==="school"   && <SchoolSection school={school} setSchool={setSchool} addXP={addXP}/>}
      {sub==="lernplan" && <LernplanSection school={school}/>}
    </div>
  );
}

function HabitSection({habits, setHabits, addXP}) {
  const [newName,setNewName]=useState(""); const [newEmoji,setNewEmoji]=useState("⭐"); const [adding,setAdding]=useState(false);
  const t=today(); const w7=last7();
  const EMOJIS=["⭐","💧","🏃","📖","🧘","💊","🎸","🌿","⚽","🧠","😴","✏️","🥤","🚿","📵"];

  const toggle=(id)=>{
    const h=habits.find(x=>x.id===id); const wasDone=!!h?.log?.[t];
    setHabits(p=>p.map(x=>{if(x.id!==id)return x;const log={...x.log};if(log[t])delete log[t];else log[t]=true;return{...x,log};}));
    if(!wasDone) addXP(XP.habit,"habit_"+id+"_"+t);
  };
  const streak=h=>{let s=0;for(let i=0;i<200;i++){const k=new Date(Date.now()-i*86400000).toISOString().slice(0,10);if(h.log?.[k])s++;else break;}return s;};
  const doneT=habits.filter(h=>h.log?.[t]).length;
  const addH=()=>{if(!newName.trim())return;setHabits(p=>[...p,{id:Date.now(),name:newName.trim(),emoji:newEmoji,log:{}}]);setNewName("");setNewEmoji("⭐");setAdding(false);};

  return (
    <div>
      {habits.length>0&&(
        <div className="fu" style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:".7rem",color:G.muted,marginBottom:5}}>
            <span>{doneT}/{habits.length} heute</span>
            {doneT===habits.length&&habits.length>0&&<span style={{color:G.gold}} className="checkpop">🔥 Perfekter Tag!</span>}
          </div>
          <ProgressBar pct={habits.length?(doneT/habits.length)*100:0} color={G.green}/>
        </div>
      )}
      <div className="fu1" style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
        {habits.length===0&&<Card style={{textAlign:"center",padding:"28px"}}><div style={{fontSize:"2rem",marginBottom:8}}>✅</div><div style={{color:G.mutedL,fontSize:".85rem"}}>Noch keine Habits!</div></Card>}
        {habits.map(h=>{
          const done=!!h.log?.[t]; const s=streak(h);
          return (
            <Card key={h.id} style={{display:"flex",alignItems:"center",gap:11,padding:"11px 14px",borderColor:done?G.green+"33":G.border}}>
              <button onClick={()=>toggle(h.id)} style={{width:38,height:38,borderRadius:"50%",border:`2px solid ${done?G.green:G.border}`,background:done?G.gS:"transparent",fontSize:"1rem",cursor:"pointer",transition:"all .22s cubic-bezier(.16,1,.3,1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:done?`0 0 12px ${G.green}33`:"none"}} className={done?"checkpop":""}>
                {done?"✓":h.emoji}
              </button>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:".88rem",textDecoration:done?"line-through":"none",color:done?G.muted:G.text,transition:"all .2s"}}>{h.name}</div>
                {s>0&&<div style={{fontSize:".67rem",color:G.gold,marginTop:2}}>🔥 {s}d{s>=7?" ×2":s>=3?" ×1.5":""}</div>}
              </div>
              <div style={{display:"flex",gap:3}}>
                {w7.map(d=><div key={d} style={{width:7,height:7,borderRadius:"50%",background:h.log?.[d]?G.green:G.bg3,border:`1px solid ${h.log?.[d]?G.green+"55":G.border}`,transition:"all .2s",boxShadow:h.log?.[d]?`0 0 4px ${G.green}55`:""}}/>)}
              </div>
              <button onClick={()=>setHabits(p=>p.filter(x=>x.id!==h.id))} style={{background:"none",border:"none",color:G.muted,cursor:"pointer",fontSize:"1rem",padding:4,transition:"color .15s"}} onMouseEnter={e=>e.currentTarget.style.color=G.rose} onMouseLeave={e=>e.currentTarget.style.color=G.muted}>×</button>
            </Card>
          );
        })}
      </div>
      {adding?(
        <Card className="fu">
          <div style={{fontWeight:600,fontSize:".9rem",marginBottom:10}}>Neuer Habit</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
            {EMOJIS.map(e=><button key={e} onClick={()=>setNewEmoji(e)} style={{width:32,height:32,borderRadius:8,border:`2px solid ${newEmoji===e?G.accent:G.border}`,background:newEmoji===e?G.aS:"transparent",fontSize:".95rem",cursor:"pointer",transition:"all .15s"}}>{e}</button>)}
          </div>
          <Inp value={newName} onChange={setNewName} placeholder="Habit Name" style={{marginBottom:10}}/>
          <div style={{display:"flex",gap:8}}><Btn onClick={addH} color={G.green} disabled={!newName.trim()}>Hinzufügen</Btn><Btn onClick={()=>setAdding(false)} soft color={G.muted}>Abbrechen</Btn></div>
        </Card>
      ):<Btn onClick={()=>setAdding(true)} color={G.green} full>+ Neuer Habit</Btn>}
    </div>
  );
}

function SleepSection({sleep, setSleep, addXP}) {
  const [date,setDate]=useState(today()); const [bed,setBed]=useState("22:00"); const [wake,setWake]=useState("06:15");
  const [qual,setQual]=useState(3); const [note,setNote]=useState(""); const [saved,setSaved]=useState(false);
  const [importing,setImporting]=useState(false); const [impStatus,setImpStatus]=useState(null);
  const zipRef=useRef();

  const hrs=()=>{const[bh,bm]=bed.split(":").map(Number);const[wh,wm]=wake.split(":").map(Number);let m=(wh*60+wm)-(bh*60+bm);if(m<0)m+=1440;return Math.round(m/6)/10;};
  const bc=h=>h>=8?G.green:h>=6?G.gold:G.rose;
  const h=hrs();

  const addEntry=()=>{
    if(!h)return;
    const e={id:Date.now(),date,bedtime:bed,waketime:wake,hours:h,quality:qual,note};
    setSleep(p=>[...p.filter(s=>s.date!==date),e].sort((a,b)=>b.date.localeCompare(a.date)));
    addXP(XP.sleep,"sleep_"+date);
    setSaved(true); setTimeout(()=>setSaved(false),2000); setNote("");
  };

  const handleZip=async(e)=>{
    const file=e.target.files[0]; if(!file)return;
    setImporting(true); setImpStatus(null);
    try {
      if(!window.JSZip){
        await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});
      }
      const zip=await window.JSZip.loadAsync(file);
      const xmlFile=zip.file("apple_health_export/Export.xml");
      if(!xmlFile)throw new Error("Export.xml nicht gefunden");
      const xml=await xmlFile.async("string");
      const doc=new DOMParser().parseFromString(xml,"text/xml");
      const byNight={};
      doc.querySelectorAll("Record").forEach(r=>{
        if(!r.getAttribute("type")?.includes("SleepAnalysis"))return;
        if(!r.getAttribute("value")?.includes("Asleep"))return;
        try{
          const s=new Date(r.getAttribute("startDate")),en=new Date(r.getAttribute("endDate"));
          const h2=(en-s)/3600000; if(h2<=0||h2>14)return;
          const night=en.toISOString().slice(0,10);
          byNight[night]=(byNight[night]||0)+h2;
        }catch{}
      });
      const imported=Object.entries(byNight).filter(([,h2])=>h2>=1).map(([d2,tot])=>({id:Date.now()+Math.random(),date:d2,hours:Math.round(tot*10)/10,quality:tot>=8?5:tot>=7?4:3,bedtime:"—",waketime:"—",note:"Apple Health",fromHealth:true})).sort((a,b)=>b.date.localeCompare(a.date));
      if(!imported.length)throw new Error("Keine Schlafdaten gefunden");
      setSleep(p=>{const ex=new Set(p.map(s=>s.date));const nw=imported.filter(e=>!ex.has(e.date));nw.forEach(e=>addXP(XP.sleep,"sleep_"+e.date));return[...p,...nw].sort((a,b)=>b.date.localeCompare(a.date));});
      setImpStatus({ok:true,msg:imported.length+" Nächte importiert ✓"});
    }catch(err){setImpStatus({ok:false,msg:err.message});}
    setImporting(false); e.target.value="";
  };

  const avg=sleep.length?(sleep.reduce((s,e)=>s+e.hours,0)/sleep.length).toFixed(1):0;

  return (
    <div>
      <Card className="fu" style={{marginBottom:12,borderColor:G.accent+"33",background:`linear-gradient(135deg,${G.card},${G.aS})`}}>
        <SecHead>🍎 Apple Health Import</SecHead>
        {impStatus&&<div style={{padding:"9px 12px",borderRadius:G.rs,marginBottom:10,background:impStatus.ok?G.gS:G.rS,border:`1px solid ${impStatus.ok?G.green+"44":G.rose+"44"}`,fontSize:".78rem",color:impStatus.ok?G.green:G.rose}}>{impStatus.msg}</div>}
        <input ref={zipRef} type="file" accept=".zip" onChange={handleZip} style={{display:"none"}}/>
        <Btn onClick={()=>zipRef.current.click()} color={G.accent} loading={importing} full>📂 export.zip hochladen</Btn>
      </Card>
      {sleep.length>0&&(
        <Card className="fu1" style={{marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,textAlign:"center",marginBottom:14}}>
            {[{l:"Ø Schlaf",v:avg+"h",c:Number(avg)>=8?G.green:G.gold},{l:"Einträge",v:sleep.length,c:G.accent},{l:"8h+ Nächte",v:sleep.filter(s=>s.hours>=8).length,c:G.gold}].map((s,i)=>(
              <div key={i}><div style={{fontFamily:G.serif,fontSize:"1.7rem",fontWeight:700,color:s.c}}>{s.v}</div><div style={{fontSize:".62rem",color:G.mutedL,marginTop:2,textTransform:"uppercase",letterSpacing:".06em",fontWeight:600}}>{s.l}</div></div>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:3,height:60}}>
            {[...sleep].reverse().slice(-14).map((e,i)=>(
              <div key={i} style={{flex:1,height:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end"}} title={e.date+": "+e.hours+"h"}>
                <div style={{width:"100%",borderRadius:"3px 3px 0 0",minHeight:3,background:bc(e.hours),height:(e.hours/12)*100+"%",opacity:e.fromHealth?.6:.85,transition:"height .4s ease",boxShadow:`0 0 6px ${bc(e.hours)}44`}}/>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card className="fu2">
        <SecHead>Manuell eintragen</SecHead>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
          <div><div style={{fontSize:".66rem",color:G.muted,marginBottom:4,fontWeight:600}}>Datum</div><Inp type="date" value={date} onChange={setDate}/></div>
          <div><div style={{fontSize:".66rem",color:G.muted,marginBottom:4,fontWeight:600}}>🌙 Ein</div><Inp type="time" value={bed} onChange={setBed}/></div>
          <div><div style={{fontSize:".66rem",color:G.muted,marginBottom:4,fontWeight:600}}>☀️ Auf</div><Inp type="time" value={wake} onChange={setWake}/></div>
        </div>
        <div style={{background:G.bg3,borderRadius:G.rs,padding:"9px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:".82rem",color:G.muted}}>Schlafdauer</span>
          <span style={{fontFamily:G.serif,fontSize:"1.4rem",fontWeight:700,color:bc(h),transition:"color .3s"}}>{h}h</span>
        </div>
        <div style={{marginBottom:8}}><div style={{fontSize:".66rem",color:G.muted,marginBottom:5,fontWeight:600}}>Qualität</div><Stars val={qual} onChange={setQual}/></div>
        <Inp value={note} onChange={setNote} placeholder="Notiz..." style={{marginBottom:10}}/>
        <Btn onClick={addEntry} color={G.accent} disabled={!h} full>{saved?"✓ +"+XP.sleep+" XP!":"Speichern (+"+XP.sleep+" XP)"}</Btn>
      </Card>
    </div>
  );
}

function SchoolSection({school, setSchool, addXP}) {
  const [sN,setSN]=useState(""); const [cG,setCG]=useState(""); const [gG,setGG]=useState("");
  const [tN,setTN]=useState(""); const [tS,setTS]=useState(""); const [tD,setTD]=useState("");
  const [addS,setAddS]=useState(false); const [addT,setAddT]=useState(false);
  const subjects=school.subjects??[]; const tasks=school.tasks??[];

  const addSubj=()=>{
    if(!sN.trim())return;
    setSchool(p=>({...p,subjects:[...(p.subjects??[]),{id:Date.now(),name:sN.trim(),current:cG,goal:gG}]}));
    setSN(""); setCG(""); setGG(""); setAddS(false);
  };
  const addTask=()=>{
    if(!tN.trim())return;
    setSchool(p=>({...p,tasks:[...(p.tasks??[]),{id:Date.now(),name:tN.trim(),subject:tS,deadline:tD,done:false}]}));
    setTN(""); setTS(""); setTD(""); setAddT(false);
  };
  const toggleTask=(id)=>{
    const task=tasks.find(t=>t.id===id);
    if(!task?.done) addXP(XP.task,"task_"+id);
    setSchool(p=>({...p,tasks:p.tasks.map(t=>t.id===id?{...t,done:!t.done}:t)}));
  };
  const gc=(g,goal)=>!g||!goal?G.mutedL:Number(g)<=Number(goal)?G.green:Number(g)-Number(goal)<=1?G.gold:G.rose;
  const open=tasks.filter(t=>!t.done); const done=tasks.filter(t=>t.done);

  return (
    <div>
      <Card className="fu" style={{marginBottom:12}}>
        <SecHead action={<Btn onClick={()=>setAddS(!addS)} soft small color={G.rose}>+ Fach</Btn>}>Fächer</SecHead>
        {subjects.length===0&&<div style={{color:G.muted,fontSize:".82rem",textAlign:"center",padding:"10px 0"}}>Noch keine Fächer</div>}
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {subjects.map(s=>(
            <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:G.bg3,borderRadius:G.rs}}>
              <div style={{flex:1,fontWeight:600,fontSize:".85rem"}}>{s.name}</div>
              {s.current&&s.goal&&<div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:".75rem",color:G.muted}}>Note {s.current}</span><span style={{color:G.muted}}>→</span><span style={{fontSize:".75rem",fontWeight:700,color:gc(s.current,s.goal)}}>Ziel {s.goal}</span></div>}
              <button onClick={()=>setSchool(p=>({...p,subjects:p.subjects.filter(x=>x.id!==s.id)}))} style={{background:"none",border:"none",color:G.muted,cursor:"pointer",transition:"color .15s"}} onMouseEnter={e=>e.currentTarget.style.color=G.rose} onMouseLeave={e=>e.currentTarget.style.color=G.muted}>×</button>
            </div>
          ))}
        </div>
        {addS&&(
          <div style={{marginTop:10,padding:12,background:G.bg3,borderRadius:G.rs}}>
            <Inp value={sN} onChange={setSN} placeholder="Fach" style={{marginBottom:7}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:8}}><Inp value={cG} onChange={setCG} placeholder="Aktuelle Note"/><Inp value={gG} onChange={setGG} placeholder="Ziel-Note"/></div>
            <div style={{display:"flex",gap:7}}><Btn onClick={addSubj} color={G.rose} small disabled={!sN.trim()}>Hinzufügen</Btn><Btn onClick={()=>setAddS(false)} soft small color={G.muted}>Abbrechen</Btn></div>
          </div>
        )}
      </Card>
      <Card className="fu1">
        <SecHead action={<Btn onClick={()=>setAddT(!addT)} soft small color={G.rose}>+ Aufgabe</Btn>}>Aufgaben · +{XP.task} XP</SecHead>
        {addT&&(
          <div style={{marginBottom:10,padding:12,background:G.bg3,borderRadius:G.rs}}>
            <Inp value={tN} onChange={setTN} placeholder="Aufgabe" style={{marginBottom:7}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:8}}><Inp value={tS} onChange={setTS} placeholder="Fach"/><Inp type="date" value={tD} onChange={setTD}/></div>
            <div style={{display:"flex",gap:7}}><Btn onClick={addTask} color={G.rose} small disabled={!tN.trim()}>Hinzufügen</Btn><Btn onClick={()=>setAddT(false)} soft small color={G.muted}>Abbrechen</Btn></div>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {open.length===0&&done.length===0&&<div style={{color:G.muted,fontSize:".82rem",textAlign:"center",padding:"14px 0"}}>Keine Aufgaben 🎉</div>}
          {open.map(t=>(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:G.bg3,borderRadius:G.rs}}>
              <button onClick={()=>toggleTask(t.id)} style={{width:22,height:22,borderRadius:4,border:`2px solid ${G.rose}`,background:"transparent",cursor:"pointer",flexShrink:0,transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.background=G.rS;}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:500,fontSize:".83rem"}}>{t.name}</div>
                <div style={{fontSize:".67rem",color:G.muted}}>{t.subject&&t.subject+" · "}{t.deadline&&<span style={{color:new Date(t.deadline+"T12:00:00")<new Date()?G.rose:G.muted}}>📅 {dfmt(t.deadline)}</span>}</div>
              </div>
              <div style={{fontSize:".64rem",color:G.gold,fontWeight:600}}>+{XP.task} XP</div>
              <button onClick={()=>setSchool(p=>({...p,tasks:p.tasks.filter(x=>x.id!==t.id)}))} style={{background:"none",border:"none",color:G.muted,cursor:"pointer",transition:"color .15s"}} onMouseEnter={e=>e.currentTarget.style.color=G.rose} onMouseLeave={e=>e.currentTarget.style.color=G.muted}>×</button>
            </div>
          ))}
          {done.length>0&&(
            <>
              <div style={{fontSize:".6rem",color:G.muted,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",marginTop:4}}>Erledigt ✓</div>
              {done.slice(0,3).map(t=>(
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 12px",background:G.bg3,borderRadius:G.rs,opacity:.45}}>
                  <button onClick={()=>toggleTask(t.id)} style={{width:22,height:22,borderRadius:4,border:`2px solid ${G.green}`,background:G.gS,cursor:"pointer",flexShrink:0,color:G.green,fontSize:".75rem"}}>✓</button>
                  <div style={{flex:1,fontWeight:500,fontSize:".82rem",textDecoration:"line-through",color:G.muted}}>{t.name}</div>
                  <button onClick={()=>setSchool(p=>({...p,tasks:p.tasks.filter(x=>x.id!==t.id)}))} style={{background:"none",border:"none",color:G.muted,cursor:"pointer"}}>×</button>
                </div>
              ))}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── LERNPLAN ─────────────────────────────────────────────────────
function LernplanSection({school}) {
  const [subject,  setSubject]  = useState("");
  const [examDate, setExamDate] = useState("");
  const [level,    setLevel]    = useState("mittel");
  const [hpd,      setHpd]      = useState("1");
  const [weak,     setWeak]     = useState("");
  const [plan,     setPlan]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const subjects = (school.subjects??[]).map(s=>s.name);
  const du = daysUntil(examDate);

  const generate = async () => {
    if(!subject||!examDate) return;
    setLoading(true); setPlan(null); setError(null);

    // Build system prompt without template literals to avoid Babel issues
    const sys = [
      "Du bist ein Lerncoach für El, 14 Jahre, Gymnasium.",
      "Erstelle einen konkreten Lernplan.",
      "Antworte NUR mit validem JSON, kein Markdown, keine Erklärung.",
      "Format: {",
      '  "overview": "1-2 Sätze",',
      '  "days": [{"day":1,"date":"YYYY-MM-DD","topic":"Thema","tasks":["Aufgabe"],"duration":60}],',
      '  "tips": ["Tipp1","Tipp2","Tipp3"]',
      "}",
      "Maximal " + (du||14) + " Tage, je " + hpd + "h/Tag. Sehr konkrete Lernaufgaben auf Deutsch."
    ].join(" ");

    const msg = [
      "Fach: " + subject + ".",
      "Prüfung: " + examDate + " (" + du + " Tage).",
      "Niveau: " + level + ".",
      "Schwache Themen: " + (weak||"nicht angegeben") + ".",
      hpd + "h pro Tag.",
      "Erstelle Lernplan als JSON."
    ].join(" ");

    try {
      const result = await callClaudeJSON(sys, msg, 1400);
      setPlan(result);
    } catch(err) {
      setError("Fehler: " + err.message + ". Tipp: App muss in einem Browser mit Internetzugang geöffnet sein (nicht direkt als Datei).");
    }
    setLoading(false);
  };

  const dayColors = [G.accent, G.green, G.gold, G.rose, G.orange, G.blue];
  const dc = i => dayColors[i%dayColors.length];

  return (
    <div>
      <Card className="fu" style={{marginBottom:14}}>
        <SecHead>🎯 Prüfungsdetails</SecHead>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:".68rem",color:G.muted,marginBottom:5,fontWeight:600}}>Fach</div>
          {subjects.length>0&&(
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:7}}>
              {subjects.map(s=><button key={s} onClick={()=>setSubject(s)} style={{padding:"5px 12px",borderRadius:"50px",fontSize:".78rem",fontWeight:600,cursor:"pointer",border:`1px solid ${subject===s?G.accent:G.border}`,background:subject===s?G.aS:"transparent",color:subject===s?G.accent:G.mutedL,fontFamily:G.font,transition:"all .15s"}}>{s}</button>)}
            </div>
          )}
          <Inp value={subject} onChange={setSubject} placeholder="Fach eingeben (z.B. Mathematik)"/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          <div>
            <div style={{fontSize:".68rem",color:G.muted,marginBottom:4,fontWeight:600}}>📅 Prüfungsdatum</div>
            <Inp type="date" value={examDate} onChange={setExamDate}/>
            {du!==null&&<div style={{fontSize:".68rem",color:du<4?G.rose:du<8?G.gold:G.green,marginTop:4,fontWeight:600}}>{du===0?"⚠️ Heute!":du+" Tage verbleibend"}</div>}
          </div>
          <div>
            <div style={{fontSize:".68rem",color:G.muted,marginBottom:4,fontWeight:600}}>⏰ Stunden / Tag</div>
            <div style={{display:"flex",gap:4}}>
              {["0.5","1","1.5","2","3"].map(h=><button key={h} onClick={()=>setHpd(h)} style={{flex:1,padding:"9px 2px",borderRadius:G.rs,fontSize:".74rem",fontWeight:700,cursor:"pointer",border:`1px solid ${hpd===h?G.gold:G.border}`,background:hpd===h?G.goS:"transparent",color:hpd===h?G.gold:G.mutedL,fontFamily:G.font,transition:"all .15s"}}>{h}h</button>)}
            </div>
          </div>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:".68rem",color:G.muted,marginBottom:5,fontWeight:600}}>📊 Aktueller Stand</div>
          <div style={{display:"flex",gap:6}}>
            {[{id:"leicht",l:"Gut ✅"},{id:"mittel",l:"Okay 🤔"},{id:"schwer",l:"Schwach 😰"}].map(l=><button key={l.id} onClick={()=>setLevel(l.id)} style={{flex:1,padding:"8px 4px",borderRadius:G.rs,fontSize:".76rem",fontWeight:600,cursor:"pointer",border:`1px solid ${level===l.id?G.accent:G.border}`,background:level===l.id?G.aS:"transparent",color:level===l.id?G.accent:G.mutedL,fontFamily:G.font,transition:"all .15s"}}>{l.l}</button>)}
          </div>
        </div>
        <Inp value={weak} onChange={setWeak} placeholder="Schwache Themen (optional, z.B. Bruchrechnung)" style={{marginBottom:12}}/>
        <Btn onClick={generate} color={G.accent} disabled={!subject||!examDate} loading={loading} full>✨ KI-Lernplan erstellen</Btn>
      </Card>

      {error&&(
        <Card style={{borderColor:G.rose+"44",background:G.rS,marginBottom:14}}>
          <div style={{color:G.rose,fontSize:".82rem",lineHeight:1.6}}>{error}</div>
        </Card>
      )}

      {loading&&(
        <Card glass style={{textAlign:"center",padding:"28px",marginBottom:14}}>
          <div style={{fontSize:"2.2rem",marginBottom:10}} className="float">🧠</div>
          <div style={{color:G.mutedL,fontSize:".85rem",marginBottom:4}}>Claude erstellt deinen Lernplan...</div>
          <div style={{fontSize:".72rem",color:G.muted}}>{du} Tage bis zur Prüfung</div>
        </Card>
      )}

      {plan&&!loading&&(
        <div>
          <Card glow={G.accent} style={{marginBottom:14,background:`linear-gradient(135deg,${G.card},${G.aS})`}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <span style={{fontSize:"1.6rem"}} className="float">📋</span>
              <div>
                <div style={{fontWeight:700,fontSize:"1rem"}}>{subject} – Lernplan</div>
                <div style={{fontSize:".72rem",color:G.muted}}>bis {dfmt(examDate)} · {hpd}h/Tag</div>
              </div>
            </div>
            <div style={{fontSize:".85rem",lineHeight:1.7,color:G.mutedL,padding:"10px 12px",background:G.bg3,borderRadius:G.rs}}>{plan.overview}</div>
          </Card>

          {(plan.days||[]).map((d,i)=>(
            <div key={i} className="planin" style={{animationDelay:(i*0.06)+"s",marginBottom:10}}>
              <Card glass style={{borderLeft:"3px solid "+dc(i),padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:28,height:28,borderRadius:"50%",background:dc(i)+"1e",border:"1.5px solid "+dc(i)+"55",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".75rem",fontWeight:700,color:dc(i)}}>{d.day}</div>
                    <div>
                      <div style={{fontWeight:700,fontSize:".88rem"}}>{d.topic}</div>
                      {d.date&&<div style={{fontSize:".65rem",color:G.muted}}>{dfmt(d.date)}</div>}
                    </div>
                  </div>
                  {d.duration&&<div style={{fontSize:".75rem",fontWeight:600,color:G.gold,background:G.goS,padding:"3px 10px",borderRadius:"50px"}}>⏱ {d.duration}min</div>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {(d.tasks||[]).map((task,j)=>(
                    <div key={j} style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:".8rem",color:G.mutedL}}>
                      <span style={{color:dc(i),marginTop:1,flexShrink:0}}>→</span>
                      <span>{task}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          ))}

          {plan.tips&&plan.tips.length>0&&(
            <Card glow={G.green} style={{marginTop:4,marginBottom:12}}>
              <SecHead>💡 Lerntipps</SecHead>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {plan.tips.map((tip,i)=>(
                  <div key={i} style={{display:"flex",gap:10,fontSize:".83rem",color:G.mutedL,padding:"8px 10px",background:G.bg3,borderRadius:G.rs}}>
                    <span style={{color:G.green,flexShrink:0}}>✓</span><span>{tip}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Btn onClick={generate} soft small color={G.accent} loading={loading}>🔄 Neu generieren</Btn>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ICH
// ══════════════════════════════════════════════════════════════════
function Ich({state, addXP}) {
  const [sub, setSub] = useState("stats");
  return (
    <div>
      <div className="fu" style={{padding:"28px 0 20px"}}>
        <Lbl color={G.accent}>Ich</Lbl>
        <h2 style={{fontFamily:G.serif,fontSize:"2rem",fontWeight:700,marginTop:10,letterSpacing:"-.02em"}}>Profil & Wachstum</h2>
      </div>
      <div className="fu1" style={{display:"flex",gap:5,marginBottom:18,overflowX:"auto",paddingBottom:2}}>
        {[{id:"stats",l:"📊 Stats"},{id:"looks",l:"🪞 Looks"},{id:"glowup",l:"✨ Glow-up"},{id:"sync",l:"🔄 Sync"}].map(s=>(
          <button key={s.id} onClick={()=>setSub(s.id)} style={{flexShrink:0,padding:"9px 14px",borderRadius:G.rs,border:`1.5px solid ${sub===s.id?G.accent+"55":G.border}`,background:sub===s.id?G.aS:"transparent",color:sub===s.id?G.accent:G.mutedL,fontWeight:600,fontSize:".78rem",cursor:"pointer",transition:"all .2s",fontFamily:G.font,whiteSpace:"nowrap"}}>
            {s.l}
          </button>
        ))}
      </div>
      {sub==="stats"  && <StatsSection state={state}/>}
      {sub==="looks"  && <LooksSection/>}
      {sub==="glowup" && <GlowupSection glowups={state.glowups} setGlowups={state.setGlowups}/>}
      {sub==="sync"   && <SyncSection/>}
    </div>
  );
}

function StatsSection({state}) {
  const {habits,sleep,workouts,matches,xpLog} = state;
  const xp=totalXP(xpLog); const lv=lvlOf(xp); const info=lvlInfo(lv);
  const d30=lastN(30);
  const habitData=d30.map(d=>({d,pct:habits.length?habits.filter(h=>h.log?.[d]).length/habits.length:0}));
  const xpDays=lastN(14).map(d=>({d,xp:Object.entries(xpLog||{}).filter(([k])=>k.includes(d)).reduce((s,[,v])=>s+v,0)}));
  const maxXP=Math.max(...xpDays.map(x=>x.xp),1);
  const bc=h=>h>=8?G.green:h>=6?G.gold:G.rose;
  const curStreak=h=>{let s=0;for(let i=0;i<200;i++){const k=new Date(Date.now()-i*86400000).toISOString().slice(0,10);if(h.log?.[k])s++;else break;}return s;};
  const maxStreak=h=>{let max=0,cur=0;for(let i=89;i>=0;i--){const k=new Date(Date.now()-i*86400000).toISOString().slice(0,10);if(h.log?.[k]){cur++;max=Math.max(max,cur);}else cur=0;}return max;};

  const [showReview,setShowReview]=useState(false);
  const [revLoad,setRevLoad]=useState(false);
  const [revText,setRevText]=useState(null);
  const [revErr,setRevErr]=useState(null);
  const ws=wkStart(); const w7=last7();

  const genReview=async()=>{
    setRevLoad(true); setRevErr(null);
    const wH=habits.map(h=>h.name+":"+w7.filter(d=>h.log?.[d]).length+"/7").join(", ");
    const wS=sleep.filter(s=>s.date>=ws);
    const avgS=wS.length?(wS.reduce((s,e)=>s+e.hours,0)/wS.length).toFixed(1):null;
    const wW=workouts.filter(w=>w.date>=ws);
    const wM=matches.filter(m=>m.date>=ws);
    const wXP=Object.entries(xpLog||{}).filter(([k])=>w7.some(d=>k.includes(d))).reduce((s,[,v])=>s+v,0);
    const sys="Motivierender, ehrlicher Coach für El, 14 Jahre. Kurzer Wochenrückblick Deutsch: 1) Was gut lief 2) Konkret verbessern 3) Ziel nächste Woche 4) Motivationssatz. Max 160 Wörter. Kein Markdown.";
    const msg="Habits: "+wH+". Schlaf: "+(avgS?"Ø"+avgS+"h":"keine Daten")+". Sport: "+wW.length+"x"+( wM.length>0?", "+wM.length+" Fußballspiele":"")+". XP: "+wXP+".";
    try {
      const r=await callClaude(sys,msg,600);
      setRevText(r);
    } catch(e) { setRevErr("Fehler: "+e.message); }
    setRevLoad(false);
  };

  return (
    <div>
      <Card className="fu" glow={G.gold} style={{marginBottom:12,background:`linear-gradient(135deg,${G.card},rgba(245,195,58,.04))`}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <span style={{fontSize:"2.4rem"}} className="float">{info.icon}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:".65rem",fontWeight:700,color:G.gold,letterSpacing:".1em",textTransform:"uppercase"}}>Level {lv}</div>
            <div style={{fontFamily:G.serif,fontSize:"1.5rem",fontWeight:700}}>{info.title}</div>
            <div style={{fontSize:".7rem",color:G.muted,marginTop:1}}>{xpInLvl(xp)} / {XP_PER} XP</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:G.serif,fontSize:"1.8rem",fontWeight:700,color:G.gold}}>{xp}</div>
            <div style={{fontSize:".62rem",color:G.muted}}>Total XP</div>
          </div>
        </div>
        <ProgressBar pct={xpPct(xp)} color={G.gold} height={8}/>
        <div style={{display:"flex",gap:4,marginTop:12}}>
          {LEVELS.map(l=>(
            <div key={l.n} style={{flex:1,textAlign:"center"}}>
              <div style={{fontSize:".9rem",opacity:lv>=l.n?1:.2,filter:lv>=l.n?"none":"grayscale(1)",transition:"all .3s"}}>{l.icon}</div>
              <div style={{fontSize:".5rem",color:lv>=l.n?G.gold:G.muted,fontWeight:700,marginTop:1}}>Lv{l.n}</div>
            </div>
          ))}
        </div>
      </Card>

      {xpDays.some(x=>x.xp>0)&&(
        <Card className="fu1" style={{marginBottom:12}}>
          <SecHead>XP pro Tag (14 Tage)</SecHead>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:64}}>
            {xpDays.map(({d,xp:dx})=>(
              <div key={d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,height:"100%",justifyContent:"flex-end"}}>
                {dx>0&&<div style={{fontSize:".48rem",color:G.gold}}>{dx}</div>}
                <div style={{width:"100%",borderRadius:"3px 3px 0 0",minHeight:dx>0?4:2,background:dx>0?G.gold:G.bg3,height:(dx/maxXP)*100+"%",opacity:dx>0?.85:.3,boxShadow:dx>0?`0 0 6px ${G.gold}44`:"",transition:"height .5s cubic-bezier(.16,1,.3,1)"}}/>
                <div style={{fontSize:".48rem",color:G.muted}}>{dname(d)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="fu2" style={{marginBottom:12}}>
        <SecHead>Habit-Aktivität (30 Tage)</SecHead>
        <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
          {habitData.map(({d,pct})=>(
            <div key={d} title={dfmt(d)+": "+Math.round(pct*100)+"%"} style={{width:16,height:16,borderRadius:3,background:pct===0?G.bg3:`rgba(54,217,138,${.1+pct*.78})`,border:`1px solid ${pct>0?G.green+"33":G.border}`,transition:"transform .15s, box-shadow .15s",cursor:"default"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.5)";e.currentTarget.style.boxShadow=`0 0 8px ${G.green}44`;}}
              onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="none";}}
            />
          ))}
        </div>
        <div style={{display:"flex",gap:5,marginTop:8,alignItems:"center"}}>
          <span style={{fontSize:".62rem",color:G.muted}}>Wenig</span>
          {[.1,.3,.5,.7,.9].map(o=><div key={o} style={{width:11,height:11,borderRadius:2,background:`rgba(54,217,138,${o})`}}/>)}
          <span style={{fontSize:".62rem",color:G.muted}}>Viel</span>
        </div>
      </Card>

      {habits.length>0&&(
        <Card className="fu3" style={{marginBottom:12}}>
          <SecHead>Streaks</SecHead>
          {habits.map(h=>(
            <div key={h.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:G.bg3,borderRadius:G.rs,marginBottom:6,transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background=G.bg2} onMouseLeave={e=>e.currentTarget.style.background=G.bg3}>
              <span>{h.emoji}</span>
              <div style={{flex:1,fontSize:".83rem",fontWeight:500}}>{h.name}</div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:".75rem",fontWeight:700,color:curStreak(h)>0?G.gold:G.muted}}>🔥 {curStreak(h)}d</div>
                <div style={{fontSize:".6rem",color:G.muted}}>max {maxStreak(h)}d</div>
              </div>
            </div>
          ))}
        </Card>
      )}

      {sleep.length>0&&(
        <Card className="fu3" style={{marginBottom:12}}>
          <SecHead>Schlaf</SecHead>
          <div style={{display:"flex",gap:7,marginBottom:10}}>
            {[{l:"Ø",v:(sleep.reduce((s,e)=>s+e.hours,0)/sleep.length).toFixed(1)+"h",c:G.accent},{l:"Beste",v:Math.max(...sleep.map(s=>s.hours))+"h",c:G.green},{l:"8h+",v:sleep.filter(s=>s.hours>=8).length,c:G.gold}].map((s,i)=>(
              <div key={i} style={{flex:1,textAlign:"center",padding:"9px 6px",background:G.bg3,borderRadius:G.rs}}>
                <div style={{fontFamily:G.serif,fontSize:"1.3rem",fontWeight:700,color:s.c}}>{s.v}</div>
                <div style={{fontSize:".58rem",color:G.muted,marginTop:2,textTransform:"uppercase",letterSpacing:".06em",fontWeight:600}}>{s.l}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {matches.length>0&&(
        <Card className="fu4" style={{marginBottom:12}}>
          <SecHead>Fußball-Saison</SecHead>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,textAlign:"center"}}>
            {[
              {l:"Spiele",v:matches.length,c:G.accent},
              {l:"Tore",v:matches.reduce((s,m)=>s+m.goals,0),c:G.gold},
              {l:"Assists",v:matches.reduce((s,m)=>s+m.assists,0),c:G.green},
              {l:"W/D/L",v:matches.filter(m=>Number(m.scoreUs)>Number(m.scoreThem)).length+"/"+matches.filter(m=>String(m.scoreUs)===String(m.scoreThem)).length+"/"+matches.filter(m=>Number(m.scoreUs)<Number(m.scoreThem)).length,c:G.blue}
            ].map((s,i)=>(
              <div key={i} style={{padding:"9px 4px",background:G.bg3,borderRadius:G.rs}}>
                <div style={{fontFamily:G.serif,fontSize:"1.2rem",fontWeight:700,color:s.c}}>{s.v}</div>
                <div style={{fontSize:".56rem",color:G.muted,marginTop:2,textTransform:"uppercase",letterSpacing:".06em",fontWeight:600}}>{s.l}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="fu4">
        <SecHead>🧠 KI Wochenrückblick</SecHead>
        {!showReview&&<Btn onClick={()=>{setShowReview(true);genReview();}} color={G.accent} full>Rückblick generieren</Btn>}
        {showReview&&revLoad&&<div style={{textAlign:"center",padding:"20px"}}><div style={{fontSize:"1.8rem",marginBottom:8}} className="pulse">✨</div><div style={{color:G.mutedL,fontSize:".83rem"}}>Analysiere deine Woche...</div></div>}
        {showReview&&revErr&&<div style={{color:G.rose,fontSize:".82rem",padding:"10px",background:G.rS,borderRadius:G.rs}}>{revErr}</div>}
        {showReview&&revText&&(
          <div>
            <div style={{fontSize:".86rem",lineHeight:1.8,color:G.text,whiteSpace:"pre-wrap",background:G.bg3,borderRadius:G.rs,padding:"13px",marginBottom:10}}>{revText}</div>
            <Btn onClick={genReview} soft small color={G.accent} loading={revLoad}>🔄 Neu</Btn>
          </div>
        )}
      </Card>
    </div>
  );
}

function LooksSection() {
  const [img,setImg]=useState(null); const [b64,setB64]=useState(null); const [mt,setMt]=useState("image/jpeg");
  const [loading,setLoading]=useState(false); const [result,setResult]=useState(null); const [error,setError]=useState(null);
  const fileRef=useRef();

  const handleFile=e=>{
    const file=e.target.files[0]; if(!file)return;
    const finalMt=["image/jpeg","image/png","image/gif","image/webp"].includes(file.type)?file.type:"image/jpeg";
    setMt(finalMt);
    const reader=new FileReader();
    reader.onload=ev=>{setImg(ev.target.result);setB64(ev.target.result.split(",")[1]);setResult(null);setError(null);};
    reader.onerror=()=>setError("Fehler beim Laden.");
    reader.readAsDataURL(file);
  };

  const analyze=async()=>{
    if(!b64)return; setLoading(true); setResult(null); setError(null);
    try {
      const imgEl=new Image(); imgEl.src=img;
      await new Promise((res,rej)=>{imgEl.onload=res;imgEl.onerror=rej;});
      const MAX=1024; const scale=Math.min(1,MAX/Math.max(imgEl.width,imgEl.height));
      const w=Math.round(imgEl.width*scale); const h=Math.round(imgEl.height*scale);
      const canvas=document.createElement("canvas"); canvas.width=w; canvas.height=h;
      canvas.getContext("2d").drawImage(imgEl,0,0,w,h);
      const resized=canvas.toDataURL("image/jpeg",.85).split(",")[1];

      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:700,system:"Du bist ein ehrlicher Appearance-Coach für El, 14 Jahre. Analysiere Hautbild, Haare, allgemeines Erscheinungsbild. Ehrlich aber motivierend. 3 konkrete Verbesserungstipps. Deutsch. Max 220 Wörter. Kein Markdown.",messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:"image/jpeg",data:resized}},{type:"text",text:"Analysiere mein Erscheinungsbild."}]}]})});
      if(!res.ok)throw new Error("HTTP "+res.status+": "+(await res.text()).slice(0,120));
      const data=await res.json();
      if(data.error)throw new Error(data.error.message);
      setResult(data.content?.[0]?.text||"Keine Antwort");
    }catch(e){setError(e.message);}
    setLoading(false);
  };

  return (
    <div>
      <Card className="fu" style={{marginBottom:12}}>
        <div style={{background:G.aS,border:`1px solid ${G.accent}33`,borderRadius:G.rs,padding:"9px 13px",marginBottom:12,fontSize:".75rem",color:G.mutedL}}>🔒 Foto wird nicht gespeichert. Nur auf Desktop verfügbar (nicht als lokale Datei).</div>
        <div onClick={()=>!loading&&fileRef.current.click()} style={{border:`2px dashed ${img?G.accent+"55":G.border}`,borderRadius:G.r,padding:img?"12px":"28px 16px",textAlign:"center",cursor:loading?"wait":"pointer",background:img?G.aS:"transparent",transition:"all .2s",marginBottom:10,minHeight:100,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
          {img?<img src={img} alt="preview" style={{maxHeight:200,maxWidth:"100%",borderRadius:10,objectFit:"contain"}}/>:<><div style={{fontSize:"2rem",marginBottom:7}} className="float">🪞</div><div style={{fontWeight:600,marginBottom:3,fontSize:".9rem"}}>Foto auswählen</div><div style={{fontSize:".73rem",color:G.muted}}>JPG / PNG / WebP</div></>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={analyze} color={G.accent} disabled={!b64||loading} loading={loading} style={{flex:1}}>🔍 Feedback erhalten</Btn>
          {img&&<Btn onClick={()=>{setImg(null);setB64(null);setResult(null);setError(null);fileRef.current.value="";}} soft small color={G.muted}>Anderes</Btn>}
        </div>
      </Card>
      {error&&<Card style={{borderColor:G.rose+"44",background:G.rS,marginBottom:12}}><div style={{color:G.rose,fontSize:".83rem"}}>{error}</div></Card>}
      {result&&<Card className="fu" glow={G.accent}><div style={{fontWeight:700,marginBottom:10}}>✨ Feedback</div><div style={{fontSize:".86rem",lineHeight:1.78,whiteSpace:"pre-wrap",background:G.bg3,borderRadius:G.rs,padding:"13px"}}>{result}</div><div style={{marginTop:10}}><Btn onClick={analyze} soft small color={G.accent} loading={loading}>🔄 Nochmal</Btn></div></Card>}
    </div>
  );
}

function GlowupSection({glowups, setGlowups}) {
  const fileRef=useRef();
  const [note,setNote]=useState("");

  const handleFile=e=>{
    const file=e.target.files[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const entry={id:Date.now(),date:today(),dataUrl:ev.target.result,note:note.trim()};
      setGlowups(p=>[entry,...p]); setNote(""); e.target.value="";
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <Card className="fu" style={{marginBottom:12}}>
        <SecHead>✨ Foto hinzufügen</SecHead>
        <p style={{fontSize:".8rem",color:G.mutedL,marginBottom:12,lineHeight:1.6}}>Halte deinen Fortschritt fest. Fotos bleiben lokal auf diesem Gerät.</p>
        <Inp value={note} onChange={setNote} placeholder="Notiz – z.B. nach Haarschnitt" style={{marginBottom:10}}/>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/>
        <Btn onClick={()=>fileRef.current.click()} color={G.accent} full>📸 Foto auswählen</Btn>
      </Card>
      {glowups.length===0&&<Card style={{textAlign:"center",padding:"32px"}}><div style={{fontSize:"2.5rem",marginBottom:10}} className="float">✨</div><div style={{color:G.mutedL,fontSize:".85rem"}}>Noch keine Fotos. Fang heute an!</div></Card>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {glowups.map((g,i)=>(
          <Card key={g.id} className={i<2?"fu1":"fu2"} style={{padding:0,overflow:"hidden",position:"relative"}}>
            <img src={g.dataUrl} alt={g.date} style={{width:"100%",aspectRatio:"3/4",objectFit:"cover",display:"block"}}/>
            <div style={{padding:"10px 12px",background:G.card}}>
              <div style={{fontSize:".72rem",fontWeight:600,color:G.mutedL}}>{dfmt(g.date)}</div>
              {g.note&&<div style={{fontSize:".78rem",color:G.text,marginTop:2}}>{g.note}</div>}
            </div>
            <button onClick={()=>setGlowups(p=>p.filter(x=>x.id!==g.id))} style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,.65)",border:"none",color:"#fff",borderRadius:"50%",width:26,height:26,cursor:"pointer",fontSize:".85rem",display:"flex",alignItems:"center",justifyContent:"center",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,95,126,.8)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(0,0,0,.65)"}>×</button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SyncSection() {
  const [status, setStatus] = useState(null);
  const fileRef = useRef();
  const dataSize = KEYS.reduce((s,k)=>s+(localStorage.getItem(k)||"").length,0);

  const doExport=()=>{
    const data={_version:2,_exported:new Date().toISOString()};
    KEYS.forEach(k=>{try{const v=localStorage.getItem(k);if(v)data[k]=JSON.parse(v);}catch{}});
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download="el_app_"+today()+".json"; a.click();
    URL.revokeObjectURL(url);
    setStatus({ok:true,msg:"Export erfolgreich! Datei gespeichert."});
  };

  const doImport=e=>{
    const file=e.target.files[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try {
        const data=JSON.parse(ev.target.result);
        if(!data._version)throw new Error("Ungültige Datei");
        let count=0;
        KEYS.forEach(k=>{if(data[k]!==undefined){localStorage.setItem(k,JSON.stringify(data[k]));count++;}});
        setStatus({ok:true,msg:count+" Datensätze importiert! Seite wird neu geladen..."});
        setTimeout(()=>window.location.reload(),1800);
      }catch(err){setStatus({ok:false,msg:"Fehler: "+err.message});}
    };
    reader.readAsText(file); e.target.value="";
  };

  return (
    <div>
      <Card className="fu" style={{marginBottom:14}}>
        <div style={{fontSize:".78rem",color:G.mutedL,lineHeight:1.7,padding:"11px 13px",background:G.bg3,borderRadius:G.rs,borderLeft:`3px solid ${G.accent}`,marginBottom:14}}>
          Exportiere alle Daten als JSON → per AirDrop ans iPhone → im Browser öffnen → Importieren. Datengröße: <strong style={{color:G.text}}>{(dataSize/1024).toFixed(1)} KB</strong>
        </div>
        {status&&<div style={{padding:"10px 13px",borderRadius:G.rs,marginBottom:12,background:status.ok?G.gS:G.rS,border:`1px solid ${status.ok?G.green+"44":G.rose+"44"}`,fontSize:".8rem",color:status.ok?G.green:G.rose}}>{status.ok?"✓ ":"✗ "}{status.msg}</div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <Card onClick={doExport} glow={G.green} style={{textAlign:"center",padding:"20px 12px",cursor:"pointer"}}>
            <div style={{fontSize:"2rem",marginBottom:7}} className="float">📤</div>
            <div style={{fontWeight:700,fontSize:".88rem",marginBottom:3}}>Exportieren</div>
            <div style={{fontSize:".7rem",color:G.muted}}>JSON herunterladen</div>
          </Card>
          <Card onClick={()=>fileRef.current.click()} glow={G.accent} style={{textAlign:"center",padding:"20px 12px",cursor:"pointer"}}>
            <div style={{fontSize:"2rem",marginBottom:7}} className="float">📥</div>
            <div style={{fontWeight:700,fontSize:".88rem",marginBottom:3}}>Importieren</div>
            <div style={{fontSize:".7rem",color:G.muted}}>JSON laden</div>
          </Card>
        </div>
        <input ref={fileRef} type="file" accept=".json" onChange={doImport} style={{display:"none"}}/>
      </Card>
      <Card style={{borderColor:G.rose+"33",background:"rgba(255,95,126,.03)"}}>
        <SecHead>⚠️ Zurücksetzen</SecHead>
        <div style={{fontSize:".8rem",color:G.muted,marginBottom:12}}>Löscht alle App-Daten auf diesem Gerät unwiderruflich.</div>
        <Btn onClick={()=>{if(window.confirm("Wirklich alle Daten löschen?")){KEYS.forEach(k=>LS.del(k));window.location.reload();}}} color={G.rose} soft small>🗑 Alle Daten löschen</Btn>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// APP ROOT
// ══════════════════════════════════════════════════════════════════
function App() {
  const [tab,     setTab]    = useState("home");
  const [prevTab, setPrevTab]= useState("home");
  const [xpToast, setXPToast]= useState(null);

  const [habits,   setHabitsR]  = useState(()=>LS.get("el_habits",[]));
  const [sleep,    setSleepR]   = useState(()=>LS.get("el_sleep",[]));
  const [workouts, setWorkoutsR]= useState(()=>LS.get("el_workouts",[]));
  const [matches,  setMatchesR] = useState(()=>LS.get("el_matches",[]));
  const [school,   setSchoolR]  = useState(()=>LS.get("el_school",{subjects:[],tasks:[]}));
  const [xpLog,    setXPLogR]   = useState(()=>LS.get("el_xp",{}));
  const [checkins, setCheckinsR]= useState(()=>LS.get("el_checkins",[]));
  const [glowups,  setGlowupsR] = useState(()=>LS.get("el_glowups",[]));

  const mk = (key, setter) => useCallback((u)=>{setter(p=>{const n=typeof u==="function"?u(p):u;LS.set(key,n);return n;});},[]); // eslint-disable-line
  const setHabits  = mk("el_habits",  setHabitsR);
  const setSleep   = mk("el_sleep",   setSleepR);
  const setWorkouts= mk("el_workouts",setWorkoutsR);
  const setMatches = mk("el_matches", setMatchesR);
  const setSchool  = mk("el_school",  setSchoolR);
  const setCheckins= mk("el_checkins",setCheckinsR);
  const setGlowups = mk("el_glowups", setGlowupsR);

  const addXP = useCallback((amount,key)=>{
    setXPLogR(prev=>{
      if(prev[key])return prev;
      const next={...prev,[key]:amount};
      LS.set("el_xp",next); setXPToast(amount); return next;
    });
  },[]);

  const nav=(t)=>{setPrevTab(tab);setTab(t);};

  const tabIdx=TABS.findIndex(t=>t.id===tab);
  const prevIdx=TABS.findIndex(t=>t.id===prevTab);
  const pageClass=tabIdx>=prevIdx?"page-r":"page-l";

  const state={habits,sleep,workouts,matches,school,xpLog,checkins,glowups,setCheckins,setGlowups};

  return (
    <div style={{background:G.bg,minHeight:"100vh",color:G.text,fontFamily:G.font}}>
      {/* Background */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}>
        <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 140% 45% at 50% 0%,rgba(124,111,255,.08) 0%,transparent 60%)"}}/>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:"35%",background:"radial-gradient(ellipse 100% 80% at 50% 100%,rgba(54,217,138,.04) 0%,transparent 70%)"}}/>
        <div style={{position:"absolute",top:"25%",right:"-8%",width:280,height:280,background:"radial-gradient(circle,rgba(245,195,58,.04),transparent 70%)",borderRadius:"50%"}}/>
      </div>

      {xpToast&&<XPToast amount={xpToast} onDone={()=>setXPToast(null)}/>}

      <div style={{position:"relative",zIndex:1,maxWidth:480,margin:"0 auto",minHeight:"100vh",paddingBottom:76}}>
        <div style={{padding:"0 16px"}} key={tab} className={pageClass}>
          {tab==="home"     && <Home state={state} addXP={addXP} nav={nav}/>}
          {tab==="training" && <Training workouts={workouts} setWorkouts={setWorkouts} matches={matches} setMatches={setMatches} addXP={addXP}/>}
          {tab==="leben"    && <Leben habits={habits} setHabits={setHabits} sleep={sleep} setSleep={setSleep} school={school} setSchool={setSchool} addXP={addXP}/>}
          {tab==="ich"      && <Ich state={state} addXP={addXP}/>}
        </div>
      </div>

      {/* Bottom Nav */}
      <nav style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:"rgba(13,14,24,.94)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",borderTop:`1px solid ${G.border}`,padding:"8px 0 14px"}}>
        <div style={{maxWidth:480,margin:"0 auto",display:"flex",justifyContent:"space-around"}}>
          {TABS.map(t=>{
            const active=tab===t.id;
            return (
              <button key={t.id} onClick={()=>nav(t.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",padding:"4px 14px",transition:"all .2s cubic-bezier(.16,1,.3,1)",opacity:active?1:.35,transform:active?"translateY(-2px)":"none"}}>
                <div style={{width:44,height:32,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",background:active?G.aS:"transparent",border:active?`1px solid ${G.accent}33`:"1px solid transparent",transition:"all .25s cubic-bezier(.16,1,.3,1)",fontSize:"1.2rem",boxShadow:active?`0 0 12px ${G.accent}22`:"none"}}>{t.icon}</div>
                <span style={{fontSize:".54rem",fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",color:active?G.accent:G.mutedL,fontFamily:G.font,transition:"color .2s"}}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default App
