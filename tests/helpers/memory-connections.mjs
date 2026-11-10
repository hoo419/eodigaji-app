import assert from 'node:assert/strict';
export function memoryConnections() {
  const tables = new Map();
  return {
    publicConfig: () => ({ auth: true, ai: false, places: false, map: false }),
    auth: async (action, d) => action === 'logout' ? {} : ({ access_token: d.email, refresh_token: 'refresh', user: { id: d.email, email: d.email } }),
    database: async (table, method, token, query = '', body) => {
      const rows = tables.get(table) || []; tables.set(table, rows);
      const params = new URLSearchParams(query.replace(/^\?/, ''));
      const user = params.get('user_id')?.slice(3);
      const course = params.get('course_id')?.slice(3);
      if (method === 'GET') return rows.filter(r => r.user_id === token && (!user || r.user_id === user) && (!course || r.course_id === course));
      if (method === 'DELETE') { tables.set(table, rows.filter(r => !(r.user_id === token && (!course || r.course_id === course)))); return []; }
      assert.equal(body.user_id, token);
      const i = rows.findIndex(r => table === 'shared_courses' ? r.id === body.id : r.user_id === body.user_id && r.course_id === body.course_id);
      if (i >= 0) rows[i] = structuredClone(body); else rows.push(structuredClone(body));
      return [body];
    },
    readShare: async id => structuredClone((tables.get('shared_courses') || []).find(r => r.id === id)?.data || null),
  };
}
