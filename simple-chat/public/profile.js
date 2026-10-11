const chatProfile = (() => {
    if (!localStorage.getItem('userId')) localStorage.setItem('userId', crypto.randomUUID());
    if (!localStorage.getItem('username')) localStorage.setItem('username', `User${Math.floor(Math.random() * 1000)}`);
    let account = null;
    let dialog;
    let mode = 'profile';
    let busy = false;
    let serviceError = '';
    let lastSessionCheck = Date.now();
    let refreshing = false;

    const applySession = result => {
        account = result.account;
        const saved = localStorage.getItem('groups') || '';
        const existing = new Set(saved.split(','));
        const additional = [...new Set(result.rooms || [])]
            .filter(room => typeof room === 'string' && /^[a-z0-9]+$/.test(room) && !existing.has(room));
        if (additional.length) localStorage.setItem('groups', `${saved}${saved && !saved.endsWith(',') ? ',' : ''}${additional.join(',')}`);
    };
    const ready = fetch('/auth/me', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
        .then(async response => {
            if (!response.ok) throw new Error('Account service is unavailable.');
            applySession(await response.json());
        }).catch(() => { serviceError = 'Account service is unavailable. Guest profiles still work.'; });

    const api = async (path, body) => {
        const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to update profile.');
        return result;
    };
    const getUserId = () => account?.id || localStorage.getItem('userId');
    const getUsername = () => account?.username || localStorage.getItem('username');

    const refreshSession = async () => {
        if (refreshing || document.hidden || !account || Date.now() - lastSessionCheck < 6 * 60 * 60 * 1000) return;
        refreshing = true;
        try {
            const response = await fetch('/auth/me', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
            if (!response.ok) return;
            const previousId = account.id;
            applySession(await response.json());
            lastSessionCheck = Date.now();
            if (account?.id !== previousId) window.location.reload();
        } catch {} finally { refreshing = false; }
    };
    window.addEventListener('focus', refreshSession);
    document.addEventListener('visibilitychange', refreshSession);
    setInterval(refreshSession, 6 * 60 * 60 * 1000);

    const render = () => {
        const signedIn = Boolean(account);
        dialog.querySelector('#profile-heading').textContent = signedIn ? 'Your account' : 'Your profile';
        dialog.querySelector('#profile-state').textContent = signedIn ? `Logged in as ${account.login}` : 'Saved on this device';
        dialog.querySelector('#profile-tabs').hidden = signedIn;
        dialog.querySelectorAll('[data-profile-mode]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.profileMode === mode));
        });
        const name = dialog.querySelector('#profile-name');
        const email = dialog.querySelector('#profile-email');
        const login = dialog.querySelector('#profile-login');
        const password = dialog.querySelector('#profile-password');
        name.closest('label').hidden = mode === 'login';
        email.closest('label').hidden = mode === 'login';
        login.closest('label').hidden = mode === 'profile' && !signedIn;
        login.readOnly = signedIn;
        login.required = mode !== 'profile';
        password.closest('label').hidden = mode === 'profile';
        password.required = mode !== 'profile';
        password.minLength = mode === 'register' ? 12 : 1;
        password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
        name.required = mode !== 'login';
        for (const field of [name, email, login, password]) field.disabled = field.closest('label').hidden;
        dialog.querySelector('#profile-save').textContent = mode === 'login' ? 'Log in' : mode === 'register' ? 'Set password' : 'Save profile';
        dialog.querySelector('#profile-logout').hidden = !signedIn;
        dialog.querySelector('#profile-error').textContent = serviceError;
    };

    const createDialog = () => {
        dialog = document.createElement('dialog');
        dialog.id = 'profile-dialog';
        dialog.setAttribute('aria-labelledby', 'profile-heading');
        dialog.innerHTML = `
            <header class="profile-header"><div><h2 id="profile-heading">Your profile</h2><p id="profile-state">Guest</p></div>
                <button type="button" id="profile-close" title="Close profile" aria-label="Close profile"><i data-lucide="x" aria-hidden="true"></i></button></header>
            <div id="profile-tabs" role="group" aria-label="Profile mode">
                <button type="button" data-profile-mode="profile" aria-pressed="true">Profile</button>
                <button type="button" data-profile-mode="register" aria-pressed="false">Set password</button>
                <button type="button" data-profile-mode="login" aria-pressed="false">Log in</button>
            </div>
            <form id="profile-form">
                <label>Display name<input id="profile-name" autocomplete="nickname" maxlength="100"></label>
                <label>Email (optional)<input id="profile-email" type="email" autocomplete="email" maxlength="254"></label>
                <label>Login name<input id="profile-login" autocomplete="username" pattern="[a-zA-Z0-9_]{3,32}" maxlength="32" aria-describedby="profile-login-hint"><small id="profile-login-hint">3-32 letters, numbers or underscores</small></label>
                <label>Password<input id="profile-password" type="password" maxlength="256" aria-describedby="profile-password-hint"><small id="profile-password-hint">At least 12 characters when setting a password</small></label>
                <p id="profile-error" role="status" aria-live="polite"></p>
                <div class="profile-footer"><button id="profile-save" type="submit">Save profile</button>
                    <button id="profile-logout" type="button" hidden>Log out</button></div>
            </form>`;
        document.body.appendChild(dialog);
        lucide.createIcons();
        dialog.querySelector('#profile-close').addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => { dialog.querySelector('#profile-password').value = ''; });
        dialog.addEventListener('click', event => {
            const bounds = dialog.getBoundingClientRect();
            if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right ||
                event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
        });
        dialog.querySelectorAll('[data-profile-mode]').forEach(button => button.addEventListener('click', () => {
            mode = button.dataset.profileMode;
            dialog.querySelector('#profile-password').value = '';
            render();
        }));
        const setBusy = value => {
            busy = value;
            dialog.querySelectorAll('button').forEach(button => { button.disabled = value; });
        };
        dialog.querySelector('#profile-form').addEventListener('submit', async event => {
            event.preventDefault();
            if (busy) return;
            const username = dialog.querySelector('#profile-name').value.trim();
            const email = dialog.querySelector('#profile-email').value.trim();
            const login = dialog.querySelector('#profile-login').value;
            const password = dialog.querySelector('#profile-password').value;
            setBusy(true);
            dialog.querySelector('#profile-error').textContent = '';
            try {
                if (mode === 'profile' && !account) {
                    if (!username) throw new Error('Enter a display name.');
                    localStorage.setItem('username', username);
                    localStorage.setItem('profileEmail', email);
                    document.dispatchEvent(new Event('username-changed'));
                    document.dispatchEvent(new Event('profile-changed'));
                    dialog.close();
                } else {
                    const path = mode === 'login' ? '/auth/login' : mode === 'register' ? '/auth/register' : '/auth/profile';
                    const result = await api(path, { username, email, login, password });
                    applySession(result);
                    localStorage.setItem('accountChange', crypto.randomUUID());
                    window.location.reload();
                }
            } catch (error) {
                dialog.querySelector('#profile-error').textContent = error.name === 'TimeoutError'
                    ? 'Account request timed out. Try again.' : error.message;
            } finally { setBusy(false); }
        });
        dialog.querySelector('#profile-logout').addEventListener('click', async () => {
            if (busy) return;
            setBusy(true);
            try {
                await api('/auth/logout', {});
                localStorage.setItem('accountChange', crypto.randomUUID());
                window.location.reload();
            } catch (error) { dialog.querySelector('#profile-error').textContent = error.message; }
            finally { setBusy(false); }
        });
    };

    const open = async (selectedMode = 'profile') => {
        await ready;
        document.getElementById('menu-modal')?.close();
        if (!dialog) createDialog();
        mode = account ? 'profile' : selectedMode;
        dialog.querySelector('#profile-name').value = getUsername();
        dialog.querySelector('#profile-email').value = account?.email || localStorage.getItem('profileEmail') || '';
        const guestName = localStorage.getItem('username') || '';
        dialog.querySelector('#profile-login').value = account?.login || (/^[a-zA-Z0-9_]{3,32}$/.test(guestName) ? guestName : '');
        dialog.querySelector('#profile-password').value = '';
        render();
        dialog.showModal();
    };
    window.addEventListener('storage', event => { if (event.key === 'accountChange') window.location.reload(); });
    return { ready, getUserId, getUsername, open, isLoggedIn: () => Boolean(account) };
})();