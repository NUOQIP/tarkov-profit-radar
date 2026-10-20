import code from '../style.css?raw';
export function GET(){ return new Response(code,{headers:{'Content-Type':'text/css; charset=utf-8','Cache-Control':'no-cache'}}); }
