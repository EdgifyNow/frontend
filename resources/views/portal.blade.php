<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>EdgifyNow Portal</title>
<meta name="robots" content="noindex, nofollow" />
<style>
:root{
  --blue:#1f5fbf;
  --blue2:#2f73da;
  --navy:#17345c;
  --ink:#172033;
  --muted:#6b7280;
  --line:#e5e7eb;
  --soft:#f5f8fc;
  --soft2:#eef4fb;
  --green:#168a5b;
  --amber:#b7791f;
  --red:#c24141;
  --white:#fff;
}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f7fb;color:var(--ink);min-height:100vh}
a{text-decoration:none;color:inherit}
.eg-shell{display:grid;grid-template-columns:250px 1fr;min-height:100vh}
.eg-sidebar{background:linear-gradient(180deg,#123560 0%,#173f72 100%);color:#fff;padding:24px 18px;position:sticky;top:0;height:100vh;overflow-y:auto}
.eg-brand{font-weight:800;font-size:22px;letter-spacing:.2px;margin-bottom:26px}
.eg-brand span{opacity:.75;font-weight:500}
.eg-navgroup{font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.6;margin:18px 10px 8px}
.eg-navitem{padding:11px 12px;border-radius:10px;margin:5px 0;display:flex;gap:10px;align-items:center;font-size:14px;cursor:pointer}
.eg-navitem.active,.eg-navitem:hover{background:rgba(255,255,255,.12)}
.eg-navitem.logout{margin-top:24px;opacity:.85}
.eg-main{padding:24px 28px 48px}
.eg-topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px;flex-wrap:wrap;gap:12px}
.eg-h1{font-size:27px;font-weight:750}
.eg-sub{color:var(--muted);font-size:14px;margin-top:4px}
.eg-user{display:flex;gap:12px;align-items:center;background:#fff;border:1px solid var(--line);padding:8px 12px;border-radius:12px}
.eg-avatar{width:32px;height:32px;border-radius:50%;background:var(--blue);color:#fff;display:grid;place-items:center;font-size:12px;font-weight:700}
.eg-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}
.eg-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.eg-grid2{display:grid;grid-template-columns:1.35fr 1fr;gap:16px}
.eg-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;box-shadow:0 4px 20px rgba(23,52,92,.05)}
.eg-metric .eg-label{font-size:13px;color:var(--muted)}
.eg-metric .eg-value{font-size:28px;font-weight:750;margin-top:8px}
.eg-row{display:flex;justify-content:space-between;align-items:center;gap:12px}
.eg-card h3{margin:0 0 12px;font-size:16px}
.eg-pill{font-size:12px;border-radius:999px;padding:5px 9px;background:var(--soft2);color:var(--blue);border:none;display:inline-block}
.eg-pill.green{background:#e8f7f0;color:var(--green)}
.eg-pill.amber{background:#fff7df;color:var(--amber)}
.eg-pill.red{background:#feecec;color:var(--red)}
.eg-table{width:100%;border-collapse:collapse}
.eg-table th,.eg-table td{padding:12px 10px;border-bottom:1px solid var(--line);text-align:left;font-size:13px;vertical-align:middle}
.eg-table th{color:var(--muted);font-weight:650;background:#fbfcfe}
.eg-btn{border:0;border-radius:10px;padding:10px 13px;background:var(--blue);color:#fff;font-weight:650;cursor:pointer;font-size:13px}
.eg-btn:disabled{opacity:.6;cursor:default}
.eg-btn.secondary{background:#eef4fb;color:var(--blue)}
.eg-btn.ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
.eg-btn.danger{background:#feecec;color:var(--red)}
.eg-list{display:flex;flex-direction:column;gap:10px}
.eg-listitem{display:flex;justify-content:space-between;gap:10px;padding:11px 0;border-bottom:1px solid var(--line);align-items:center}
.eg-muted{color:var(--muted)}
.eg-small{font-size:12px}
.eg-tag{font-size:11px;padding:4px 7px;border-radius:7px;background:#eef4fb;color:var(--blue)}
.eg-hero{padding:26px;border-radius:18px;background:linear-gradient(135deg,#143760,#2867bf);color:#fff;margin-bottom:18px}
.eg-hero h2{margin:0;font-size:24px}
.eg-hero p{opacity:.84;max-width:800px;margin:8px 0 0}
.eg-input,.eg-select,.eg-textarea{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px;font:inherit;background:#fff}
.eg-textarea{min-height:90px;resize:vertical}
.eg-tabs{display:flex;gap:8px;margin-bottom:14px}
.eg-tab{padding:8px 11px;border-radius:9px;background:#edf3fa;color:#335;cursor:pointer;font-size:13px}
.eg-tab.active{background:var(--blue);color:#fff}
.eg-chat{height:360px;display:flex;flex-direction:column}
.eg-messages{flex:1;overflow:auto;padding:8px 2px}
.eg-msg{max-width:82%;padding:10px 12px;border-radius:12px;margin:8px 0;font-size:13px;line-height:1.45}
.eg-msg.bot{background:#eef4fb}
.eg-msg.me{background:#1f5fbf;color:#fff;margin-left:auto}
.eg-chatbar{display:flex;gap:8px}
.eg-chatbar input{flex:1}
.eg-dropzone{border:2px dashed #a8bdd9;border-radius:14px;padding:20px;text-align:center;background:#fbfdff}
.eg-form-row{margin-bottom:12px}
.eg-form-row label{display:block;font-size:12px;font-weight:650;margin-bottom:6px;color:var(--muted)}
.eg-error{background:#feecec;color:var(--red);padding:10px 12px;border-radius:10px;font-size:13px;margin-bottom:14px}
.eg-login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f1c33,#1c3f73);padding:20px}
.eg-login-card{background:#fff;border-radius:18px;padding:36px 32px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.eg-login-brand{font-weight:800;font-size:24px;margin-bottom:6px;color:var(--navy)}
.eg-login-sub{color:var(--muted);font-size:13px;margin-bottom:22px}
.eg-spin{display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:egspin .7s linear infinite;margin-right:6px}
@keyframes egspin{to{transform:rotate(360deg)}}
.eg-empty{padding:24px;text-align:center;color:var(--muted);font-size:13px}
.eg-stepper{display:flex;gap:10px;margin:0 0 18px;flex-wrap:wrap}
.eg-step{flex:1;min-width:140px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px}
.eg-step strong{display:block;margin-bottom:4px;font-size:13px}
.eg-step.active{border-color:#8ab6ef;background:#f3f8fe}
.eg-dropzone.drag{border-color:var(--blue);background:#f2f7fe}
.eg-qbtn{display:inline-block;padding:7px 10px;border-radius:9px;background:#eef4fb;color:#275d9f;font-size:12px;margin:4px 4px 4px 0;cursor:pointer}
.eg-statusbox{padding:12px;border-radius:12px;background:#f6faf7;border:1px solid #d9eee2;margin-top:12px;font-size:13px}
.eg-check{display:flex;gap:10px;align-items:flex-start;margin:9px 0;color:#334;font-size:13px}
.eg-check span{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:#e8f7f0;color:var(--green);font-weight:700;flex:0 0 22px;font-size:12px}
.eg-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.eg-toolbar input,.eg-toolbar select{height:38px;border:1px solid var(--line);border-radius:10px;background:#fff;padding:0 11px;font:inherit;color:var(--ink)}
.eg-toolbar input{min-width:200px;flex:1}
.eg-drawer-backdrop{display:none;position:fixed;inset:0;background:rgba(15,27,55,.35);z-index:40}
.eg-drawer-backdrop.open{display:block}
.eg-drawer{position:fixed;right:-440px;top:0;height:100vh;width:420px;max-width:92vw;background:#fff;z-index:41;box-shadow:-10px 0 35px rgba(16,29,60,.18);padding:26px;transition:right .2s ease;overflow-y:auto}
.eg-drawer.open{right:0}
.eg-drawer-close{float:right;border:0;background:#f0f3f9;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:16px;line-height:1}
.eg-drawer h2{margin:0 0 4px;font-size:20px}
.eg-drawer-sub{color:var(--muted);margin-bottom:20px}
.eg-drawer h4{font-size:11px;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;margin:20px 0 8px}
.eg-kv{display:grid;grid-template-columns:110px 1fr;gap:8px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}
.eg-kv span:first-child{color:var(--muted)}
@media(max-width:1000px){
  .eg-shell{grid-template-columns:1fr}
  .eg-sidebar{position:relative;height:auto}
  .eg-grid4,.eg-grid3,.eg-grid2{grid-template-columns:1fr}
}
</style>
</head>
<body>
@include('partials.config-script')
<div id="egApp"></div>
<script src="{{ asset('js/portal.js') }}"></script>
</body>
</html>
