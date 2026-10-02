// Port of the "ANS Start Test" Power Automate flow. Schedules a test for one
// student by giving them a personal 1-person group per course and a timeslot.
// Runs in the app with CapacitorHttp enabled (native HTTP, no CORS).
(function (root) {
    const BASE = 'https://ans.app/api/v2';

    async function startAnsTest(params, options) {
        const { bearer, email, assignmentId, openDatetime, deadlineDatetime, duration } = params;
        const fetchImpl = (options && options.fetch) || root.fetch.bind(root);
        const log = (options && options.log) || function () {};

        async function request(method, path, body) {
            const url = BASE + path;
            log(`${method} ${path}`);
            const headers = { Authorization: 'Bearer ' + bearer, Accept: 'application/json' };
            const init = { method, headers };
            if (body !== undefined) {
                headers['Content-Type'] = 'application/json';
                init.body = JSON.stringify(body);
            }
            const res = await fetchImpl(url, init);
            const text = await res.text();
            if (!res.ok) {
                throw new Error(`${method} ${path} failed: HTTP ${res.status} ${text.slice(0, 300)}`);
            }
            return text ? JSON.parse(text) : null;
        }

        const search = (resource, query) =>
            request('GET', `/search/${resource}?limit=${resource === 'timeslots' ? 20 : 1}&page=1&query=${encodeURIComponent(query)}`);

        const assignment = await request('GET', `/assignments/${assignmentId}`);
        const courseId = assignment.course_id;

        const users = await search('users', `email:"${email}"`);
        if (!users.length) {
            throw new Error(`No ANS user found with email ${email}`);
        }
        const userId = users[0].id;

        const groupName = `${email}-${courseId}`;
        const groups = await search('groups', `name:"${groupName}"`);

        let groupId;
        if (groups.length) {
            groupId = groups[0].id;
            log(`Existing group ${groupId}, replacing old timeslots`);
            const stale = await search('timeslots', `external_id:"${groupId}-${courseId}-${assignmentId}"`);
            for (const slot of stale) {
                await request('DELETE', `/timeslots/${slot.id}`);
            }
        } else {
            const group = await request('POST', `/courses/${courseId}/groups`, {
                name: groupName,
                user_ids: [],
                can_start_assignment: true,
                learners_can_leave_group: false
            });
            groupId = group.id;
            log(`Created group ${groupId}`);
            await request('POST', `/groups/${groupId}/groups_users`, { user_id: userId });
        }

        await request('POST', `/assignments/${assignmentId}/timeslots`, {
            open_datetime: openDatetime,
            deadline_datetime: deadlineDatetime,
            duration: duration,
            group_id: groupId,
            with_extra_time: false,
            external_id: `${groupId}-${courseId}-${assignmentId}`
        });
        log('Timeslot created');
        return { groupId, courseId, userId };
    }

    const api = { startAnsTest };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.AnsApi = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
