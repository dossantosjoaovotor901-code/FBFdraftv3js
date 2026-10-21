/* ===== FBF - Icones SVG (substituem emojis) ===== */
(function(){
  'use strict';
  var P = {
    home:'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
    trophy:'M7 4h10v3a5 5 0 0 1-10 0zM5 5H3v2a4 4 0 0 0 4 4M19 5h2v2a4 4 0 0 1-4 4M10 15h4l1 5H9zM8 21h8',
    gift:'M4 10h16v11H4zM2 6h20v4H2zM12 6v15M12 6C12 3 9 2 8 4s1 2 4 2zM12 6c0-3 3-4 4-2s-1 2-4 2z',
    cards:'M4 5h11v14H4zM8 3h11v14',
    ball:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 7l3 2-1 4h-4L9 9z',
    menu:'M3 6h18M3 12h18M3 18h18',
    close:'M6 6l12 12M18 6L6 18',
    user:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6',
    star:'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
    coin:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5v10m3-8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9',
    shield:'M12 2l8 3v7c0 5-3 8-8 10-5-2-8-5-8-10V5z',
    chart:'M4 20V10M10 20V4M16 20v-7M22 20H2',
    cog:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM3 12h2m14 0h2M12 3v2m0 14v2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19',
    plus:'M12 5v14M5 12h14',
    check:'M20 6L9 17l-5-5',
    trash:'M4 7h16M9 7V5h6v2M6 7l1 14h10l1-14',
    edit:'M4 20h4L20 8l-4-4L4 16zM14 6l4 4',
    sound:'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8 8 0 0 1 0 12',
    music:'M9 18V5l10-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'
  };
  window.FBF_icon = function(name, cls){
    var d = P[name]; if (!d) return '';
    return '<svg class="ic '+(cls||'')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"/></svg>';
  };
  // Preenche os espacos [data-icon]
  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('[data-icon]').forEach(function(n){
      n.innerHTML = window.FBF_icon(n.getAttribute('data-icon'));
    });
  });
})();
