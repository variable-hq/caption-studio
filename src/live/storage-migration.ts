/**
 * One-time move of browser storage from the product's former `church-live-caption:` key
 * prefix to `caption-studio:`. Inlined into the root layout so it runs before any page
 * script reads storage; that keeps every reader on the new keys without a fallback.
 *
 * For each legacy key in localStorage and sessionStorage: copy it to the new key unless
 * the new key already holds a value (a newer write wins), then remove the legacy key.
 * Storage errors (private mode, blocked storage) leave both keys untouched.
 */

export const STORAGE_KEY_PREFIX = "caption-studio:";
export const LEGACY_STORAGE_KEY_PREFIX = "church-live-caption:";

export const STORAGE_MIGRATION_SCRIPT = `["localStorage","sessionStorage"].forEach(function(n){try{var s=window[n],o=${JSON.stringify(LEGACY_STORAGE_KEY_PREFIX)},k=[],i,x,t;for(i=0;i<s.length;i++){x=s.key(i);if(x&&x.indexOf(o)===0)k.push(x)}k.forEach(function(x){t=${JSON.stringify(STORAGE_KEY_PREFIX)}+x.slice(o.length);if(s.getItem(t)===null)s.setItem(t,s.getItem(x));s.removeItem(x)})}catch(e){}});`;
