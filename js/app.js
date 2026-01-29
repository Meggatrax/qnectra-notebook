
// Initialize Supabase Client
const SUPABASE_URL = "https://ysfejltspyzpahqeorgt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_topKCVKmrlcOXV28eij8eA_h4b67cF4";

let supabase;

try {
    if (window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        console.error("Supabase SDK not loaded from CDN");
    }
} catch (e) {
    console.error("Supabase init failed", e);
}

// State
let appState = {
    dashboards: [],
    userState: {}, // map of dashboard_id -> { is_read, is_archived }
    user: null,
    showingArchive: false
};

// DOM Elements
const ui = {
    fileList: document.getElementById("file-list"),
    fileCount: document.getElementById("file-count"),
    archiveBtn: document.getElementById("archive-button"),
    archiveView: document.getElementById("archive-view"),
    contentIframe: document.getElementById("content-iframe"),
    emptyStateMain: document.getElementById("empty-state-main"),
    emptyStateSidebar: document.getElementById("empty-state-sidebar"),
    contentTitle: document.getElementById("content-title"),
    authContainer: document.getElementById("auth-container"),
    authBtn: document.getElementById("auth-button"),
    loginModal: document.getElementById("login-modal"),
    emailInput: document.getElementById("email-input"),
    sendMagicLinkBtn: document.getElementById("send-magic-link"),
    loginStatus: document.getElementById("login-status")
};

// --- AUTHENTICATION ---

async function checkUser() {
    if (!supabase) return;

    // Safety check for session
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            console.warn("Session check error", error);
            return;
        }
        appState.user = data.session?.user || null;
    } catch (e) {
        console.warn("Auth check failed", e);
    }

    updateAuthUI(); // Always update UI state

    if (appState.user) {
        await fetchUserStates();
        render(); // Re-render to show correct archived/read status
    }
}

function updateAuthUI() {
    if (appState.user) {
        ui.authBtn.textContent = "Sign Out";
        ui.authBtn.onclick = handleSignOut;
    } else {
        ui.authBtn.textContent = "Sign In (Sync)";
        // Re-bind the modal trigger just in case
        ui.authBtn.onclick = () => ui.loginModal.style.display = "flex";
    }
}

async function handleLogin() {
    const email = ui.emailInput.value;
    if (!email) return;

    ui.loginStatus.textContent = "Sending link...";
    const { error } = await supabase.auth.signInWithOtp({ email });

    if (error) {
        ui.loginStatus.textContent = "Error: " + error.message;
        ui.loginStatus.style.color = "red";
    } else {
        ui.loginStatus.textContent = "Check your email for the magic link!";
        ui.loginStatus.style.color = "#4ade80";
    }
}

async function handleSignOut() {
    await supabase.auth.signOut();
    appState.user = null;
    appState.userState = {};
    updateAuthUI();
    render();
}

// --- DATA FETCHING ---

async function fetchDashboards() {
    if (!supabase) {
        ui.fileCount.innerHTML = "Config Error";
        return;
    }

    ui.fileCount.innerHTML = "Loading...";

    const { data: dashboards, error } = await supabase
        .from('dashboards')
        .select('id, title, updated_at, tags')
        .order('updated_at', { ascending: false });

    if (error) {
        console.error("Error fetching dashboards", error);
        ui.fileCount.innerHTML = "Error loading";
        return;
    }

    appState.dashboards = dashboards;
    render();
}

async function fetchUserStates() {
    if (!appState.user || !supabase) return;

    const { data: states, error } = await supabase
        .from('user_states')
        .select('dashboard_id, is_read, is_archived')
        .eq('user_id', appState.user.id);

    if (states) {
        appState.userState = states.reduce((acc, curr) => {
            acc[curr.dashboard_id] = curr;
            return acc;
        }, {});
    }
}

async function loadDashboardContent(id) {
    if (!supabase) return;

    const { data, error } = await supabase
        .from('dashboards')
        .select('content, title')
        .eq('id', id)
        .single();

    if (data) {
        ui.contentTitle.textContent = data.title;
        // Inject content into IFrame
        const doc = ui.contentIframe.contentWindow.document;
        doc.open();
        doc.write(data.content);
        doc.close();

        ui.contentIframe.style.display = "block";
        ui.emptyStateMain.style.display = "none";
        ui.archiveView.style.display = "none";

        // Mark as active in UI
        document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
        const activeEl = document.querySelector(`[data-id="${id}"]`);
        if (activeEl) activeEl.classList.add('active');

        // Mark as Read if logged in
        if (appState.user) {
            markAsRead(id);
        }
    }
}

async function markAsArchived(id, isArchived) {
    if (!appState.user) {
        alert("Please sign in to sync archives.");
        render(); // Revert checkbox
        return;
    }

    // Optimistic Update
    if (!appState.userState[id]) appState.userState[id] = {};
    appState.userState[id].is_archived = isArchived;
    render(); // Re-render to remove from list

    const { error } = await supabase
        .from('user_states')
        .upsert({
            user_id: appState.user.id,
            dashboard_id: id,
            is_archived: isArchived
        });
}

async function markAsRead(id) {
    if (!appState.userState[id]?.is_read) {
        await supabase
            .from('user_states')
            .upsert({
                user_id: appState.user.id,
                dashboard_id: id,
                is_read: true
            });
    }
}


// --- RENDERING ---

function render() {
    const list = appState.dashboards.filter(d => {
        const state = appState.userState[d.id];
        const isArchived = state?.is_archived || false;
        return appState.showingArchive ? isArchived : !isArchived;
    });

    renderList(list, ui.fileList);

    // Empty State Logic
    if (list.length === 0) {
        ui.fileList.style.display = 'none';
        ui.emptyStateSidebar.style.display = 'block';
    } else {
        ui.fileList.style.display = 'flex';
        ui.emptyStateSidebar.style.display = 'none';
        ui.fileCount.innerHTML = `<strong>${list.length}</strong> files`;
    }

    // Archive Count (calculate from full list)
    const totalArchived = appState.dashboards.filter(d => appState.userState[d.id]?.is_archived).length;
    ui.archiveBtn.innerHTML = appState.showingArchive
        ? "⬅ Back to Inbox"
        : `📦 View Archive (${totalArchived})`;
}

function renderList(items, container) {
    container.innerHTML = "";
    items.forEach(item => {
        const state = appState.userState[item.id] || {};
        const isRead = state.is_read;
        const isArchived = state.is_archived;

        const li = document.createElement("li");
        li.className = "file-item" + (isRead ? " read" : "");
        li.setAttribute('data-id', item.id);

        li.innerHTML = `
             <div class="file-item-header">
                <p class="file-item-title">${item.title}</p>
            </div>
            <div class="file-item-meta">
                <span class="file-filename">${item.id}</span>
                <span class="file-date">${new Date(item.updated_at).toLocaleDateString()}</span>
            </div>
             <div class="archive-checkbox-container">
                <input type="checkbox" class="archive-checkbox" ${isArchived ? "checked" : ""}>
                <label class="archive-label">Archived</label>
            </div>
        `;

        const checkbox = li.querySelector('.archive-checkbox');
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            markAsArchived(item.id, e.target.checked);
        });

        // Block click on label from triggering item load
        li.querySelector('.archive-label').addEventListener('click', (e) => e.stopPropagation());

        li.addEventListener('click', (e) => {
            if (e.target !== checkbox && e.target.tagName !== 'LABEL') {
                loadDashboardContent(item.id);
            }
        });

        container.appendChild(li);
    });
}


// --- INIT ---

// Bind Default Listeners - Ensures button works even if Supabase/Auth fails
ui.authBtn.addEventListener('click', () => {
    // If we have a user, handleSignOut is attached by updateAuthUI. 
    // If not, this default handler opens the modal.
    // However, updateAuthUI overwrites onclick.
    // We set this as a fallback.
    ui.loginModal.style.display = "flex";
});

ui.archiveBtn.addEventListener('click', () => {
    appState.showingArchive = !appState.showingArchive;
    render();
    if (appState.showingArchive) {
        ui.emptyStateMain.style.display = "none";
        ui.contentIframe.style.display = "none";
        ui.archiveView.style.display = "block";
        ui.archiveView.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
                <h3>Archive View</h3>
                <p>Select an item from the sidebar to view it.</p>
            </div>
        `;
    } else {
        ui.archiveView.style.display = "none";
        ui.emptyStateMain.style.display = "flex";
    }
});

ui.sendMagicLinkBtn.addEventListener('click', handleLogin);
window.addEventListener('click', (e) => {
    if (e.target == ui.loginModal) ui.loginModal.style.display = "none";
});


// Boot
if (supabase) {
    fetchDashboards();
    checkUser();

    // Realtime Subscription
    supabase.channel('public:dashboards')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboards' }, payload => {
            console.log('Change received!', payload);
            fetchDashboards();
        })
        .subscribe();
} else {
    // Graceful degradation
    ui.fileCount.innerHTML = "Offline Mode (Config Error)";
    ui.authBtn.style.opacity = "0.5";
    ui.authBtn.textContent = "Auth Unavailable";
}
