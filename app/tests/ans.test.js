const test = require('node:test');
const assert = require('node:assert');
const { startAnsTest } = require('../www/ans.js');

const params = {
    bearer: 'tok',
    email: 'jan@student.be',
    assignmentId: 42,
    openDatetime: '2026-10-02T10:00',
    deadlineDatetime: '2026-10-02T10:15',
    duration: 10
};

function mockFetch(routes) {
    const calls = [];
    const fn = async (url, init) => {
        const path = url.replace('https://ans.app/api/v2', '');
        calls.push({ method: init.method, path: decodeURIComponent(path), body: init.body && JSON.parse(init.body), headers: init.headers });
        for (const [key, reply] of Object.entries(routes)) {
            if (`${init.method} ${decodeURIComponent(path)}`.startsWith(key)) {
                const status = reply.status || 200;
                return { ok: status < 400, status, text: async () => (reply.body === undefined ? '' : JSON.stringify(reply.body)) };
            }
        }
        throw new Error('unmocked ' + init.method + ' ' + path);
    };
    return { fn, calls };
}

test('existing group: deletes stale timeslots then creates a new one', async () => {
    const { fn, calls } = mockFetch({
        'GET /assignments/42': { body: { course_id: 7 } },
        'GET /search/users': { body: [{ id: 99 }] },
        'GET /search/groups': { body: [{ id: 5 }] },
        'GET /search/timeslots': { body: [{ id: 11 }, { id: 12 }] },
        'DELETE /timeslots/': { status: 204 },
        'POST /assignments/42/timeslots': { body: { id: 1 } }
    });
    const result = await startAnsTest(params, { fetch: fn });
    assert.deepStrictEqual(result, { groupId: 5, courseId: 7, userId: 99 });
    assert.deepStrictEqual(calls.map(c => c.method + ' ' + c.path.split('?')[0]), [
        'GET /assignments/42', 'GET /search/users', 'GET /search/groups', 'GET /search/timeslots',
        'DELETE /timeslots/11', 'DELETE /timeslots/12', 'POST /assignments/42/timeslots'
    ]);
    assert.ok(calls[2].path.includes('name:"jan@student.be-7"'));
    assert.ok(calls[3].path.includes('external_id:"5-7-42"'));
    const slot = calls[calls.length - 1].body;
    assert.deepStrictEqual(slot, {
        open_datetime: '2026-10-02T10:00', deadline_datetime: '2026-10-02T10:15', duration: 10,
        group_id: 5, with_extra_time: false, external_id: '5-7-42'
    });
    assert.strictEqual(calls[0].headers.Authorization, 'Bearer tok');
});

test('no group yet: creates group, adds user, creates timeslot', async () => {
    const { fn, calls } = mockFetch({
        'GET /assignments/42': { body: { course_id: 7 } },
        'GET /search/users': { body: [{ id: 99 }] },
        'GET /search/groups': { body: [] },
        'POST /courses/7/groups': { body: { id: 8 } },
        'POST /groups/8/groups_users': { body: {} },
        'POST /assignments/42/timeslots': { body: { id: 1 } }
    });
    await startAnsTest(params, { fetch: fn });
    assert.deepStrictEqual(calls.map(c => c.method + ' ' + c.path.split('?')[0]), [
        'GET /assignments/42', 'GET /search/users', 'GET /search/groups',
        'POST /courses/7/groups', 'POST /groups/8/groups_users', 'POST /assignments/42/timeslots'
    ]);
    assert.deepStrictEqual(calls[3].body, {
        name: 'jan@student.be-7', user_ids: [], can_start_assignment: true, learners_can_leave_group: false
    });
    assert.deepStrictEqual(calls[4].body, { user_id: 99 });
    assert.strictEqual(calls[5].body.external_id, '8-7-42');
});

test('unknown student fails instead of silently doing nothing', async () => {
    const { fn } = mockFetch({
        'GET /assignments/42': { body: { course_id: 7 } },
        'GET /search/users': { body: [] }
    });
    await assert.rejects(startAnsTest(params, { fetch: fn }), /No ANS user found/);
});

test('HTTP errors surface status and body', async () => {
    const { fn } = mockFetch({ 'GET /assignments/42': { status: 401, body: { error: 'nope' } } });
    await assert.rejects(startAnsTest(params, { fetch: fn }), /HTTP 401.*nope/);
});
