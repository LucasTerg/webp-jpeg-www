/* empty css                      */(function(){const r=document.createElement("link").relList;if(r&&r.supports&&r.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))o(e);new MutationObserver(e=>{for(const t of e)if(t.type==="childList")for(const i of t.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&o(i)}).observe(document,{childList:!0,subtree:!0});function n(e){const t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?t.credentials="include":e.crossOrigin==="anonymous"?t.credentials="omit":t.credentials="same-origin",t}function o(e){if(e.ep)return;e.ep=!0;const t=n(e);fetch(e.href,t)}})();async function c(){const a=document.querySelectorAll("[data-load]");for(const r of a){const n=r.getAttribute("src");if(n)try{const o=await fetch(n);if(!o.ok){console.error(`Nie udało się załadować ${n}: ${o.status}`),r.innerHTML=`<p>Błąd ładowania: ${n}</p>`;continue}const e=await o.text();r.innerHTML=e;const t=r.getAttribute("data-icon-path");if(t){const i=r.querySelector("[data-icon]");i&&i.setAttribute("src",t)}}catch(o){console.error(`Błąd ładowania ${n}:`,o),r.innerHTML=`<p>Błąd ładowania: ${n}</p>`}}}document.addEventListener("DOMContentLoaded",c);document.getElementById("upload-form").addEventListener("submit",async a=>{a.preventDefault();const r=document.getElementById("file-input");if(!r.files.length){alert("Proszę wybrać zdjęcia!");return}const n=new FormData;Array.from(r.files).forEach(o=>n.append("images",o));try{const o=await fetch("http://localhost:3000/upload",{method:"POST",body:n});if(o.ok){const e=await o.blob(),t=document.getElementById("download-link");t.href=URL.createObjectURL(e),t.style.display="inline-block",t.textContent="Pobierz spakowane zdjęcia",t.download="cropped_images.zip"}else alert("Wystąpił błąd podczas przetwarzania zdjęć.")}catch(o){console.error("Błąd:",o),alert("Nie udało się połączyć z serwerem.")}});
//# sourceMappingURL=index.js.map