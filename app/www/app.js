const APP_VERSION = '2026-10-02 20:23'; // Build timestamp. Set to the current date and time when releasing.
const ANS_BEARER_KEY = 'ans_bearer_token';
const MAX_DEBUG_ENTRIES = 100;

let scanner = null;

const $ = (id) => document.getElementById(id);

function logDebug(message) {
    console.log(message);
    const logDiv = $('debugLog');
    while (logDiv.children.length >= MAX_DEBUG_ENTRIES) {
        logDiv.removeChild(logDiv.firstChild);
    }
    const entry = document.createElement('div');
    entry.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

function showResult(message, isSuccess) {
    const box = $('result');
    box.textContent = message;
    box.className = 'result show ' + (isSuccess ? 'success' : 'error');
}

function hideResult() {
    $('result').className = 'result';
}

function formatDatetimeLocal(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function stopScanner() {
    if (scanner && scanner.isScanning) {
        try {
            await scanner.stop();
            scanner.clear();
        } catch (err) {
            logDebug('Error stopping camera scanner: ' + err);
        }
    }
}

async function startScanner() {
    hideResult();
    $('ansForm').style.display = 'none';
    $('startScan').style.display = 'none';
    $('reader').style.display = 'block';
    await stopScanner();
    logDebug('Initializing QR camera scanner...');
    scanner = new Html5Qrcode('reader');
    try {
        await scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 200, height: 200 } },
            onScanSuccess,
            () => {}
        );
        logDebug('Camera scanner started - ready to scan');
    } catch (err) {
        logDebug('Camera scanner failed to start: ' + err);
        showResult('Failed to start camera: ' + err, false);
        $('startScan').style.display = 'block';
    }
}

async function onScanSuccess(decodedText) {
    await stopScanner();
    $('reader').style.display = 'none';
    $('startScan').style.display = 'block';
    $('startScan').textContent = 'Scan Another';

    let data;
    try {
        data = JSON.parse(decodedText);
    } catch (e) {
        logDebug('QR parse error: ' + e.message);
        showResult('Invalid QR code format. Please try again.', false);
        return;
    }
    logDebug('QR scanned');

    if (!data.ans) {
        showResult('This QR code has no ANS data. Orion grading is not supported in the app yet.', false);
        return;
    }

    $('ans_studentEmail').value = data.studentEmail || data.email || '';
    $('ans_assignmentId').value = data.ans.assignment_id;
    $('ans_deadline').value = data.ans.deadline;
    $('ans_duration').value = data.ans.duration;
    $('ans_ioem').value = data.ans.ioem;

    const now = new Date();
    $('ans_openDatetime').value = formatDatetimeLocal(now);
    $('ans_deadlineDatetime').value = formatDatetimeLocal(new Date(now.getTime() + data.ans.deadline * 60 * 1000));
    $('ansForm').style.display = 'block';
}

async function submitAns() {
    const bearer = localStorage.getItem(ANS_BEARER_KEY) || '';
    const email = $('ans_studentEmail').value;
    const assignmentId = parseInt($('ans_assignmentId').value, 10);
    const openDatetime = $('ans_openDatetime').value;
    const deadlineDatetime = $('ans_deadlineDatetime').value;
    const duration = parseInt($('ans_duration').value, 10);

    if (!bearer) {
        $('settings').open = true;
        showResult('Set the ANS Bearer Token under Settings first.', false);
        return;
    }
    if (!email || !openDatetime || !deadlineDatetime || isNaN(assignmentId) || isNaN(duration)) {
        showResult('Please fill in all required fields', false);
        return;
    }

    hideResult();
    $('submitAns').disabled = true;
    logDebug(`Starting ANS test for ${email}, assignment ${assignmentId}`);
    try {
        await AnsApi.startAnsTest(
            { bearer, email, assignmentId, openDatetime, deadlineDatetime, duration },
            { log: logDebug }
        );
        showResult('ANS test started for ' + email, true);
    } catch (err) {
        logDebug('ANS error: ' + err.message);
        showResult('Error: ' + err.message, false);
    } finally {
        $('submitAns').disabled = false;
    }
}

function saveSettings() {
    const value = $('settings_ansBearer').value.trim();
    if (value) {
        localStorage.setItem(ANS_BEARER_KEY, value);
    } else {
        localStorage.removeItem(ANS_BEARER_KEY);
    }
    logDebug('Settings saved');
    showResult('Settings saved.', true);
}

window.addEventListener('load', () => {
    $('version').textContent = 'Build ' + APP_VERSION;
    $('settings_ansBearer').value = localStorage.getItem(ANS_BEARER_KEY) || '';
    if (!localStorage.getItem(ANS_BEARER_KEY)) {
        $('settings').open = true;
    }
    $('startScan').addEventListener('click', startScanner);
    $('submitAns').addEventListener('click', submitAns);
    $('saveSettings').addEventListener('click', saveSettings);
    $('clearLog').addEventListener('click', () => { $('debugLog').innerHTML = ''; });
    logDebug('Page loaded - Build ' + APP_VERSION);
});
