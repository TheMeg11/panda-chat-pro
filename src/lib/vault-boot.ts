/**
 * Shared between server (inline boot script) and client (vault) — no "use client"
 * here on purpose so server components can import the constants directly.
 */
export const VAULT_KEY = "pc-vault";

/** Hides vault rooms before first paint so they never flash while loading. */
export const HIDE_BOOT_SCRIPT = `(function(){try{var v=JSON.parse(localStorage.getItem('${VAULT_KEY}')||'null');if(v&&v.ids){var ids=Object.keys(v.ids);if(ids.length){var sel='';for(var i=0;i<ids.length;i++){if(/^[0-9a-f-]{36}$/.test(ids[i]))sel+='[data-room-id="'+ids[i]+'"],';}sel=sel.slice(0,-1);if(sel){var st=document.createElement('style');st.setAttribute('data-pc-hidden','');st.textContent=sel+'{display:none !important}';document.head.appendChild(st);}}}}catch(_){}})();`;
