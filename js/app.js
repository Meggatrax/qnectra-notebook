console.log("🚀 script loaded"); // Immediate check

// Initialize Supabase Client
const SUPABASE_URL = "https://ysfejltspyzpahqeorgt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_topKCVKmrlcOXV28eij8eA_h4b67cF4";

let supabase;

// --- STATE ---
let appState = {
    dashboards: [],
    userState: {},
    user: null,
    showingArchive: false
};

// --- DOM ELEMENTS CONTAINER ---
let ui = {};

// --- MAIN INIT ---
document.addEventListener("DOMContentLoaded", () => {
    console.log("⚡ DOM Content Loaded");

    // 1. Bind Elements
    ui = {
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

    // 2. Validate Elements
    for (const [key, element] of Object.entries(ui)) {
        if (!element) {
            console.error(`❌ Missing UI element: ${key}`);
        } else {
            console.log(`✅ Found: ${key}`);
        }
    }

    // 3. Bind Listeners
    if (ui.authBtn) {
        console.log("Bind: Listeners attached to authBtn");
        ui.authBtn.addEventListener('click', handleAuthClick);
    }

    if (ui.archiveBtn) {
        ui.archiveBtn.addEventListener('click', toggleArchiveView);
    }

    if (ui.sendMagicLinkBtn) {
        ui.sendMagicLinkBtn.addEventListener('click', handleLogin);
    }

    if (ui.loginModal) {
        window.addEventListener('click', (e) => {
            if (e.target == ui.loginModal) ui.loginModal.style.display = "none";
        });
    }

    // 4. Init Supabase
    initSupabase();
});


// --- FUNCTIONS ---

function initSupabase() {
    try {
        if (window.supabase) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log("✅ Supabase initialized");

            // Start App Flow
            fetchDashboards();
            checkUser();
            subscribeToChanges();
        } else {
            console.error("❌ Supabase SDK not loaded from CDN");
            if (ui.fileCount) ui.fileCount.textContent = "Error: SDK Missing";
        }
    } catch (e) {
        console.error("❌ Supabase init failed", e);
    }
}

async function checkUser() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        appState.user = data.session?.user || null;
        console.log(`👤 User Status: ${appState.user ? "Logged In" : "Guest"}`);
    } catch (e) {
        console.warn("Auth check warning", e);
    }
    updateAuthUI();
    if (appState.user) {
        await fetchUserStates();
        render();
    }
}

function updateAuthUI() {
    if (!ui.authBtn) return;
    if (appState.user) {
        ui.authBtn.textContent = "Sign Out";
    } else {
        ui.authBtn.textContent = "Sign In (Sync)";
    }
}

function handleAuthClick(e) {
    console.log("🖱️ Auth button clicked", e);
    if (appState.user) {
        handleSignOut();
    } else {
        console.log("Opening modal...");
        if (ui.loginModal) ui.loginModal.style.display = "flex";
    }
}

function toggleArchiveView() {
    console.log("Toggling archive view");
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
}

async function handleLogin() {
    if (!ui.emailInput) return;
    const email = ui.emailInput.value;
    console.log("Attempting login for:", email);

    if (!email) {
        ui.loginStatus.textContent = "Please enter an email.";
        return;
    }

    ui.loginStatus.textContent = "Sending link...";
    const { error } = await supabase.auth.signInWithOtp({ email });

    if (error) {
        console.error("Login error", error);
        ui.loginStatus.textContent = "Error: " + error.message;
        ui.loginStatus.style.color = "red";
    } else {
        console.log("Magic link sent");
        ui.loginStatus.textContent = "Magic link sent! Check your email.";
        ui.loginStatus.style.color = "#4ade80";
    }
}

async function handleSignOut() {
    console.log("Signing out");
    await supabase.auth.signOut();
    appState.user = null;
    appState.userState = {};
    updateAuthUI();
    render();
}

async function fetchDashboards() {
    if (!supabase) return;
    ui.fileCount.innerHTML = "Loading...";

    const { data: dashboards, error } = await supabase
        .from('dashboards')
        .select('id, title, updated_at')
        .order('updated_at', { ascending: false });

    if (error) {
        console.error("Error fetching dashboards", error);
        ui.fileCount.innerHTML = "Sync Error";
        return;
    }

    console.log(`📡 Fetched ${dashboards.length} dashboards`);
    appState.dashboards = dashboards;
    render();
}

async function fetchUserStates() {
    if (!appState.user || !supabase) return;
    const { data: states } = await supabase
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

function subscribeToChanges() {
    supabase.channel('public:dashboards')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboards' }, () => {
            console.log("Realtime update received");
            fetchDashboards();
        })
        .subscribe();
}

// --- CORE RENDERING ---

function render() {
    const list = appState.dashboards.filter(d => {
        const state = appState.userState[d.id];
        const isArchived = state?.is_archived || false;
        return appState.showingArchive ? isArchived : !isArchived;
    });

    renderList(list, ui.fileList);

    if (list.length === 0) {
        ui.fileList.style.display = 'none';
        ui.emptyStateSidebar.style.display = 'block';
    } else {
        ui.fileList.style.display = 'flex';
        ui.emptyStateSidebar.style.display = 'none';
        ui.fileCount.innerHTML = `<strong>${list.length}</strong> files`;
    }

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

        li.querySelector('.archive-label').addEventListener('click', (e) => e.stopPropagation());

        li.addEventListener('click', (e) => {
            if (e.target !== checkbox && e.target.tagName !== 'LABEL') {
                loadDashboardContent(item.id);
            }
        });

        container.appendChild(li);
    });
}

async function loadDashboardContent(id) {
    if (!supabase) return;
    console.log("Loading content for", id);
    const { data } = await supabase.from('dashboards').select('content, title').eq('id', id).single();

    if (data) {
        ui.contentTitle.textContent = data.title;
        const doc = ui.contentIframe.contentWindow.document;
        doc.open();
        doc.write(data.content);
        doc.close();

        ui.contentIframe.style.display = "block";
        ui.emptyStateMain.style.display = "none";
        ui.archiveView.style.display = "none";

        document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
        const activeEl = document.querySelector(`[data-id="${id}"]`);
        if (activeEl) activeEl.classList.add('active');

        if (appState.user) markAsRead(id);
    }
}

async function markAsArchived(id, isArchived) {
    if (!appState.user) {
        alert("Please sign in to sync archives.");
        render();
        return;
    }
    await supabase.from('user_states').upsert({
        user_id: appState.user.id,
        dashboard_id: id,
        is_archived: isArchived
    });
    // Optimistic update
    fetchUserStates().then(render);
}

async function markAsRead(id) {
    if (!supabase || !appState.user) return;
    await supabase.from('user_states').upsert({
        user_id: appState.user.id,
        dashboard_id: id,
        is_read: true
    });
    // Silent update
    fetchUserStates();
}
