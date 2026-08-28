<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Business Assistant</title>
<meta name="robots" content="noindex, nofollow" />
<style>
:root{
  --wg-primary:#1f5fbf;
  --wg-ink:#172033;
  --wg-muted:#6b7280;
  --wg-line:#e5e7eb;
  --wg-bg:#f7f9fc;
  --wg-red:#c24141;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:transparent}
#wgRoot{display:flex;flex-direction:column;height:100vh;background:var(--wg-bg);border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.18)}
.wg-head{background:var(--wg-primary);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px;flex:0 0 auto}
.wg-head img{width:28px;height:28px;border-radius:6px;object-fit:cover;background:rgba(255,255,255,.2)}
.wg-head-name{font-weight:700;font-size:14px}
.wg-head-sub{font-size:11px;opacity:.85}
.wg-restart{margin-left:auto;background:rgba(255,255,255,.15);border:0;color:#fff;border-radius:8px;padding:6px 8px;font-size:11px;cursor:pointer}
.wg-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
.wg-msg{max-width:85%;padding:9px 12px;border-radius:12px;font-size:13.5px;line-height:1.45}
.wg-msg-bot{background:#fff;border:1px solid var(--wg-line);color:var(--wg-ink);align-self:flex-start;border-bottom-left-radius:4px}
.wg-msg-user{background:var(--wg-primary);color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
.wg-msg-error{background:#feecec;color:var(--wg-red);align-self:flex-start;border-bottom-left-radius:4px}
.wg-loading{align-self:flex-start;color:var(--wg-muted);font-size:12px;padding:4px 12px;display:flex;align-items:center;gap:6px}
.wg-spin{width:12px;height:12px;border:2px solid #cbd5e1;border-top-color:var(--wg-primary);border-radius:50%;animation:wgspin .7s linear infinite}
@keyframes wgspin{to{transform:rotate(360deg)}}
.wg-actions{display:flex;gap:6px;flex-wrap:wrap;padding:0 14px 8px}
.wg-action-btn{background:#eef4fb;color:var(--wg-primary);border:1px solid var(--wg-line);border-radius:999px;padding:6px 11px;font-size:11.5px;cursor:pointer;font-weight:600}
.wg-foot{flex:0 0 auto;border-top:1px solid var(--wg-line);background:#fff;padding:10px}
.wg-form{display:flex;gap:8px}
.wg-input{flex:1;background:var(--wg-bg);border:1px solid var(--wg-line);border-radius:20px;padding:9px 14px;font:inherit;font-size:13.5px;outline:none}
.wg-send{width:36px;height:36px;border-radius:50%;background:var(--wg-primary);border:0;color:#fff;cursor:pointer;flex:0 0 36px;display:flex;align-items:center;justify-content:center}
.wg-panel{padding:12px;background:#fff;border-top:1px solid var(--wg-line)}
.wg-panel h4{margin:0 0 8px;font-size:13px}
.wg-panel input,.wg-panel select{width:100%;padding:8px 10px;border:1px solid var(--wg-line);border-radius:8px;font:inherit;font-size:12.5px;margin-bottom:8px}
.wg-panel-actions{display:flex;gap:8px}
.wg-panel-btn{flex:1;padding:8px;border-radius:8px;border:0;font-size:12.5px;font-weight:600;cursor:pointer}
.wg-panel-btn.primary{background:var(--wg-primary);color:#fff}
.wg-panel-btn.ghost{background:var(--wg-bg);color:var(--wg-ink)}
.wg-error-banner{background:#feecec;color:var(--wg-red);padding:10px 14px;font-size:12.5px}
.wg-boot{display:flex;align-items:center;justify-content:center;height:100%;color:var(--wg-muted);font-size:13px}
</style>
</head>
<body>
@include('partials.config-script')
<div id="wgRoot"></div>
<script src="{{ asset('js/widget.js') }}"></script>
</body>
</html>
