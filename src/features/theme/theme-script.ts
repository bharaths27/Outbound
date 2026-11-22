// Server-safe (no React): the key and the <head> script that applies a saved dark theme before first paint.
export const THEME_KEY = "outbound.theme";
export const THEME_SCRIPT = `try{if(localStorage.getItem("${THEME_KEY}")==="dark"){document.documentElement.dataset.theme="dark";document.documentElement.style.colorScheme="dark"}}catch(e){}`;
