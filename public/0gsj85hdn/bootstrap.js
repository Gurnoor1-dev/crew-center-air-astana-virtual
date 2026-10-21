(function () {
  'use strict';

  const API = 'https://huqvffdiwqilbpxepfpo.supabase.co/functions/v1/crew-center';
  window.AMV = { refresh: function () {} };
  window.AMV_DATA = {};

  window.AMV_CREW = {
    pireps: async function (options) {
      try {
        const session = sessionStorage.getItem('aav_crew_session');
        if (!session) return [];
        const response = await fetch(API + '?action=pireps', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + session,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(options || { limit: 24 })
        });
        const data = await response.json();
        return Array.isArray(data.pireps) ? data.pireps : (Array.isArray(data.rows) ? data.rows : []);
      } catch (_) {
        return [];
      }
    }
  };
})();
