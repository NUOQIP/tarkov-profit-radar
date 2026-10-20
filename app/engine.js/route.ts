import code from '../model.mjs?raw';
export function GET(){ return new Response(code,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-cache'}}); }
