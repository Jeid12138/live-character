window.__ModuleLoader__.load({id:'live-character',factory:require=>{
 const pluginVersion='1.0.3';
 const React=require('react'),h=React.createElement;
 const logo='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#205c62"/><path d="M11 11v18h11m7-16a7 7 0 1 0 0 12" stroke="#fff" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="30" cy="9" r="2" fill="#91ded3"/></svg>`);
 function Logo({size=20}={}){return h('img',{className:'lc-logo',width:size,height:size,src:logo,alt:'','aria-hidden':true});}
 const styles=`.lc-page .lc-modal-workspace{position:absolute;container-type:size;inset:clamp(16px,8cqh,100px) clamp(12px,8cqw,100px);width:auto;max-width:1100px;max-height:calc(100% - 2 * clamp(16px,8cqh,100px));margin:auto;z-index:1000;background:var(--surface,#f7fbff);border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:0 12px 40px #0005;overflow:auto}.lc-page .lc-modal-workspace .lc-controls{height:auto;max-height:100%;overflow:auto}.lc-page .zone-edit-footer{position:sticky;bottom:0;padding:10px 0;background:var(--surface);z-index:2} .lc-page{height:100%;overflow:auto;font:14px/1.5 system-ui,sans-serif;container-type:inline-size}.lc-page *{box-sizing:border-box}.lc-page header{display:flex;align-items:center;gap:12px;background:white;border-bottom:1px solid #dce6e7;padding:15px 22px}.lc-page header strong{font-size:21px;letter-spacing:-.035em}.lc-page header .lc-logo{width:40px;height:40px}.lc-page header small{color:var(--dsw-alias-label-secondary,#75878d)}.lc-page header button{margin-left:auto}.lc-page button,.lc-page select,.lc-page input:not([type=checkbox],[type=range]),.lc-page textarea{font:inherit;border:1px solid #d6e1e2;border-radius:8px;background:white;color:inherit;padding:7px 10px}.lc-page button{cursor:pointer}.lc-page button:disabled{opacity:.5}.lc-page button:hover{border-color:#84a8aa}.lc-page button.chosen{background:#205c62;color:white;border-color:#205c62}.lc-workspace{display:flex;align-items:flex-start;gap:14px;padding:16px}.lc-preview{flex:1;min-width:0}.lc-stage,.lc-controls,.lc-drawer{border:1px solid #dae4e5;border-radius:14px}.lc-stage{position:relative;display:grid;grid-template-rows:auto 1fr auto;background:radial-gradient(ellipse,#fff,#e1ecee);height:calc(100vh - 175px);min-height:360px;padding:14px}.lc-meta,.lc-stage-actions,.lc-page nav{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.lc-meta{font-size:11px;color:var(--dsw-alias-label-secondary,#607980);justify-content:space-between}.lc-stage-actions{justify-content:center}.lc-stage-actions button{font-size:12px}.lc-image,.lc-empty{min-height:0;display:flex;align-items:center;justify-content:center}.lc-empty{gap:8px;flex-direction:column}.lc-frame{display:inline-flex;position:relative;max-height:100%;max-width:100%}.lc-frame img{max-width:100%;height:auto;max-height:calc(100vh - 290px);object-fit:contain;touch-action:none}.lc-box{pointer-events:none;position:absolute;border:1px solid #267388;font-size:10px}.lc-box.selected{border:2px solid #d89813}.lc-box i{position:absolute;width:6px;height:6px;background:#f3bf39}.lc-box .nw,.lc-box .sw{left:-3px}.lc-box .ne,.lc-box .se{right:-3px}.lc-box .nw,.lc-box .ne{top:-3px}.lc-box .sw,.lc-box .se{bottom:-3px}.lc-page footer{padding:8px;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary,#697e84)}.lc-page footer b{font-weight:550}.lc-page [data-level=error],.lc-error{color:var(--dsw-alias-state-error-primary,#b43a39)}.lc-page [data-level=warning]{color:var(--dsw-alias-state-warn-primary,#91650c)}.lc-controls,.lc-drawer{width:clamp(285px,33%,430px);padding:16px;background:white;max-height:calc(100vh - 110px);overflow:auto}.lc-drawer{width:225px}.lc-page nav{border-bottom:1px solid #e3eaea;padding-bottom:10px;margin-bottom:12px}.lc-page nav button{font-size:12px}.lc-page h2,.lc-page h3{font-size:14px;margin:14px 0 9px}.lc-controls label,.lc-drawer label{display:block;margin:12px 0}.lc-page select,.lc-page textarea,.lc-page input:not([type=checkbox]){width:100%}.lc-page input{accent-color:var(--dsw-alias-brand-primary,#327771)}.lc-page label:has(> input[type=checkbox]){display:flex;justify-content:space-between;align-items:center}.lc-page output{float:right;color:var(--dsw-alias-brand-primary,#376e69)}.lc-page small,.lc-page summary{color:var(--dsw-alias-label-secondary,#637980)}.lc-page summary{cursor:pointer}.lc-page details,.lc-page hr{border:0;border-top:1px solid #e1e8e9;padding-top:10px;margin:12px 0}.lc-page pre{white-space:pre-wrap;overflow-wrap:anywhere}.lc-page .param-row{padding:6px 0;border-bottom:1px solid #e1e8e9}.lc-error{padding:10px}.lc-page .actions{display:flex;gap:4px;flex-wrap:wrap}@container(max-width:850px){.lc-drawer{position:absolute;z-index:2;box-shadow:0 8px 30px #15454b25}}@container(max-width:620px){.lc-workspace{flex-wrap:wrap}.lc-preview,.lc-controls{width:100%;flex:auto}.lc-stage{height:400px}.lc-frame img{max-height:290px}.lc-controls{max-height:none}}

.lc-page{position:relative;--bg:var(--dsw-alias-bg-base,#edf2f3);--surface:var(--dsw-alias-bg-layer-1,#fff);--ink:var(--dsw-alias-label-primary,#263f49);--line:var(--dsw-alias-border-l1,#dae4e5);background:var(--bg);color:var(--ink);display:flex;flex-direction:column;min-height:0;container-type:size}
.lc-page header,.lc-page .lc-controls,.lc-page .lc-drawer,.lc-page button,.lc-page select,.lc-page textarea,.lc-page input:not([type=checkbox],[type=range]),.lc-history{background:var(--surface);color:var(--ink);border-color:var(--line)}
.lc-page .lc-workspace{flex:1;min-height:0;gap:0;align-items:stretch}.lc-page .lc-preview{display:flex;flex-direction:column;min-height:0}.lc-page .lc-stage{flex:1;height:auto;min-height:180px;color:#29444a}.lc-frame img{max-height:calc(100cqh - 250px)}
.lc-page .lc-drawer,.lc-page .lc-controls{position:static;max-height:none;min-width:0;flex-shrink:0}.lc-page .lc-controls{width:min(var(--lc-controls-w,34%),58%)}.lc-page .lc-drawer{width:min(var(--lc-drawer-w,205px),27%)}
.lc-divider{touch-action:none;cursor:col-resize;flex:0 0 12px;align-self:stretch;position:relative}.lc-divider:hover:after,.lc-divider:focus:after{content:'';position:absolute;inset:4px 5px;background:#669693;border-radius:4px}
.lc-page .lc-hint{padding:0!important;background:transparent!important;min-width:16px;display:inline-flex;position:relative;border:1px solid #acb9be;border-radius:50%;color:var(--dsw-alias-label-secondary,#8699a0);width:16px;height:16px;justify-content:center;align-items:center;font-size:11px;cursor:help}.lc-note:popover-open{position:fixed;inset:auto;margin:0;width:max-content;max-width:min(290px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink);padding:8px 11px;font:13px/1.55 system-ui;box-shadow:0 3px 14px #0003;white-space:normal}
.lc-page small,.lc-page footer,.lc-scroll time{color:var(--dsw-alias-label-secondary,var(--ink))}.lc-page [data-level=error],.lc-page .lc-error{color:var(--dsw-alias-state-error-primary,#b94545)}.lc-page [data-level=warning]{color:var(--dsw-alias-state-warn-primary,#986e12)}.lc-history{background:var(--surface);color:var(--ink)}.lc-box{background:#1234}

.lc-history{border:1px solid var(--line);border-radius:14px;padding:0;width:min(570px,88vw);max-height:80vh}.lc-history::backdrop{background:#19313866}.lc-history header{display:flex;align-items:center;justify-content:space-between}.lc-scroll{overflow:auto;max-height:60vh;padding:12px 20px;overscroll-behavior:contain}.lc-scroll article{border-bottom:1px solid var(--line);padding:8px 0}.lc-scroll p{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}.lc-scroll time{font-size:11px;margin-left:10px;color:var(--dsw-alias-label-secondary,#7f9096)}
.lc-welcome{flex:1;min-height:220px;display:grid;grid-template-rows:1fr auto;background:radial-gradient(ellipse at 50% 42%,#6aaaa322,transparent 64%),var(--bg)}.lc-launchcard{align-self:center;justify-self:center;text-align:center}.lc-launchcard img{width:68px;height:68px;filter:drop-shadow(0 9px 14px #27595525)}.lc-launchcard h1{font-size:32px;letter-spacing:-1.3px;margin:14px 0 24px}.lc-page .lc-launchcard button{background:#215b60;color:white;padding:11px 34px;border-radius:12px}.lc-welcome footer{padding:14px 22px;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left}
@container(max-width:650px){.lc-page .lc-workspace{display:flex;flex-direction:column;overflow:auto}.lc-page .lc-drawer,.lc-page .lc-controls{width:100%;height:var(--lc-controls-h,360px)}.lc-page .lc-drawer{height:var(--lc-drawer-h,210px)}.lc-page .lc-preview{min-height:330px}.lc-divider{cursor:row-resize}.lc-frame img{max-height:280px}}
/* LC · quiet utility studio; host styles stay inside .lc-page. */
.lc-page [data-ui="transcript-help"]{float:right}
.lc-page{--lc-accent:#246c67;--lc-tint:color-mix(in srgb,var(--lc-accent) 10%,var(--surface));--lc-muted:var(--dsw-alias-label-secondary,#637575);--lc-field:color-mix(in srgb,var(--surface) 94%,var(--ink));--bg:var(--dsw-alias-bg-base,#f3f6f5);--surface:var(--dsw-alias-bg-layer-1,#fff);--ink:var(--dsw-alias-label-primary,#223a3b);--line:var(--dsw-alias-border-l1,#dce5e2);font-family:"Segoe UI Variable","Segoe UI","Microsoft YaHei UI",system-ui,sans-serif;font-size:13px;line-height:1.6;scrollbar-color:#b7c8c2 transparent;scrollbar-width:thin}
.lc-page>header{padding:17px 24px;min-height:74px;gap:13px;flex-shrink:0;background:var(--surface)}
.lc-page>header .lc-logo{width:35px;height:35px}.lc-page>header strong{font-size:20px;font-weight:650;letter-spacing:-.5px}.lc-page>header small{font-size:11px;color:var(--lc-muted)}
.lc-page .lc-workspace{padding:20px;overflow:hidden}.lc-page .lc-preview{gap:0}.lc-page .lc-stage{border-radius:14px;border-color:var(--line);padding:16px;background:radial-gradient(circle at 1px 1px,#668b7d15 1px,transparent 1.2px) 0 0/22px 22px,#eaf1ee;isolation:isolate}
.lc-page .lc-meta{font-size:11px;gap:10px;color:#56716a}.lc-page .lc-meta>label{margin:0;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.lc-page .lc-meta input{width:14px;height:14px}.lc-page .lc-frame{border-radius:6px;overflow:visible}.lc-page .lc-frame img{border-radius:6px}
.lc-page .lc-stage-actions{padding-top:12px;gap:6px}.lc-page .lc-stage-actions button{min-height:33px;font-size:12px;padding:6px 11px;border-color:#d7e3dc;background:#ffffffed;color:#385d55;box-shadow:0 1px 2px #23473b06}
.lc-page .lc-preview>footer{padding:11px 8px 0;line-height:1.7;font-size:11px;color:var(--lc-muted)}.lc-page .lc-preview>footer b{font-weight:550}.lc-page .lc-preview>footer>div{overflow-wrap:anywhere;margin-top:2px;min-height:18px}
.lc-page .lc-controls,.lc-page .lc-drawer{padding:18px 20px;border-radius:14px;background:var(--surface);border-color:var(--line);scrollbar-gutter:stable;overscroll-behavior:contain}.lc-page .lc-controls{container:lc-controls / inline-size}.lc-page .lc-divider{flex-basis:16px}.lc-page .lc-divider:after{content:"";position:absolute;left:7px;top:44%;height:32px;width:2px;background:var(--line);border-radius:3px}.lc-page .lc-divider:hover:after,.lc-page .lc-divider:focus-visible:after{background:var(--lc-accent);inset:8px 7px;height:auto;width:2px}
.lc-page .lc-settings-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;position:sticky;top:0;z-index:3;background:var(--surface);padding:0 0 15px;margin:0 0 18px;border-color:var(--line)}
.lc-page .lc-settings-tabs>button{min-width:0;min-height:35px;padding:7px 9px;font-size:12px;font-weight:550;text-align:left;display:flex;align-items:center;gap:7px;white-space:nowrap;border:1px solid transparent;background:transparent;color:var(--lc-muted);border-radius:8px;box-shadow:none}
.lc-page .lc-settings-tabs>button:hover{background:var(--lc-field);color:var(--ink)}.lc-page .lc-settings-tabs>button.chosen{background:var(--lc-tint);color:var(--ink);border-color:color-mix(in srgb,var(--lc-accent) 20%,var(--line))}
.lc-page h2{font-size:16px;line-height:1.45;font-weight:650;letter-spacing:-.2px;margin:4px 0 20px;color:var(--ink)}.lc-page h3{font-size:13px;font-weight:650;margin:22px 0 12px;color:var(--ink)}
.lc-page .lc-controls label,.lc-page .lc-drawer label{font-size:12px;font-weight:500;color:var(--ink);margin:15px 0;line-height:1.7}.lc-page label>select,.lc-page label>input:not([type=checkbox]),.lc-page label>textarea{margin-top:6px}.lc-page label:has(>input[type=checkbox]){gap:12px;font-weight:450;min-height:24px}
.lc-page select,.lc-page input:not([type=checkbox],[type=range]),.lc-page textarea{min-height:36px;border-radius:8px;padding:8px 10px;background:var(--lc-field);border:1px solid var(--line);font-size:13px;box-shadow:none;color:var(--ink)}.lc-page textarea{min-height:100px;resize:vertical;line-height:1.7}.lc-page input[type=checkbox]{width:16px;height:16px;flex:0 0 auto;accent-color:var(--lc-accent)}.lc-page input[type=range]{accent-color:var(--lc-accent);min-height:24px;cursor:pointer}.lc-page input[type=color]{width:100%;height:36px;padding:3px}
.lc-page button{min-height:34px;padding:7px 11px;border-radius:8px;border-color:var(--line);background:var(--surface);transition:background-color .15s,border-color .15s;color:var(--ink)}.lc-page button:hover:not(:disabled){background:var(--lc-field);border-color:color-mix(in srgb,var(--lc-accent) 40%,var(--line))}.lc-page button:disabled{cursor:not-allowed;opacity:.45}
.lc-page button[data-ui=primary]{background:var(--lc-accent);color:#fff;border-color:var(--lc-accent);font-weight:550}.lc-page button[data-ui=primary]:hover:not(:disabled){background:#195a56;color:white}.lc-page button[data-level=error]{color:var(--dsw-alias-state-error-primary,#b43a39);background:color-mix(in srgb,#b43a39 7%,var(--surface));border-color:color-mix(in srgb,#b43a39 22%,var(--line))}
.lc-page :is(button,input,textarea,select,summary,[role=separator]):focus-visible{outline:2px solid #378b81;outline-offset:3px}.lc-page button.lc-hint{min-height:17px;width:17px;height:17px;flex:0 0 17px;color:var(--lc-muted);vertical-align:middle}.lc-page .token-note{display:block;font-size:11px;color:var(--lc-muted);line-height:1.7;margin:6px 0 12px}.lc-page .actions{gap:7px;margin:10px 0}
.lc-page .lc-controls details{padding:13px 0 0;margin:18px 0;border-color:var(--line)}.lc-page .lc-controls summary{font-size:12px;line-height:1.6;font-weight:600;color:var(--ink);padding:2px 0;list-style-position:inside}.lc-page output{font-size:12px;color:var(--dsw-alias-label-primary,var(--lc-accent));font-variant-numeric:tabular-nums}.lc-page .configuration-transfer{border:1px solid var(--line);border-radius:10px;padding:0 14px 10px;margin-top:24px;background:var(--lc-field)}.lc-page .configuration-transfer h3{margin:14px 0 10px}.lc-page pre{padding:12px;background:var(--lc-field);border-radius:8px;font-size:11px;line-height:1.6}
.lc-page .lc-drawer nav{gap:5px;padding-bottom:12px}.lc-page .lc-drawer nav button{flex:1;min-width:0;font-size:12px}.lc-page .lc-drawer nav button.chosen{background:var(--lc-tint);color:var(--lc-accent);border-color:var(--line)}.lc-page .param-row{padding:11px 0;border-color:var(--line)}.lc-page .param-row code{font-size:10px;color:var(--lc-muted);overflow-wrap:anywhere}
.lc-page .lc-welcome{background:var(--bg)}.lc-page .lc-launchcard{border:1px solid var(--line);border-radius:20px;background:var(--surface);padding:42px 64px;box-shadow:0 12px 32px #23473b07;max-width:calc(100% - 36px)}.lc-page .lc-launchcard img{width:56px;height:56px;filter:none}.lc-page .lc-launchcard h1{font-size:29px;font-weight:600;margin:18px 0 26px;letter-spacing:-.8px}.lc-page .lc-launchcard button{background:var(--lc-accent);border-radius:9px;min-height:40px}.lc-page .lc-welcome footer{font-size:12px;background:var(--surface)}
.lc-page .lc-modal-workspace{padding:20px;border-radius:16px;background:var(--surface);box-shadow:0 20px 80px #19372c24}.lc-page .lc-modal-workspace .lc-controls{border:0;width:42%;padding:4px 12px}.lc-page .lc-modal-workspace .lc-stage{background-color:#eaf1ee}.lc-page .lc-history{border-radius:16px;box-shadow:0 20px 70px #19372c30}.lc-page .lc-history header{padding:15px 20px}.lc-page .lc-history header strong{font-size:16px}.lc-page .lc-scroll article{padding:15px 0}.lc-page .lc-scroll article>b{font-size:12px;color:var(--ink)}.lc-page .lc-scroll p{line-height:1.85}.lc-page .lc-note:popover-open{background:var(--surface);border-radius:9px;border-color:var(--line);box-shadow:0 8px 24px #19372c20}
.lc-page .lc-controls label:has(>input[type=checkbox]),.lc-page .lc-drawer label:has(>input[type=checkbox]){justify-content:flex-start;gap:9px}
.lc-page :is(.lc-controls,.lc-drawer) label>input[type=checkbox]{order:-1;margin:0}
.lc-page :is(.lc-controls,.lc-drawer) label:has(>input[type=checkbox]) small{margin-left:auto}
.lc-page :is(.lc-controls,.lc-drawer) .actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0}
.lc-page :is(.lc-controls,.lc-drawer) .actions>button{max-width:100%;margin:0;white-space:normal;overflow-wrap:anywhere}
.lc-page .lc-controls .character-card:not(:empty){padding-bottom:16px;margin-bottom:20px;border-bottom:1px solid var(--line)}
.lc-page .lc-controls .character-card>h3{margin:0 0 4px}
.lc-page .lc-controls .character-summary{margin:0 0 12px;color:var(--lc-muted);font-size:12px;overflow-wrap:anywhere}
.lc-page .lc-controls .character-card>.actions{margin-bottom:0}
.lc-page :is(.lc-controls,.lc-drawer) :is([data-ui=status],[data-level=error]):not(button):not(:empty){display:block;margin:10px 0;padding:10px 12px;border:0;border-radius:9px;background:var(--lc-field);color:var(--lc-muted);font-size:12px;line-height:1.6;overflow-wrap:anywhere}
.lc-page :is(.lc-controls,.lc-drawer) button[data-level=error],.lc-page .lc-welcome footer button{border:0;background:var(--lc-field);color:var(--lc-muted)}
.lc-page :is(.lc-controls,.lc-drawer) button[data-level=error]:hover:not(:disabled),.lc-page .lc-welcome footer button:hover:not(:disabled){background:var(--lc-tint);color:var(--ink)}
.lc-page :is(.lc-controls,.lc-drawer) [data-ui=cost]{display:block;color:var(--lc-muted);font-size:11px;margin:6px 0 12px;line-height:1.7}
.lc-page :is(.lc-help-row,.lc-help-line){display:flex;justify-content:flex-end;margin:4px 0}
.lc-page .lc-help-anchor:not(.lc-help-line),.lc-page label:has(>button.lc-hint),.lc-page label:has(>[data-ui=transcript-help]){position:relative;padding-inline-end:25px}
.lc-page .lc-help-anchor:not(.lc-help-line)>button.lc-hint,.lc-page label>button.lc-hint,.lc-page label>[data-ui=transcript-help]{position:absolute;right:0;top:0}
.lc-page button.lc-hint{background:var(--lc-field)!important;border-color:color-mix(in srgb,var(--lc-muted) 45%,transparent)}
@container lc-controls (max-width:255px){.lc-page .lc-settings-tabs>button:before{display:none}.lc-page .lc-settings-tabs>button{padding:7px 6px;gap:0}}
@container lc-controls (min-width:390px){.lc-page .lc-settings-tabs{grid-template-columns:repeat(3,minmax(0,1fr))}}
@container(max-width:650px){.lc-page .lc-workspace{padding:12px;overflow:auto}.lc-page .lc-controls,.lc-page .lc-drawer{padding:16px}.lc-page .lc-settings-tabs{top:0}.lc-page .lc-divider{min-height:16px}.lc-page .lc-divider:after{left:44%;top:7px;width:32px;height:2px}.lc-page .lc-divider:hover:after,.lc-page .lc-divider:focus-visible:after{inset:7px 8px;height:2px;width:auto}.lc-page .lc-modal-workspace .lc-controls{width:100%}.lc-page>header{padding:13px 16px;gap:10px}.lc-page>header strong{font-size:18px}.lc-page>header small{display:none}}
@media(prefers-reduced-motion:reduce){.lc-page *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
.lc-page .lc-settings-tabs [data-pane="renderPanel"]{--lc-nav-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.7%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M4%207h16v13H4z%20M7%203v8%20M17%203v8%20M4%2011h16%22%2F%3E%3C%2Fsvg%3E")}
.lc-page .lc-settings-tabs [data-pane="companionPanel"]{--lc-nav-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.7%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M12%2020s-8-4.7-8-10a4.5%204.5%200%200%201%208-2.8A4.5%204.5%200%200%201%2020%2010c0%205.3-8%2010-8%2010z%22%2F%3E%3C%2Fsvg%3E")}
.lc-page .lc-settings-tabs [data-pane="voicePanel"]{--lc-nav-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.7%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M12%203v18%20M4%209v6%20M8%206v12%20M16%206v12%20M20%209v6%22%2F%3E%3C%2Fsvg%3E")}
.lc-page .lc-settings-tabs [data-pane="focusPanel"]{--lc-nav-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.7%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M8%203H4v4%20M16%203h4v4%20M4%2017v4h4%20M20%2017v4h-4%20M8%2012h8%20M12%208v8%22%2F%3E%3C%2Fsvg%3E")}
.lc-page .lc-settings-tabs [data-pane="bubblePanel"]{--lc-nav-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.7%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M4%204h16v13H9l-5%204z%20M8%209h8%20M8%2013h5%22%2F%3E%3C%2Fsvg%3E")}
.lc-page .lc-settings-tabs [data-pane="balancePanel"]{--lc-nav-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.7%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M3%205h18v15H3z%20M3%209h18%20M16%2012h5v5h-5z%22%2F%3E%3C%2Fsvg%3E")}
.lc-page .lc-settings-tabs [data-pane="assetPanel"]{--lc-nav-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.7%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M4%206h16%20M4%2012h16%20M4%2018h16%20M9%203v6%20M15%209v6%20M9%2015v6%22%2F%3E%3C%2Fsvg%3E")}
.lc-page .screen-observation{margin-left:20px}.lc-page .screen-observation label{margin-bottom:4px}.lc-page .screen-observation .muted{margin-top:0}.lc-page .screen-observation-mark{display:inline-grid;place-items:center;width:14px;height:14px;border:1px solid currentColor;border-radius:50%;font-weight:700;line-height:1}
.lc-page .lc-settings-tabs>button:before{content:"";flex:0 0 15px;width:15px;height:15px;background:currentColor;mask:var(--lc-nav-icon) center/contain no-repeat;-webkit-mask:var(--lc-nav-icon) center/contain no-repeat;opacity:.85}
`;
 async function call(rpc,data,signal){
  const id=crypto.randomUUID();
  const method='settings/'+id;
  const bounded=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(25000)]);
  let result;
  try {result=await rpc.call('/live-character',method,data,bounded);}
  catch(e){
   if(signal?.aborted)throw e;
   const status=/HTTP (\d{3})/.exec(e.message)?.[1]||'transport';
   const message=({'401':'DSH 登录凭证未获接受，请重新打开 DSH。','403':'设置请求被拒绝，可复制诊断核对本机日志。','404':'未找到设置接口，请确认 DSH 已加载 '+pluginVersion+'。'})[status]||'设置通道未响应。';
   throw Error(message+' ['+pluginVersion+' / '+status+' / '+id+']');
  }
  if(!result.ok)throw Error(result.error.message+' ['+pluginVersion+' / desktop / '+id+']');
  return result.value;
 }
 function History({rpc,last,close}){
  const ref=React.useRef(null),log=React.useRef(null);
  const [limit,setLimit]=React.useState(100),[page,setPage]=React.useState({rows:[],total:0}),[error,setError]=React.useState('');
  React.useEffect(()=>{const d=ref.current;d.showModal();return ()=>d.close();},[]);
  React.useEffect(()=>{const ctrl=new AbortController();const node=log.current;const tail=node.scrollHeight-node.scrollTop-node.clientHeight<16;
   let timer;async function refresh(){await call(rpc,{op:'history',limit},ctrl.signal).then(next=>{if(ctrl.signal.aborted)return;setPage(next);setError('');if(tail&&node.scrollHeight-node.scrollTop-node.clientHeight<16&&limit===100)requestAnimationFrame(()=>{if(!ctrl.signal.aborted)node.scrollTop=node.scrollHeight;});}).catch(e=>{if(!ctrl.signal.aborted)setError(e.message);});
   if(!ctrl.signal.aborted)timer=setTimeout(refresh,1000);}
   refresh();return ()=>{ctrl.abort();clearTimeout(timer);};},[rpc,limit,last]);
  return h('dialog',{className:'lc-history',ref,onCancel:e=>{e.preventDefault();close();}},h('header',null,h('strong',null,'对话记录'),h('button',{onClick:close,'aria-label':'关闭对话记录'},'×')),
   h('div',{className:'lc-scroll',ref:log},page.total>page.rows.length&&h('button',{onClick:()=>setLimit(limit+100)},'查看更早记录'),error&&h('p',{role:'alert'},error),!page.rows.length&&!error&&h('p',null,'暂无对话记录'),
    ...page.rows.map((m,i)=>h('article',{key:page.total-page.rows.length+i},h('b',null,m.kind==='character_event'?'角色事件':m.role==='user'?'你':'她'),h('time',null,m.at?new Date(m.at).toLocaleString():'原记录无时间'),h('p',null,m.text)))));
 }
 function Chat({state,act,rpc}){
  const [opened,setOpened]=React.useState(false);
  const [text,setText]=React.useState(''),[sending,setSending]=React.useState(false);
  const pending=React.useRef(false);
  async function submit(event){
   event.preventDefault();
   if(pending.current||state.busy||!text.trim())return;
   pending.current=true;setSending(true);
   try{if(await act({op:'chat',text}))setText('');}
   finally{pending.current=false;setSending(false);}
  }
  return h('section',null,h('button',{type:'button',onClick:()=>setOpened(true)},'查看对话记录'),opened&&h(History,{rpc,last:state.last,close:()=>setOpened(false)}),
   h('form',{onSubmit:submit},h('textarea',{value:text,maxLength:2000,disabled:sending,'aria-label':'对话内容',onChange:e=>setText(e.target.value),
    onKeyDown:e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();e.currentTarget.form.requestSubmit();}}}),
   h('small',{className:'token-note'},'发送会消耗模型 tokens'),h('div',{className:'actions'},h('button',{disabled:sending||state.busy||!text.trim()},'发送'),
   h('button',{type:'button',onClick:()=>act({op:'stop'})},'停止回复与朗读'))),
   h('small',{role:'status'},state.busy?'正在回复…':state.status));
 }
 function Field({n,act}){
  const ref=React.useRef(null),sent=React.useRef(null),kind=n.attrs.type,sensitive=n.sensitive===true||kind==='password';
  React.useEffect(()=>{const el=ref.current;if(!el||document.activeElement===el)return;if(kind==='checkbox')el.checked=n.checked;else if(kind!=='file'){el.value=n.value??'';if(sensitive)sent.current=el.value;}},[n.value,n.checked,n.id,kind,n.attrs['data-secret-revision']]);
  const change=e=>{const value=kind==='checkbox'?e.target.checked:e.target.value;if(sensitive&&sent.current===value)return;sent.current=value;return act({op:'value',id:n.id,value});};
  const props={ref,type:kind,min:n.attrs.min,max:n.attrs.max,step:n.attrs.step,disabled:'disabled' in n.attrs,readOnly:'readonly' in n.attrs,placeholder:n.attrs.placeholder,'aria-label':n.attrs['aria-label']};
  if(kind==='file')return h('button',{type:'button',onClick:()=>act({op:'file',id:n.id})},'选择本机文件');
  if(n.tag==='select')return h('select',{...props,defaultValue:n.value,onChange:change},n.children?.filter(x=>x.tag==='option').map(x=>h('option',{key:x.id,value:x.value,disabled:'disabled' in x.attrs},x.children?.join(''))));
  if(kind==='checkbox')return h('input',{...props,defaultChecked:n.checked,onChange:change});
  return h(n.tag,{...props,defaultValue:n.value,onInput:sensitive?change:undefined,onBlur:e=>{if(e.target.value!==String(n.value??''))change(e);},onChange:['range','color'].includes(kind)?change:undefined});
 }
 function Hint({text}){
  const descriptionId=React.useRef('lc-hint-'+Math.random().toString(36).slice(2)).current;
  const anchor=React.useRef(null),tip=React.useRef(null);
  function position(){
   const a=anchor.current.getBoundingClientRect(),t=tip.current;
   const x=Math.max(8,Math.min(innerWidth-t.offsetWidth-8,a.left));
   const y=a.bottom+6+t.offsetHeight<=innerHeight-8?a.bottom+6:Math.max(8,a.top-t.offsetHeight-6);
   Object.assign(t.style,{left:x+'px',top:y+'px'});
  }
  function hide(){tip.current?.hidePopover?.();}
  function show(){tip.current?.showPopover?.();if(tip.current)position();}
  React.useEffect(()=>{window.addEventListener('resize',hide);window.addEventListener('scroll',hide,true);return ()=>{window.removeEventListener('resize',hide);window.removeEventListener('scroll',hide,true);};},[]);
  return h('button',{type:'button',ref:anchor,className:'lc-hint',title:text,'aria-label':'查看说明','aria-describedby':descriptionId,onClick:e=>{e.preventDefault();show();},onMouseEnter:show,onMouseLeave:hide,onFocus:show,onBlur:hide,onKeyDown:e=>{if(e.key==='Escape')hide();}},'!',h('span',{ref:tip,popover:'manual',id:descriptionId,className:'lc-note',role:'tooltip'},text));
 }
 function tree(n,act,epoch){
  if(typeof n==='string')return n;const key=epoch+':'+n.id;
  if(['input','select','textarea'].includes(n.tag))return h(Field,{key,n,act});
  if(n.attrs['data-help-text'])return h(Hint,{key,text:n.attrs['data-help-text']});
  if(n.help)return h('div',{key,className:'lc-help-row'},h(Hint,{text:n.children?.join('')}));
  const kids=n.children?.map(c=>tree(c,act,epoch));
  if(n.tag==='form')return h('div',{key},kids);
  if(n.tag==='audio')return h('small',{key},'音频在角色窗口播放');
  const props={key,className:n.css||undefined};
  if(n.tag==='button'){props.type='button';props.onClick=()=>act({op:'click',id:n.id});props.disabled='disabled' in n.attrs;props.className=[n.css,n.active?'chosen':''].filter(Boolean).join(' ');}
  if(n.tag==='details')props.open=n.open;
  if(n.tag==='summary')props.onClick=e=>{e.preventDefault();act({op:'click',id:n.id});};
  if(n.attrs['data-level'])props['data-level']=n.attrs['data-level'];
  if(n.attrs['data-ui'])props['data-ui']=n.attrs['data-ui'];
  if(n.attrs.role)props.role=n.attrs.role;
  if(n.tag==='hr')return h('hr',props);return h(n.tag,props,kids);
 }
 function Divider({which}){
  const drag=React.useRef(null);
  function change(el,delta){
   const root=el.closest('.lc-page'),vertical=getComputedStyle(el).cursor==='row-resize';
   const panel=root.querySelector('.lc-'+which),prop='--lc-'+which+(vertical?'-h':'-w');
   const size=(vertical?panel.offsetHeight:panel.offsetWidth)+(which==='drawer'?delta:-delta);
   const value=Math.min(vertical?900:Math.max(180,root.clientWidth-250),Math.max(vertical?150:180,size))+'px';
   root.style.setProperty(prop,value);localStorage.setItem(prop,value);
  }
  return h('div',{className:'lc-divider',role:'separator',tabIndex:0,'aria-label':'调整分栏大小',
   onPointerDown:e=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current=[e.clientX,e.clientY];},
   onPointerMove:e=>{if(!drag.current)return;const idx=getComputedStyle(e.currentTarget).cursor==='row-resize'?1:0,point=[e.clientX,e.clientY];change(e.currentTarget,point[idx]-drag.current[idx]);drag.current=point;},
   onPointerUp:()=>drag.current=null,onLostPointerCapture:()=>drag.current=null,
   onKeyDown:e=>{const d={ArrowLeft:-16,ArrowRight:16,ArrowUp:-16,ArrowDown:16}[e.key];if(d){e.preventDefault();change(e.currentTarget,d);}}});
 }
 function Page({rpc,layout}){
  const [links,setLinks]=React.useState([]);
  const root=React.useRef(null);
  React.useLayoutEffect(()=>{for(const col of ['drawer','controls'])for(const dim of ['h','w']){const k='--lc-'+col+'-'+dim;const v=localStorage.getItem(k);if(/^\d+px$/.test(v))root.current.style.setProperty(k,v);}},[]);
  const [visible,setVisible]=React.useState(!document.hidden);
  React.useEffect(()=>{const fn=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',fn);return ()=>document.removeEventListener('visibilitychange',fn);},[]);
  const [livePreview,setLivePreview]=React.useState(()=>localStorage.getItem('lc-live')!=='off'),[stream,setStream]=React.useState(''),[degraded,setDegraded]=React.useState(false);
  const streamClient=React.useRef(crypto.randomUUID()),streamLease=React.useRef(null);
  const [streamError,setStreamError]=React.useState('');
  const [streamAttempt,setAttempt]=React.useState(0);
  const [manual,setManual]=React.useState(0),captured=React.useRef(-1),frameImage=React.useRef(null);

  const [view,setView]=React.useState(null),[error,setError]=React.useState(''),[retry,setRetry]=React.useState(0);
  const [pane,setPane]=React.useState('renderPanel'),[drawer,setDrawer]=React.useState(false),[tab,setTab]=React.useState('param');
  const [launching,setLaunching]=React.useState(false);
  const [actionError,setActionError]=React.useState('');
  const [dependency,setDependency]=React.useState(null);
  const ownedPreparation=React.useRef(null),launchPending=React.useRef(false),mounted=React.useRef(true);
  React.useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;const runId=ownedPreparation.current;if(runId)call(rpc,{op:'launch-cancel',runId},new AbortController().signal).catch(()=>{});};},[rpc]);
  React.useEffect(()=>{
    if(view||!visible)return;
    const ctrl=new AbortController();let timer;
    async function check(){
      try{
        const status=await call(rpc,{op:'dependencies'},ctrl.signal);
        if(ctrl.signal.aborted||launchPending.current)return;
        setDependency(status);
        if(!status.preparing){
          ownedPreparation.current=null;
          setLaunching(!!status.starting);
          if(!status.online&&!status.starting)setError('');
        }
      }
      catch{}finally{if(!ctrl.signal.aborted)timer=setTimeout(check,1000);}
    }
    check();return ()=>{ctrl.abort();clearTimeout(timer);};
  },[rpc,visible,view?.epoch,retry]);
  const queue=React.useRef(Promise.resolve()),live=React.useRef(null),rect=React.useRef(null);
  const wake=React.useRef(null),preview=React.useRef(true);
  React.useEffect(()=>{
   if(!visible||!dependency?.online)return;
   const ctrl=new AbortController();live.current=ctrl;
   if(pane==='assetPanel')call(rpc,{op:'links'},ctrl.signal).then(v=>{if(!ctrl.signal.aborted)setLinks(v);}).catch(()=>{});
   if(pane==='companionPanel')call(rpc,{op:'models'},ctrl.signal).then(models=>{if(models.length&&!ctrl.signal.aborted)return call(rpc,{op:'modelChoices',models},ctrl.signal);}).catch(()=>{});let timer,running=false,again=false,epoch;const revision={current:0};
   async function poll(){
    clearTimeout(timer);if(ctrl.signal.aborted)return;
    if(running){again=true;return;}running=true;
    let delay=1000;
    try{
     await queue.current;
     const next=await call(rpc,{op:'read',preview:captured.current!==manual,pane,drawer,tab,revision:revision.current},ctrl.signal);
     if(!ctrl.signal.aborted){
      setLaunching(false);if(next.preview)captured.current=manual;if(next.unchanged){setError('');return;}
      revision.current=next.revision;preview.current=epoch!==next.epoch&&!next.preview;epoch=next.epoch;
      setView(old=>({...next,preview:next.preview||(old?.epoch===next.epoch?old.preview:null)}));setError('');
      if(next.editing)delay=550;
     }
    }catch(e){if(!ctrl.signal.aborted){setError(e.message);if(e.message.includes('尚未就绪'))setDependency(old=>old&&({...old,online:false}));setView(null);preview.current=true;}delay=1000;}
    finally{running=false;if(!ctrl.signal.aborted){timer=setTimeout(poll,again?0:delay);again=false;}}
   }
   wake.current=poll;poll();return ()=>{ctrl.abort();clearTimeout(timer);wake.current=null;};
  },[rpc,retry,pane,drawer,tab,visible,manual,!!dependency?.online]);
  React.useEffect(()=>{
   setStream('');setDegraded(false);setStreamError('');if(!visible||!livePreview||!view?.ready)return;
   const ctrl=new AbortController();let lease;
   const close=id=>{if(id)call(rpc,{op:'stream-close',clientId:streamClient.current,lease:id}).catch(()=>{});};
   call(rpc,{op:'stream',clientId:streamClient.current}).then(info=>{
    lease=info.lease;
    if(ctrl.signal.aborted){close(lease);return;}
    streamLease.current=lease;setStream(info.url);
   }).catch(e=>{if(!ctrl.signal.aborted){setStreamError(e.message);setDegraded(true);setManual(n=>n+1);}});
   return ()=>{
    ctrl.abort();const img=frameImage.current;if(img&&img.getAttribute('src')?.includes('/preview/'))img.removeAttribute('src');
    close(lease);if(streamLease.current===lease)streamLease.current=null;
   };
  },[visible,livePreview,view?.epoch,view?.ready,rpc,retry,streamAttempt]);
  React.useEffect(()=>{setAttempt(0);},[visible,livePreview,view?.epoch,retry]);
  React.useEffect(()=>{if(!degraded||!livePreview||!visible||streamAttempt)return;const timer=setTimeout(()=>setAttempt(1),3000);return ()=>clearTimeout(timer);},[degraded,livePreview,visible,streamAttempt]);

  React.useEffect(()=>{
   if(!degraded||!streamLease.current)return;
   const lease=streamLease.current;streamLease.current=null;
   call(rpc,{op:'stream-close',clientId:streamClient.current,lease}).catch(()=>{});
  },[degraded,rpc]);
  function previewFailure(fallback){
   const lease=streamLease.current;
   if(lease)call(rpc,{op:'stream-status',clientId:streamClient.current,lease}).then(info=>{
    const labels={'expired-ticket':'预览票据已过期','invalid-ticket':'预览票据无效','host-or-path':'预览主机或路径不匹配',closed:'预览连接已关闭'};
    if(streamLease.current===lease||streamLease.current===null)setStreamError(labels[info.reason]||fallback);
   }).catch(()=>setStreamError(fallback));
   setStreamError(fallback);setDegraded(true);setManual(n=>n+1);
  }
  React.useEffect(()=>{if(!stream||degraded)return;const timer=setTimeout(()=>{if(!frameImage.current?.naturalWidth){previewFailure('等待预览画面超时');}},2000);return ()=>clearTimeout(timer);},[stream,degraded]);
  const act=cmd=>{
   const ctrl=live.current;if(!ctrl||ctrl.signal.aborted)return Promise.resolve(false);
   const task=queue.current.then(async()=>{
    try{await call(rpc,{...cmd,epoch:view?.epoch},ctrl.signal);if(!ctrl.signal.aborted){setActionError('');preview.current=true;}return true;}
    catch(e){if(!ctrl.signal.aborted)setActionError(e.message);return false;}
   });
   queue.current=task;task.then(()=>{if(!ctrl.signal.aborted)wake.current?.();});return task;
  };
  React.useEffect(()=>{
   if(!view?.editing&&!view?.modal)return;
   const modal=root.current?.querySelector('[role=dialog]');
   if(modal&&!modal.contains(document.activeElement))modal.querySelector('button:not(:disabled),input:not(:disabled)')?.focus();
  },[view?.editing,view?.modal,view?.epoch]);
  const editingBefore=React.useRef(false);
  React.useEffect(()=>{if(editingBefore.current&&!view?.editing)setActionError('');editingBefore.current=!!view?.editing;},[view?.editing]);
  function modalKeys(e){
   if(!view?.editing&&!view?.modal)return;
   if(e.key==='Escape'&&view.editing&&!view.modal){
    const close=view.zone?.find(n=>n?.attrs?.['aria-label']==='关闭触摸区域调整');
    if(close){e.preventDefault();act({op:'click',id:close.id});}
   }
   if(e.key==='Tab'){
    const modal=root.current?.querySelector('[role=dialog]');
    const nodes=Array.from(modal?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')||[]).filter(n=>n.getClientRects().length);
    const target=e.shiftKey?nodes.at(-1):nodes[0],edge=e.shiftKey?nodes[0]:nodes.at(-1);
    if(target&&(!modal.contains(document.activeElement)||document.activeElement===edge)){e.preventDefault();target.focus();}
   }
  }
  function point(e,phase){
   if(!view.editing||view.modal)return;
   if(phase==='down'){e.currentTarget.setPointerCapture(e.pointerId);rect.current=e.currentTarget.getBoundingClientRect();}
   const r=rect.current;if(!r)return;
   const clamp=x=>Math.max(0,Math.min(1,x));
   act({op:'point',phase,x:clamp((e.clientX-r.left)/r.width),y:clamp((e.clientY-r.top)/r.height)});
   if(phase==='up')rect.current=null;
  }
  const items=xs=>(xs||[]).map(n=>tree(n,act,view.epoch));
  const button=(name,fn,chosen=false,props={})=>h('button',{key:name,type:'button',onClick:fn,className:chosen?'chosen':'',...props},name);
  const tabs=[['renderPanel','演出与渲染'],['companionPanel','陪伴与连接'],['voicePanel','语音与口型'],['focusPanel','专注模式'],['bubblePanel','对话'],['balancePanel','余额提醒'],['assetPanel','设置']];
  const err=error||actionError;
  const launch=async()=>{
    if(launchPending.current||launching||dependency?.preparing||dependency?.starting)return;launchPending.current=true;
    const runId=crypto.randomUUID();ownedPreparation.current=runId;setLaunching(true);setActionError('');
    try{
      const result=await call(rpc,{op:'launch',runId},new AbortController().signal);
      if(!mounted.current){if(result.runId===runId)await call(rpc,{op:'launch-cancel',runId},new AbortController().signal);return;}
      if(result.runId!==runId)ownedPreparation.current=null;
      if(!result.running)setDependency({phase:'checking',message:'正在检查运行环境…',preparing:true,runId:result.runId});
      setRetry(r=>r+1);
    }catch(e){await call(rpc,{op:'launch-cancel',runId},new AbortController().signal).catch(()=>{});if(ownedPreparation.current===runId)ownedPreparation.current=null;if(mounted.current){setActionError(e.message);setLaunching(false);}}
    finally{launchPending.current=false;}
  };
  const cancelPreparation=async()=>{
    const runId=dependency?.runId||ownedPreparation.current;if(!runId)return;
    try{await call(rpc,{op:'launch-cancel',runId},new AbortController().signal);if(mounted.current){ownedPreparation.current=null;setLaunching(false);setRetry(r=>r+1);}}
    catch(e){if(mounted.current)setActionError(e.message);}
  };
  const copy=async()=>{let renderer;try{renderer=await call(rpc,{op:'diagnostics'});}catch{}const s=[actionError,error,dependency?.message,...(dependency?.issues||[]).map(x=>x.name+' '+x.version+'：'+x.detail+' · '+x.path),dependency?.log&&'依赖日志：'+dependency.log,renderer&&(renderer.historical?'历史版本页面诊断（'+renderer.version+'，当前 '+renderer.currentVersion+'）：\n':'角色页面诊断：\n')+JSON.stringify(renderer,null,2)].filter(Boolean).join('\n')||'Live Character · 待启动';try{await navigator.clipboard.writeText(s);}catch{window.prompt('复制诊断',s);}};
  const offline=!error||error.includes('尚未就绪');
  const banner=view&&err&&h('div',{className:'lc-error',role:'alert'},err);
  const title=h('header',{inert:view?.editing||view?.modal?true:undefined},h(Logo),h('strong',null,'Live Character'),h('small',null,'LIVE2D / '+pluginVersion),view&&button('模型参数',()=>setDrawer(v=>!v),drawer));
  const starting=dependency?.starting||dependency?.online;
  const preparing=launching||dependency?.preparing;
  const welcome=h('section',{className:'lc-welcome'},h('div',{className:'lc-launchcard'},h(Logo),h('h1',null,'Live Character'),h('button',{disabled:preparing||starting,onClick:launch},starting?'正在连接角色…':preparing?'正在准备…':['cancelled','failed','missing'].includes(dependency?.phase)?'检查与修复依赖':'启动角色'),dependency?.preparing&&h('button',{onClick:cancelPreparation,disabled:dependency.cancelPending},dependency.cancelPending?'正在取消…':'取消准备')),h('footer',null,h('span',{role:'status','data-level':actionError||!offline||dependency?.phase==='failed'?'error':dependency?.phase==='missing'?'warning':'normal'},actionError||(offline?(starting?'正在连接角色…':dependency?.message)||(launching?'正在准备角色运行环境…':'角色未启动'):error)),button('复制诊断',copy)));
  const draw=drawer&&view&&!view.modal&&!view.editing&&h('aside',{className:'lc-drawer'},h('nav',null,...[['param','参数'],['expr','表情'],['motion','动作']].map(([id,label])=>button(label,()=>setTab(id),tab===id))),items(view.drawer));
  const previewBox=view&&h('div',{className:'lc-stage'},
    h('div',{className:'lc-meta'},h('span',null,view.state),h('label',null,h('input',{type:'checkbox',checked:livePreview,onChange:e=>{setLivePreview(e.target.checked);localStorage.setItem('lc-live',e.target.checked?'on':'off');if(!e.target.checked)setManual(n=>n+1);}}),'实时预览'),h('span',null,view.fps),degraded&&streamError&&h('span',{'data-level':'warning'},streamError),(!livePreview||degraded)&&button(degraded?'重新连接实时预览':'刷新预览',()=>{setManual(n=>n+1);if(degraded)setAttempt(n=>n+1);})),
    view.ready?h('div',{className:'lc-image'},((stream&&!degraded&&visible&&livePreview)||view.preview)&&h('div',{className:'lc-frame'},
     h('img',{ref:frameImage,alt:'角色预览',src:stream&&!degraded&&visible&&livePreview?stream:view.preview,onError:()=>{if(stream&&!degraded)previewFailure('预览连接中断');},draggable:false,onPointerDown:e=>point(e,'down'),onPointerMove:e=>{if(rect.current)point(e,'move');},onPointerUp:e=>point(e,'up'),onPointerCancel:e=>point(e,'up')}),
     ...(view.boxes||[]).map((b,i)=>h('div',{key:i,className:'lc-box'+(b.selected?' selected':''),style:{left:b.x*100+'%',top:b.y*100+'%',width:b.w*100+'%',height:b.h*100+'%'}},b.name,b.selected&&['nw','ne','sw','se'].map(k=>h('i',{key:k,className:k})))))):
     h('div',{className:'lc-empty'},view.message,items(view.actions)),
    view.ready&&h('div',{className:'lc-stage-actions'},items(view.actions)));
  const panel=view&&h('div',{className:'lc-controls'}, !view.modal&&!view.editing&&h('nav',{className:'lc-settings-tabs','aria-label':'设置分页'},...tabs.map(([id,label])=>button(label,()=>setPane(id),pane===id,{'data-pane':id,'aria-pressed':pane===id}))),
    view.chat&&h(Chat,{key:view.epoch,state:view.chat,act,rpc}),items(view.fields),pane==='assetPanel'&&links.length>0&&h('div',{className:'actions'},...links.map(link=>button(link.title,()=>{try{layout.selectPanel(link.panelKey);}catch{setActionError('目标插件面板尚未加载');}}))),view.editing&&items(view.zone));
  return h('div',{className:'lc-page',ref:root,onKeyDown:modalKeys},h('style',null,styles),title,banner,
   view?h('div',{className:'lc-workspace'+(view.editing||view.modal?' lc-modal-workspace':''),role:view.editing||view.modal?'dialog':undefined,'aria-modal':view.editing||view.modal?true:undefined},draw,draw&&h(Divider,{which:'drawer'}),h('section',{className:'lc-preview'},previewBox,h('footer',null,h('b',null,view.credit||'未导入角色'),h('div',{'data-level':view.level},view.status))),h(Divider,{which:'controls'}),panel):welcome);
 }
 return {inject:['slots','connection','layout'],apply(ctx){
  const rpc=ctx.connection.rpc;
  const Settings=()=>h(Page,{rpc,layout:ctx.layout});
  const layout=ctx.layout;
  ctx.effect(()=>{
   const ctrl=new AbortController();let timer,seen=0,navigating=false;
   async function listen(){
    if(navigating||document.hidden||!document.hasFocus())return;navigating=true;
    try{const {sequence}=await call(rpc,{op:'navigation'},ctrl.signal);
     if(!ctrl.signal.aborted&&sequence>seen&&Date.now()-sequence<45000){layout.selectPanel('live-character.settings');seen=sequence;window.focus();}
    }catch{}finally{navigating=false;if(!ctrl.signal.aborted)timer=setTimeout(listen,document.hidden?10000:3000);}
   }
   const resume=()=>{clearTimeout(timer);listen();};window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);listen();return ()=>{ctrl.abort();clearTimeout(timer);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
  },'Live Character navigation');
  ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'live-character.settings'},Settings));
  ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:'live-character.settings',order:12,label:()=>'Live Character'},Logo));
 }};
}});
