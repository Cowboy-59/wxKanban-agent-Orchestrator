// [SCOPE 084 / T008 · SCOPE 052/T012] Build the standalone, self-contained
// interactive Help page(s) from the localized catalog + guides + articles — the
// public/prospect-facing mirror of the in-app Help, per language.
//   npx tsx scripts/build-help-html.mts            # all 6 locales
//   npx tsx scripts/build-help-html.mts --locale fr-FR
// Writes public/help.html (en) + public/help.<xx>.html for each other locale.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getLocalizedHelp,
  HELP_UI,
  HELP_LOCALES,
  localeSuffix,
  type HelpLocale,
} from "../src/shared/help/i18n.js";

const CSS = `
  :root{--ground:#FBFAFC;--surface:#fff;--surface-2:#F4F2F9;--ink:#1E1A2E;--ink-soft:#423B57;--muted:#6B6580;--line:#E7E3F0;--accent:#6534D6;--accent-ink:#4B23A8;--accent-soft:#EDE9FC;--good:#0F8F63;--good-soft:#E2F4EC;--warn:#B4690E;--warn-soft:#FBF0E1;--shadow:0 1px 2px rgba(30,26,46,.06),0 8px 28px -18px rgba(101,52,214,.28);--mono:ui-monospace,"Cascadia Code",Consolas,monospace;--sans:system-ui,"Segoe UI",-apple-system,Roboto,sans-serif}
  @media(prefers-color-scheme:dark){:root{--ground:#141220;--surface:#1C1930;--surface-2:#23203A;--ink:#F1EEF8;--ink-soft:#CFC8E0;--muted:#948CAD;--line:#2C2843;--accent:#A98BF5;--accent-ink:#C4AEFB;--accent-soft:#26203D;--good:#46C596;--good-soft:#143028;--warn:#E0A052;--warn-soft:#2A2113;--shadow:0 1px 2px rgba(0,0,0,.4),0 10px 30px -18px rgba(0,0,0,.7)}}
  *{box-sizing:border-box}body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1040px;margin:0 auto;padding:0 24px 96px}
  header.mast{padding:48px 0 24px;border-bottom:1px solid var(--line);margin-bottom:24px}
  .brand{display:inline-flex;align-items:center;gap:10px;font-family:var(--mono);font-size:13px;letter-spacing:.04em;color:var(--accent-ink);text-transform:lowercase}
  .brand .dot{width:22px;height:22px;border-radius:6px;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:700;font-size:12px;font-family:var(--sans)}
  h1{font-size:clamp(28px,5vw,40px);letter-spacing:-.02em;font-weight:800;margin:16px 0 8px;text-wrap:balance}
  .lede{font-size:18px;color:var(--ink-soft);max-width:62ch;margin:0}
  .tiers{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:8px 0 18px}
  @media(min-width:640px){.tiers{grid-template-columns:repeat(4,1fr)}}
  .tier{text-align:left;border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:12px 14px;cursor:pointer;transition:border-color .15s,background .15s;font-family:inherit;color:inherit}
  .tier:hover{border-color:var(--accent)}
  .tier.active{border-color:var(--accent);background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--accent)}
  .tier .name{font-weight:650;font-size:14.5px}
  .tier .meta{font-size:12px;color:var(--muted)}
  .legend{display:flex;gap:16px;align-items:center;font-size:13px;color:var(--muted);margin:6px 0 22px}
  .dot2{width:10px;height:10px;border-radius:99px;display:inline-block;margin-right:5px;vertical-align:-1px}
  .cat{font-family:var(--mono);font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:26px 0 10px}
  .grid{display:grid;grid-template-columns:1fr;gap:12px}
  @media(min-width:680px){.grid{grid-template-columns:1fr 1fr}}
  @media(min-width:1000px){.grid{grid-template-columns:1fr 1fr 1fr}}
  .card{border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:15px 16px;display:flex;flex-direction:column;gap:8px;box-shadow:var(--shadow);cursor:pointer;transition:border-color .15s;text-align:left;font-family:inherit;color:inherit;width:100%}
  .card:hover{border-color:var(--accent)}
  .card.up{border-color:color-mix(in srgb,var(--warn) 40%,var(--line));background:var(--warn-soft)}
  .card .top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
  .card h4{margin:0;font-size:14.5px;font-weight:700;display:flex;align-items:center;gap:6px}
  .badge{flex:none;font-size:12px;font-weight:650;display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
  .badge.inc{color:var(--good)}.badge.up{color:var(--warn)}
  .adm{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:600}
  .desc{font-size:13.5px;color:var(--ink-soft);margin:0}
  .note{font-size:12.5px;font-weight:600;color:var(--accent-ink);margin:0}
  .howto{font-size:12.5px;color:var(--muted);margin:0}
  .howto b{color:var(--ink-soft)}
  .cue{margin-top:auto;padding-top:2px;font-size:12.5px;font-weight:650;color:var(--accent-ink)}
  /* detail view */
  .backbtn{border:none;background:none;color:var(--muted);font-family:inherit;font-size:14px;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:6px;margin-bottom:14px}
  .backbtn:hover{color:var(--accent-ink)}
  #detail h2{font-size:26px;font-weight:800;letter-spacing:-.01em;margin:6px 0 8px;display:flex;align-items:center;gap:8px}
  #detail .desc{font-size:16px;max-width:64ch}
  .avail{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:20px 0}
  .avail .cat{margin:0;padding:10px 16px;background:var(--surface-2)}
  .avail ul{list-style:none;margin:0;padding:0}
  .avail li{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;font-size:14px;border-top:1px solid var(--line)}
  .avail li .inc{color:var(--good);font-weight:650}.avail li .up{color:var(--warn);font-weight:650}
  .steps{list-style:none;margin:0 0 4px;padding:0;display:flex;flex-direction:column;gap:10px}
  .steps li{display:flex;gap:12px;align-items:flex-start}
  .steps .num{flex:none;width:24px;height:24px;border-radius:99px;background:var(--accent-soft);color:var(--accent-ink);font-weight:700;font-size:12px;display:grid;place-items:center;margin-top:1px}
  #detail .bullets{margin:0 0 6px;padding-left:20px;font-size:14px;color:var(--ink-soft)}
  #detail .bullets li{margin:4px 0}
  .ctrls{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:2px 0 6px}
  .ctrl{display:grid;grid-template-columns:1fr;gap:2px;padding:11px 16px;border-top:1px solid var(--line)}
  .ctrl:first-child{border-top:none}
  @media(min-width:640px){.ctrl{grid-template-columns:minmax(140px,210px) 1fr;gap:14px}}
  .clabel{font-size:14px;font-weight:650;color:var(--ink)}
  .cdoes{font-size:13.5px;color:var(--ink-soft)}
  .task{margin:0 0 14px}
  .ttitle{font-size:14px;font-weight:650;margin:0 0 6px}
  #detail h3.cat{margin-top:24px}
  footer{margin-top:56px;padding-top:20px;border-top:1px solid var(--line);font-size:13px;color:var(--muted);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
  footer a{color:var(--muted)}
  @media(prefers-reduced-motion:reduce){*{transition:none!important}}
`;

const RUNTIME = `
(function(){
  var D=window.__HELP__; var U=D.ui;
  var order={}; D.plans.forEach(function(p){order[p.id]=p.order});
  var sel=D.plans[0].id;
  function labelOf(id){var p=D.plans.find(function(x){return x.id===id});return p?p.label:id}
  function catLabel(c){return (D.categoryLabels&&D.categoryLabels[c])||c}
  function availAt(f,planId){
    if(order[planId]>=order[f.minPlan]) return {status:"inc",note:(f.planNotes||{})[planId]};
    return {status:"up",unlock:f.minPlan};
  }
  function esc(s){return String(s).replace(/[&<>]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c]})}
  function feat(id){return D.features.find(function(f){return f.id===id})}
  function renderTiers(){
    var el=document.getElementById("tiers");el.innerHTML="";
    D.plans.forEach(function(p){
      var b=document.createElement("button");
      b.className="tier"+(p.id===sel?" active":"");
      b.setAttribute("aria-pressed",p.id===sel);
      b.innerHTML='<div class="name">'+esc(p.label)+'</div><div class="meta">'+esc(p.price)+' · '+esc(p.userLimit)+'</div>';
      b.onclick=function(){sel=p.id;renderList()};
      el.appendChild(b);
    });
  }
  function renderCatalog(){
    var root=document.getElementById("catalog");root.innerHTML="";
    D.categories.forEach(function(cat){
      var items=D.features.filter(function(f){return f.category===cat});
      if(!items.length)return;
      var h=document.createElement("div");h.className="cat";h.textContent=catLabel(cat);root.appendChild(h);
      var g=document.createElement("div");g.className="grid";
      items.forEach(function(f){
        var a=availAt(f,sel);
        var card=document.createElement("button");card.className="card"+(a.status==="up"?" up":"");
        var badge=a.status==="inc"?'<span class="badge inc">✓ '+esc(U.included)+'</span>':'<span class="badge up">🔒 '+esc(labelOf(a.unlock))+'</span>';
        var adm=f.adminOnly?'<span class="adm">· '+esc(U.adminTag)+'</span>':'';
        var note=(a.status==="inc"&&a.note)?'<p class="note">'+esc(a.note)+'</p>':'';
        var unlock=(a.status==="up")?'<p class="note" style="color:var(--warn)">'+esc(U.availableFromPre)+'<b>'+esc(labelOf(a.unlock))+'</b>'+esc(U.availableFromPost)+'</p>':'';
        card.innerHTML='<div class="top"><h4>'+esc(f.title)+adm+'</h4>'+badge+'</div><p class="desc">'+esc(f.description)+'</p>'+note+unlock+'<span class="cue">'+esc(U.howToUseCue)+'</span>';
        card.onclick=function(){showDetail(f.id)};
        g.appendChild(card);
      });
      root.appendChild(g);
    });
  }
  function renderList(){renderTiers();renderCatalog()}
  function stepsList(steps){return '<ol class="steps">'+steps.map(function(s,i){return '<li><span class="num">'+(i+1)+'</span><span>'+esc(s)+'</span></li>'}).join("")+'</ol>'}
  function bulletList(items){return '<ul class="bullets">'+items.map(function(x){return '<li>'+esc(x)+'</li>'}).join("")+'</ul>'}
  function bodyHtml(f,id){
    var a=D.articles[id];
    var rich=a&&(a.overview||(a.whatYouSee&&a.whatYouSee.length)||(a.controls&&a.controls.length)||(a.tasks&&a.tasks.length));
    if(!rich){ return '<h3 class="cat">'+esc(U.howToUseHeading)+'</h3>'+stepsList(D.guides[id]||[f.howTo]); }
    var out="";
    if(a.overview) out+='<h3 class="cat">'+esc(U.overview)+'</h3><p class="desc">'+esc(a.overview)+'</p>';
    if(a.whatYouSee&&a.whatYouSee.length) out+='<h3 class="cat">'+esc(U.whatYoullSee)+'</h3>'+bulletList(a.whatYouSee);
    if(a.controls&&a.controls.length){
      out+='<h3 class="cat">'+esc(U.controlsOptions)+'</h3><div class="ctrls">'+a.controls.map(function(c){
        var adm=c.adminOnly?'<span class="adm"> · '+esc(U.adminTag)+'</span>':'';
        var pn=c.planNote?'<span style="color:var(--warn)"> · '+esc(c.planNote)+'</span>':'';
        return '<div class="ctrl"><div class="clabel">'+esc(c.label)+adm+'</div><div class="cdoes">'+esc(c.does)+pn+'</div></div>';
      }).join("")+'</div>';
    }
    if(a.tasks&&a.tasks.length) out+='<h3 class="cat">'+esc(U.commonTasks)+'</h3>'+a.tasks.map(function(t){return '<div class="task"><div class="ttitle">'+esc(t.title)+'</div>'+stepsList(t.steps)+'</div>'}).join("");
    if(a.tips&&a.tips.length) out+='<h3 class="cat">'+esc(U.tips)+'</h3>'+bulletList(a.tips);
    return out;
  }
  function showDetail(id){
    var f=feat(id); if(!f)return;
    var rows=D.plans.map(function(p){
      var a=availAt(f,p.id);
      var right=a.status==="inc"?'<span class="inc">✓ '+esc(U.included)+(a.note?' · '+esc(a.note):'')+'</span>':'<span class="up">🔒 '+esc(U.notIncluded)+'</span>';
      return '<li><span>'+esc(p.label)+'</span>'+right+'</li>';
    }).join("");
    var adm=f.adminOnly?' <span class="adm">· '+esc(U.adminTag)+'</span>':'';
    var d=document.getElementById("detail");
    d.innerHTML='<button class="backbtn" type="button">'+esc(U.backAllHelp)+'</button>'+
      '<div class="cat" style="color:var(--accent-ink)">'+esc(catLabel(f.category))+'</div>'+
      '<h2>'+esc(f.title)+adm+'</h2><p class="desc">'+esc(f.description)+'</p>'+
      '<div class="avail"><div class="cat">'+esc(U.availabilityByPlan)+'</div><ul>'+rows+'</ul></div>'+
      bodyHtml(f,id);
    d.querySelector(".backbtn").onclick=hideDetail;
    document.getElementById("main").style.display="none";
    d.style.display="block";
    window.scrollTo(0,0);
  }
  function hideDetail(){
    document.getElementById("detail").style.display="none";
    document.getElementById("main").style.display="block";
    window.scrollTo(0,0);
  }
  renderList();
})();
`;

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function buildHtml(locale: HelpLocale): string {
  const L = getLocalizedHelp(locale);
  const U = HELP_UI[locale];
  const categoryLabels: Record<string, string> = {};
  L.categories.forEach((c) => (categoryLabels[c] = L.categoryLabel(c)));
  const DATA = {
    plans: L.plans,
    categories: L.categories,
    categoryLabels,
    features: L.features,
    guides: L.guides,
    articles: L.articles,
    ui: U,
  };
  return `<!doctype html>
<html lang="${U.htmlLang}" translate="no" class="notranslate">
<head>
<meta charset="utf-8"/>
<!-- Per-locale page authored in ${U.htmlLang}; block Chrome/Edge machine-translation
     (it would otherwise re-translate the page to the browser UI language). -->
<meta name="google" content="notranslate"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="description" content="${esc(U.lede)}"/>
<title>${esc(U.pageTitle)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="mast">
    <span class="brand"><span class="dot">wx</span>wxKanban</span>
    <h1>${esc(U.h1)}</h1>
    <p class="lede">${esc(U.lede)}</p>
  </header>
  <div id="main">
    <div class="tiers" id="tiers"></div>
    <div class="legend">
      <span><span class="dot2" style="background:var(--good)"></span>${esc(U.legendIncluded)}</span>
      <span><span class="dot2" style="background:var(--warn)"></span>${esc(U.legendUpgrade)}</span>
    </div>
    <div id="catalog"></div>
  </div>
  <div id="detail" style="display:none"></div>
  <footer><span>${esc(U.footer)}</span><span><a href="https://www.wxperts.com">www.wxperts.com</a></span></footer>
</div>
<script>window.__HELP__=${JSON.stringify(DATA)};</script>
<script>${RUNTIME}</script>
</body>
</html>
`;
}

const arg = process.argv.indexOf("--locale");
const targets: readonly HelpLocale[] =
  arg !== -1 && process.argv[arg + 1] ? [process.argv[arg + 1] as HelpLocale] : HELP_LOCALES;

for (const locale of targets) {
  const html = buildHtml(locale);
  const out = resolve(process.cwd(), "public", `help${localeSuffix(locale)}.html`);
  writeFileSync(out, html, "utf8");
  console.log("wrote", out, html.length, "bytes");
}
